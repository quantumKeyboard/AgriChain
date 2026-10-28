"""Scoring pipeline: raw transaction -> features -> hybrid score -> AgriChainLedger smart contract.

1. The seller's EIP-712 invoice signature is checked off-chain (the contract checks it again).
2. The ML engine scores the transaction.
3. The ML oracle account records it on-chain with its decision; quarantined ones are recorded as
   PendingReview. Invoices with an invalid signature never reach the chain (the contract would
   reject them) and wait in quarantine off-chain.
4. Auditor verdicts are sent on-chain by the auditor account.
"""

from __future__ import annotations

from datetime import datetime, timedelta

from sqlmodel import Session, or_, select

from app.chain import identity
from app.chain.ethereum import Chain, ChainRevert, get_chain
from app.ml.explain import explain
from app.ml.features import compute_features, history_from_records
from app.ml.scorer import score_one
from app.models import Assessment, Batch, LedgerEntry, Participant, Review, Transaction
from app.sim.generator import FRAUD_TYPES

STATUS_FOR_DECISION = {"CLEAR": "COMMITTED", "FLAGGED": "FLAGGED", "QUARANTINED": "PENDING_REVIEW"}


class PipelineError(ValueError):
    pass


def fraud_code(pred_type: str) -> int:
    """On-chain fraud type: 0 = none, 1-6 = FRAUD_TYPES order."""
    return FRAUD_TYPES.index(pred_type) + 1 if pred_type in FRAUD_TYPES else 0


def history_records(session: Session, tx: dict) -> list[dict]:
    """Earlier tx of the same batch + the seller's tx in the previous 7 days (see features.py contract)."""
    ts = tx["timestamp"]
    rows = session.exec(
        select(Transaction).where(
            Transaction.timestamp <= ts,
            or_(
                Transaction.batch_id == tx["batch_id"],
                (Transaction.seller_id == tx["seller_id"])
                & (Transaction.timestamp >= ts - timedelta(days=7)),
            ),
        )
    ).all()
    return [r.model_dump() for r in rows]


def assess(
    session: Session, tx: dict, with_explanation: bool = True, chain: Chain | None = None
) -> tuple[dict, dict]:
    chain = chain or get_chain()
    seller = session.get(Participant, tx["seller_id"])
    buyer = session.get(Participant, tx["buyer_id"])
    if seller is None or buyer is None:
        raise PipelineError("Unknown seller or buyer id.")
    if seller.id == buyer.id:
        raise PipelineError("Seller and buyer must be different participants.")
    if not tx.get("signature"):
        # Demo custody: the platform signs on the seller's behalf (see identity.py).
        tx["signature"] = identity.sign_invoice(tx, seller.id, chain.domain())
    signature_valid = identity.verify_invoice(tx, tx["signature"], chain.domain())
    sd = seller.model_dump()
    hist = history_from_records(tx, sd, history_records(session, tx))
    feats = compute_features(tx, sd, hist)
    result = score_one({**tx, "signature_valid": signature_valid}, feats)
    result["signature_valid"] = signature_valid
    result["shap_top"] = explain(feats) if with_explanation else None
    result["features"] = feats
    return feats, result


def ensure_batch(session: Session, tx: dict, batch: dict | None) -> None:
    if session.get(Batch, tx["batch_id"]):
        return
    seller = session.get(Participant, tx["seller_id"])
    data = batch or {
        "id": tx["batch_id"],
        "crop": tx["crop"],
        "origin_farmer_id": tx["seller_id"] if seller and seller.role == "FARMER" else "UNKNOWN",
        "harvest_date": tx["timestamp"] - timedelta(days=3),
        "organic_claimed": tx["organic_claimed"],
        "organic_cert_valid": tx["organic_cert_valid"],
        "region": seller.region if seller else "Unknown",
    }
    session.add(Batch(**data))


