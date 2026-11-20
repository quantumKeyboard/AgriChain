"""Supply Chain Participant Portal Endpoints."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, col, desc, select

from app.auth import DEFAULT_DEMO_USERS, require_participant, resolve_user
from app.chain import identity
from app.db import get_session
from app.models import Batch, Participant, Transaction, Transfer

router = APIRouter(prefix="/api/participant", tags=["participant"])


@router.get("/users")
def list_demo_users() -> list[dict]:
    """List available simulated user profiles to easily switch roles in the UI."""
    return DEFAULT_DEMO_USERS


@router.get("/dashboard")
def get_participant_dashboard(
    user: Annotated[dict, Depends(require_participant)],
    session: Session = Depends(get_session),
) -> dict:
    """Personalized operational metrics for the authenticated supply chain participant."""
    pid = user["participant_id"]
    if not pid:
        raise HTTPException(400, "No participant associated with this profile.")

    p = session.get(Participant, pid)
    role = p.role if p else user["role"]

    # Participant's batches
    my_batches = list(
        session.exec(
            select(Batch).where(
                (Batch.current_holder_id == pid) | (Batch.origin_farmer_id == pid)
            )
        ).all()
    )

    # Incoming & Outgoing transfers
    incoming = list(session.exec(select(Transfer).where(Transfer.receiver_id == pid)).all())
    outgoing = list(session.exec(select(Transfer).where(Transfer.sender_id == pid)).all())

    pending_inward = [t for t in incoming if t.status == "IN_TRANSIT"]
    disputed_transfers = [t for t in (incoming + outgoing) if t.status == "DISPUTED"]

    # Participant transactions
    my_txs = list(
        session.exec(
            select(Transaction).where(
                (Transaction.seller_id == pid) | (Transaction.buyer_id == pid)
            )
        ).all()
    )

    return {
        "participant": p.model_dump() if p else None,
        "role": role,
        "active_batches_count": sum(1 for b in my_batches if b.status in {"ACTIVE", "IN_TRANSIT"}),
        "pending_inward_transfers": len(pending_inward),
        "total_dispatches": len(outgoing),
        "disputed_transfers_count": len(disputed_transfers),
        "completed_transactions": len(my_txs),
        "recent_incoming": [t.model_dump() for t in incoming[-6:]],
        "recent_outgoing": [t.model_dump() for t in outgoing[-6:]],
    }


@router.get("/batches")
def get_my_batches(
    user: Annotated[dict, Depends(require_participant)],
    session: Session = Depends(get_session),
) -> list[dict]:
    """List batches owned, originated, or currently held by the participant."""
    pid = user["participant_id"]
    q = select(Batch).where(
        (Batch.current_holder_id == pid) | (Batch.origin_farmer_id == pid)
    ).order_by(desc(Batch.harvest_date))
    batches = list(session.exec(q).all())
    return [b.model_dump() for b in batches]


@router.get("/transfers/incoming")
def get_incoming_transfers(
    user: Annotated[dict, Depends(require_participant)],
    session: Session = Depends(get_session),
) -> list[dict]:
    pid = user["participant_id"]
    transfers = list(
        session.exec(
            select(Transfer)
            .where(Transfer.receiver_id == pid)
            .order_by(desc(Transfer.dispatched_at))
        ).all()
    )
    # Enrich with sender name
    people = {p.id: p.name for p in session.exec(select(Participant)).all()}
    return [{**t.model_dump(), "sender_name": people.get(t.sender_id, t.sender_id)} for t in transfers]


@router.get("/transfers/outgoing")
def get_outgoing_transfers(
    user: Annotated[dict, Depends(require_participant)],
    session: Session = Depends(get_session),
) -> list[dict]:
    pid = user["participant_id"]
    transfers = list(
        session.exec(
            select(Transfer)
            .where(Transfer.sender_id == pid)
            .order_by(desc(Transfer.dispatched_at))
        ).all()
    )
    people = {p.id: p.name for p in session.exec(select(Participant)).all()}
    return [{**t.model_dump(), "receiver_name": people.get(t.receiver_id, t.receiver_id)} for t in transfers]


@router.get("/identity")
def get_digital_identity(
    user: Annotated[dict, Depends(resolve_user)],
    session: Session = Depends(get_session),
) -> dict:
    pid = user.get("participant_id")
    p = session.get(Participant, pid) if pid else None
    pubkey = p.public_key if p else (identity.public_key_hex(pid) if pid else "")
    return {
        "user_id": user["id"],
        "username": user["username"],
        "name": user["name"],
        "role": user["role"],
        "participant_id": pid,
        "public_key": pubkey,
        "algorithm": "Ed25519",
        "key_status": "VALID_REGISTERED" if pubkey else "UNREGISTERED",
    }
