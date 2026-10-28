from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, col, select

from app.chain import identity
from app.db import get_session
from app.ml.features import FEATURE_LABELS
from app.models import Assessment, Review, Transaction
from app.schemas import TransactionIn
from app.services import PipelineError, assess, ingest
from app.sim.generator import FRAUD_LABELS, reference_price
from app.sim.state import get_sim
from app.views import load_views

router = APIRouter(prefix="/api/transactions", tags=["transactions"])


def to_raw(body: TransactionIn) -> tuple[dict, dict | None]:
    data = body.model_dump(exclude={"batch", "forge_signature"})
    data["id"] = data["id"] or get_sim()._new_id("TX")
    data["timestamp"] = data["timestamp"] or datetime.now()
    if data["ref_price"] is None:
        data["ref_price"] = reference_price(data["crop"], data["stage"], data["timestamp"])
    data["total_value"] = round(data["quantity_kg"] * data["unit_price"], 2)
    data["sim_label"] = None
    if body.forge_signature:
        # Someone other than the seller signs the invoice (identity spoofing demo).
        data["signature"] = identity.sign(data, forger_for(data["seller_id"]))
    return data, body.batch.model_dump() if body.batch else None


def forger_for(seller_id: str) -> str:
    return "D-001" if seller_id != "D-001" else "D-002"


def present(result: dict) -> dict:
    result["pred_label"] = FRAUD_LABELS.get(result["pred_type"], result["pred_type"])
    for item in result.get("shap_top") or []:
        item.setdefault("label", FEATURE_LABELS.get(item["feature"], item["feature"]))
    return result


@router.post("/score")
def score(body: TransactionIn, session: Session = Depends(get_session)) -> dict:
    """Dry run: score a transaction without recording it."""
    tx, _ = to_raw(body)
    try:
        _, result = assess(session, tx)
    except PipelineError as e:
        raise HTTPException(422, str(e)) from e
    result.pop("features", None)
    return present(
        {**result, "tx_id": tx["id"], "total_value": tx["total_value"], "ref_price": tx["ref_price"]}
    )


@router.post("")
def submit(body: TransactionIn, session: Session = Depends(get_session)) -> dict:
    tx, batch = to_raw(body)
    try:
        result = ingest(session, tx, batch=batch)
    except PipelineError as e:
        raise HTTPException(422, str(e)) from e
    return present(result)


@router.get("")
def list_transactions(
    decision: str | None = None,
    ledger_status: str | None = None,
    batch_id: str | None = None,
    pred_type: str | None = None,
    limit: int = 50,
    session: Session = Depends(get_session),
) -> list[dict]:
    q = select(Transaction).join(Assessment, Assessment.tx_id == Transaction.id)
    if decision:
        q = q.where(Assessment.decision == decision)
    if pred_type:
        q = q.where(Assessment.pred_type == pred_type)
    if batch_id:
        q = q.where(Transaction.batch_id == batch_id)
    if ledger_status == "REJECTED":
        q = q.join(Review, Review.tx_id == Transaction.id).where(Review.action == "REJECTED")
    q = q.order_by(col(Transaction.timestamp).desc()).limit(min(limit, 500))
    return load_views(session, list(session.exec(q).all()))


@router.get("/{tx_id}")
def get_transaction(tx_id: str, session: Session = Depends(get_session)) -> dict:
    tx = session.get(Transaction, tx_id)
    if not tx:
        raise HTTPException(404, "Transaction not found")
    return load_views(session, [tx], full=True)[0]
