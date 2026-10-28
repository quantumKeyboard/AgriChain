"""Shape DB rows into API responses."""

from __future__ import annotations

from sqlmodel import Session, select

from app.chain import identity
from app.chain.ethereum import get_chain
from app.models import Assessment, LedgerEntry, Participant, Review, Transaction
from app.sim.generator import FRAUD_LABELS


def signature_ok(tx: Transaction) -> bool:
    """Does the seller's EIP-712 signature still match the stored invoice data?"""
    return identity.verify_invoice(tx, tx.signature, get_chain().domain())


def participants_map(session: Session) -> dict[str, Participant]:
    return {p.id: p for p in session.exec(select(Participant)).all()}


def tx_view(
    tx: Transaction,
    a: Assessment | None,
    people: dict[str, Participant],
    entry: LedgerEntry | None = None,
    rev: Review | None = None,
    full: bool = False,
) -> dict:
    seller, buyer = people.get(tx.seller_id), people.get(tx.buyer_id)
    out = tx.model_dump()
    out["seller_name"] = seller.name if seller else tx.seller_id
    out["buyer_name"] = buyer.name if buyer else tx.buyer_id
    out["seller_role"] = seller.role if seller else None
    out["buyer_role"] = buyer.role if buyer else None
    out["region"] = seller.region if seller else None
    out["seller_address"] = seller.address if seller else None
    out["data_hash"] = "0x" + identity.data_hash(tx).hex()
    out["signature_valid"] = signature_ok(tx)
    if a:
        out.update(
            {
                "risk": a.risk,
                "p_fraud": a.p_fraud,
                "rule_score": a.rule_score,
                "anomaly_score": a.anomaly_score,
                "pred_type": a.pred_type,
                "pred_label": FRAUD_LABELS.get(a.pred_type, a.pred_type),
                "decision": a.decision,
                "rule_hits": a.rule_hits,
                "model_version": a.model_version,
            }
        )
        if full:
            out.update({"shap_top": a.shap_top, "type_probs": a.type_probs, "features": a.features})
    if entry:
        status = entry.status
    elif rev:
        status = rev.action
    elif a and a.decision == "QUARANTINED":
        status = "PENDING_REVIEW"
    else:
        status = "PENDING"
    out["ledger_status"] = status
    # Where it lives on Ethereum (None = never recorded: the contract would reject its signature).
    out["on_chain"] = entry is not None
    out["block_number"] = entry.record_block if entry else None
    out["eth_tx_hash"] = entry.record_tx_hash if entry else None
    out["verdict_block"] = entry.verdict_block if entry else None
    out["verdict_tx_hash"] = entry.verdict_tx_hash if entry else None
    out["review"] = rev.model_dump() if rev else None
    out["sim_label_display"] = FRAUD_LABELS.get(tx.sim_label) if tx.sim_label else None
    return out


def load_views(session: Session, txs: list[Transaction], full: bool = False) -> list[dict]:
    if not txs:
        return []
    ids = [t.id for t in txs]
    people = participants_map(session)
    a_map = {a.tx_id: a for a in session.exec(select(Assessment).where(Assessment.tx_id.in_(ids))).all()}
    e_map = {e.tx_id: e for e in session.exec(select(LedgerEntry).where(LedgerEntry.tx_id.in_(ids))).all()}
    r_map = {r.tx_id: r for r in session.exec(select(Review).where(Review.tx_id.in_(ids))).all()}
    return [tx_view(t, a_map.get(t.id), people, e_map.get(t.id), r_map.get(t.id), full) for t in txs]
