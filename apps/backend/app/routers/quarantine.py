from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, col, select

from app.db import get_session
from app.models import Assessment, Review, Transaction
from app.schemas import DecisionIn
from app.services import PipelineError, review
from app.views import load_views

router = APIRouter(prefix="/api/quarantine", tags=["quarantine"])


@router.get("")
def queue(session: Session = Depends(get_session)) -> dict:
    reviewed = {r.tx_id for r in session.exec(select(Review)).all()}
    q = (
        select(Transaction)
        .join(Assessment, Assessment.tx_id == Transaction.id)
        .where(Assessment.decision == "QUARANTINED")
        .order_by(col(Transaction.timestamp).desc())
    )
    all_q = list(session.exec(q).all())
    open_items = [t for t in all_q if t.id not in reviewed]
    recent = [t for t in all_q if t.id in reviewed][:15]
    return {"open": load_views(session, open_items, full=True), "reviewed": load_views(session, recent)}


@router.post("/{tx_id}/decision")
def decide(tx_id: str, body: DecisionIn, session: Session = Depends(get_session)) -> dict:
    try:
        return review(session, tx_id, body.action, body.note)
    except PipelineError as e:
        raise HTTPException(409, str(e)) from e