def store(session: Session, tx: dict, assessment: dict, batch: dict | None, now: datetime | None) -> None:
    """Persist the off-chain copy (full invoice data + assessment). Does not commit."""
    ensure_batch(session, tx, batch)
    session.add(Transaction(**{k: v for k, v in tx.items() if k != "signature_valid"}))
    session.add(
        Assessment(
            tx_id=tx["id"],
            risk=assessment["risk"],
            p_fraud=assessment["p_fraud"],
            rule_score=assessment["rule_score"],
            anomaly_score=assessment["anomaly_score"],
            pred_type=assessment["pred_type"],
            decision=assessment["decision"],
            rule_hits=assessment["rule_hits"],
            type_probs=assessment["type_probs"],
            shap_top=assessment.get("shap_top"),
            features=assessment["features"],
            model_version=assessment["model_version"],
            created_at=now or datetime.now(),
        )
    )


def ingest(
    session: Session,
    tx: dict,
    batch: dict | None = None,
    assessment: dict | None = None,
    with_explanation: bool = True,
    now: datetime | None = None,
    chain: Chain | None = None,
) -> dict:
    """Score a transaction and record it in the AgriChainLedger contract."""
    chain = chain or get_chain()
    if session.get(Transaction, tx["id"]):
        raise PipelineError(f"Transaction {tx['id']} already exists.")
    if assessment is None:
        _, assessment = assess(session, tx, with_explanation, chain)
    on_chain = None
    if assessment.get("signature_valid", True):
        try:
            rcpt = chain.record(tx, tx["signature"], assessment, fraud_code(assessment["pred_type"]))
        except ChainRevert as e:
            raise PipelineError(f"The smart contract rejected the transaction: {e}") from e
        on_chain = {"tx_hash": rcpt.tx_hash, "block": rcpt.block, "gas_used": rcpt.gas_used}
    store(session, tx, assessment, batch, now)
    session.flush()
    if on_chain:
        session.add(
            LedgerEntry(
                tx_id=tx["id"],
                status=STATUS_FOR_DECISION[assessment["decision"]],
                record_tx_hash=on_chain["tx_hash"],
                record_block=on_chain["block"],
            )
        )
    session.commit()
    return {
        "tx_id": tx["id"],
        **{k: v for k, v in assessment.items() if k != "features"},
        "signature": tx["signature"],
        "on_chain": on_chain,
    }


def review(
    session: Session,
    tx_id: str,
    action: str,
    note: str,
    now: datetime | None = None,
    chain: Chain | None = None,
) -> dict:
    """Auditor verdict, sent on-chain by the auditor account."""
    chain = chain or get_chain()
    a = session.get(Assessment, tx_id)
    if a is None or a.decision != "QUARANTINED":
        raise PipelineError("Transaction is not in quarantine.")
    if session.get(Review, tx_id):
        raise PipelineError("Transaction was already reviewed.")
    status = "APPROVED" if action == "approve" else "REJECTED"
    entry = session.get(LedgerEntry, tx_id)
    on_chain = None
    if entry is None:
        # Never reached the chain: its seller signature is invalid.
        if action == "approve":
            tx = session.get(Transaction, tx_id)
            try:
                chain.record(tx, tx.signature, {**a.model_dump(), "decision": "CLEAR"}, 0)
            except ChainRevert as e:
                raise PipelineError(
                    f"Cannot approve: the smart contract refuses this invoice — {e}. "
                    "Only the real seller's signature is accepted. Reject it instead."
                ) from e
    else:
        rcpt = chain.resolve(tx_id, action == "approve", note)
        entry.status = status
        entry.verdict_tx_hash, entry.verdict_block = rcpt.tx_hash, rcpt.block
        on_chain = {"tx_hash": rcpt.tx_hash, "block": rcpt.block}
    session.add(Review(tx_id=tx_id, action=status, note=note, reviewed_at=now or datetime.now()))
    session.commit()
    return {"tx_id": tx_id, "status": status, "on_chain": on_chain}
