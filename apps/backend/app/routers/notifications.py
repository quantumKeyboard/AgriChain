"""API endpoints for Live Chain Notifications."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, col, select

from app.db import get_session
from app.models import ChainNotification
from app.notifications import query_notifications_for_user

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


@router.get("")
def get_notifications(
    participant_id: str | None = Query(default=None),
    role: str | None = Query(default=None),
    unread_only: bool = Query(default=False),
    limit: int = Query(default=50, ge=1, le=100),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    """Retrieve live chain notifications filtered by user identity and involvement."""
    notifs, unread_count = query_notifications_for_user(
        session=session,
        participant_id=participant_id,
        role=role,
        unread_only=unread_only,
        limit=limit,
    )

    return {
        "total": len(notifs),
        "unread_count": unread_count,
        "notifications": [
            {
                "id": n.id,
                "recipient_id": n.recipient_id,
                "role": n.role,
                "batch_id": n.batch_id,
                "tx_id": n.tx_id,
                "title": n.title,
                "message": n.message,
                "category": n.category,
                "severity": n.severity,
                "read": n.read,
                "created_at": n.created_at.isoformat() if n.created_at else None,
            }
            for n in notifs
        ],
    }


@router.post("/{notification_id}/read")
def mark_notification_read(
    notification_id: str,
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    """Mark a specific chain notification as read."""
    notif = session.get(ChainNotification, notification_id)
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")

    notif.read = True
    session.add(notif)
    session.commit()
    return {"status": "ok", "id": notification_id, "read": True}


@router.post("/mark-all-read")
def mark_all_notifications_read(
    participant_id: str | None = Query(default=None),
    role: str | None = Query(default=None),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    """Mark all unread notifications for this participant/role as read."""
    notifs, _ = query_notifications_for_user(
        session=session,
        participant_id=participant_id,
        role=role,
        unread_only=True,
        limit=200,
    )

    for n in notifs:
        n.read = True
        session.add(n)

    session.commit()
    return {"status": "ok", "updated_count": len(notifs)}
