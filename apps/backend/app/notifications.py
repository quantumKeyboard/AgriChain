"""Live Chain Notifications Engine.

Dispatches and tracks chain-aware event notifications to all affected participants
and compliance auditors along the agricultural supply-chain ledger.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlmodel import Session, col, desc, select

from app.models import Batch, BatchLineage, ChainNotification, Transfer


def create_notification(
    session: Session,
    recipient_id: str,
    title: str,
    message: str,
    category: str = "LIFECYCLE",
    severity: str = "INFO",
    batch_id: str | None = None,
    tx_id: str | None = None,
    role: str | None = None,
    created_at: datetime | None = None,
) -> ChainNotification:
    """Create and persist a single notification record."""
    notif = ChainNotification(
        id=f"NOTIF-{uuid.uuid4().hex[:10].upper()}",
        recipient_id=recipient_id,
        role=role,
        batch_id=batch_id,
        tx_id=tx_id,
        title=title,
        message=message,
        category=category,
        severity=severity,
        read=False,
        created_at=created_at or datetime.now().replace(microsecond=0),
    )
    session.add(notif)
    return notif


def get_affected_participants_for_batch(session: Session, batch_id: str) -> set[str]:
    """Find all participant IDs who have a cryptographic stake or custody history in this batch or its lineage."""
    affected: set[str] = set()

    batch = session.get(Batch, batch_id)
    if batch:
        if batch.origin_farmer_id:
            affected.add(batch.origin_farmer_id)
        if batch.current_holder_id:
            affected.add(batch.current_holder_id)

    # Check transfers for this batch
    transfers = session.exec(select(Transfer).where(Transfer.batch_id == batch_id)).all()
    for trf in transfers:
        if trf.sender_id:
            affected.add(trf.sender_id)
        if trf.receiver_id:
            affected.add(trf.receiver_id)

    # Check if this batch is a child lot (lineage)
    lineages = session.exec(select(BatchLineage).where(BatchLineage.child_batch_id == batch_id)).all()
    for lin in lineages:
        parent_batch = session.get(Batch, lin.parent_batch_id)
        if parent_batch and parent_batch.origin_farmer_id:
            affected.add(parent_batch.origin_farmer_id)

    # Check if this batch is a parent lot
    child_lineages = session.exec(select(BatchLineage).where(BatchLineage.parent_batch_id == batch_id)).all()
    for clin in child_lineages:
        child_batch = session.get(Batch, clin.child_batch_id)
        if child_batch and child_batch.current_holder_id:
            affected.add(child_batch.current_holder_id)

    return affected


def notify_chain_affected(
    session: Session,
    batch_id: str | None,
    title: str,
    message: str,
    category: str = "LIFECYCLE",
    severity: str = "INFO",
    tx_id: str | None = None,
    extra_recipient_ids: list[str] | None = None,
    notify_auditors: bool = False,
    created_at: datetime | None = None,
) -> list[ChainNotification]:
    """Broadcast an update to all participants affected by this batch, plus auditors if requested."""
    recipients: set[str] = set(extra_recipient_ids or [])

    if batch_id:
        recipients.update(get_affected_participants_for_batch(session, batch_id))

    created_notifs: list[ChainNotification] = []
    ts = created_at or datetime.now().replace(microsecond=0)

    for pid in recipients:
        if not pid:
            continue
        notif = create_notification(
            session=session,
            recipient_id=pid,
            title=title,
            message=message,
            category=category,
            severity=severity,
            batch_id=batch_id,
            tx_id=tx_id,
            created_at=ts,
        )
        created_notifs.append(notif)

    if notify_auditors:
        # Also notify administrative/compliance tower
        admin_notif = create_notification(
            session=session,
            recipient_id="ALL_ADMINS",
            title=title,
            message=message,
            category=category,
            severity=severity,
            batch_id=batch_id,
            tx_id=tx_id,
            role="AUDITOR",
            created_at=ts,
        )
        created_notifs.append(admin_notif)

    return created_notifs


def query_notifications_for_user(
    session: Session,
    participant_id: str | None = None,
    role: str | None = None,
    unread_only: bool = False,
    limit: int = 50,
) -> tuple[list[ChainNotification], int]:
    """Fetch notifications relevant to the active user role/participant ID, plus total unread count."""
    query = select(ChainNotification)

    is_admin_or_auditor = role in ("ADMIN", "AUDITOR")

    if is_admin_or_auditor:
        # Admins & Auditors see system-wide alerts, auditor role alerts, and their own
        if participant_id:
            query = query.where(
                col(ChainNotification.recipient_id).in_([participant_id, "ALL_ADMINS", "BROADCAST"])
                | (ChainNotification.role.in_(["ADMIN", "AUDITOR"]))
            )
        else:
            query = query.where(
                col(ChainNotification.recipient_id).in_(["ALL_ADMINS", "BROADCAST"])
                | (ChainNotification.role.in_(["ADMIN", "AUDITOR"]))
            )
    else:
        # Supply-chain participants see their specific notifications or broadcasts
        if participant_id:
            query = query.where(
                col(ChainNotification.recipient_id).in_([participant_id, "BROADCAST"])
                | (ChainNotification.role == role)
            )
        elif role:
            query = query.where(
                (ChainNotification.role == role) | (ChainNotification.recipient_id == "BROADCAST")
            )

    all_matching = session.exec(query.order_by(desc(ChainNotification.created_at))).all()
    unread_count = sum(1 for n in all_matching if not n.read)

    if unread_only:
        filtered = [n for n in all_matching if not n.read]
    else:
        filtered = all_matching

    return filtered[:limit], unread_count
