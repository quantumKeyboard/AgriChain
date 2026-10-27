"""Scoring pipeline: raw transaction -> features -> hybrid score -> routing -> ledger."""

from __future__ import annotations

from datetime import datetime, timedelta

from sqlmodel import Session, or_, select

from app.chain import ledger
from app.ml.explain import explain
from app.ml.features import compute_features, history_from_records
from app.ml.scorer import score_one
from app.models import Assessment, Batch, LedgerEntry, Participant, Review, Transaction

DECISION_TO_STATUS = {"CLEAR": "COMMITTED", "FLAGGED": "FLAGGED"}


class PipelineError(ValueError):
    pass


def participant_dict(p: Participant) -> dict:
    return p.model_dump()


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


def assess(session: Session, tx: dict, with_explanation: bool = True) -> tuple[dict, dict]:
    seller = session.get(Participant, tx["seller_id"])
    buyer = session.get(Participant, tx["buyer_id"])
    if seller is None or buyer is None:
        raise PipelineError("Unknown seller or buyer id.")
    if seller.id == buyer.id:
        raise PipelineError("Seller and buyer must be different participants.")
    sd = participant_dict(seller)
    hist = history_from_records(tx, sd, history_records(session, tx))
    feats = compute_features(tx, sd, hist)
    result = score_one(tx, feats)
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


def ingest(
    session: Session,
    tx: dict,
    batch: dict | None = None,
    assessment: dict | None = None,
    with_explanation: bool = True,
    seal: bool = True,
    now: datetime | None = None,
) -> dict:
    """Persist a transaction with its assessment and route it (pool or quarantine)."""
    if session.get(Transaction, tx["id"]):
        raise PipelineError(f"Transaction {tx['id']} already exists.")
    if assessment is None:
        _, assessment = assess(session, tx, with_explanation)
    ensure_batch(session, tx, batch)
    session.add(Transaction(**tx))
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
    session.flush()
    if assessment["decision"] in DECISION_TO_STATUS:
        ledger.enqueue(
            session, tx["id"], DECISION_TO_STATUS[assessment["decision"]], now=now or tx["timestamp"]
        )
    session.commit()
    sealed = ledger.seal_pending(session, now=now) if seal else []
    return {
        "tx_id": tx["id"],
        **{k: v for k, v in assessment.items() if k != "features"},
        "sealed_blocks": [b.index for b in sealed],
    }


def review(
    session: Session, tx_id: str, action: str, note: str, now: datetime | None = None, seal: bool = True
) -> dict:
    a = session.get(Assessment, tx_id)
    if a is None or a.decision != "QUARANTINED":
        raise PipelineError("Transaction is not in quarantine.")
    if session.get(Review, tx_id):
        raise PipelineError("Transaction was already reviewed.")
    status = "APPROVED" if action == "approve" else "REJECTED"
    session.add(Review(tx_id=tx_id, action=status, note=note, reviewed_at=now or datetime.now()))
    ledger.enqueue(session, tx_id, status, now=now)
    session.commit()
    sealed = ledger.seal_pending(session, force=True, now=now) if seal else []
    return {"tx_id": tx_id, "status": status, "sealed_blocks": [b.index for b in sealed]}


def ledger_info(session: Session, tx_id: str) -> dict:
    e = session.get(LedgerEntry, tx_id)
    r = session.get(Review, tx_id)
    return {
        "ledger_status": e.status if e else ("PENDING_REVIEW" if not r else r.action),
        "block_index": e.block_index if e else None,
        "tx_hash": e.tx_hash if e and e.tx_hash else None,
        "review": r.model_dump() if r else None,
    }
