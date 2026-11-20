"""Authentication and Role-Based Access Control (RBAC)."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Header, HTTPException, Query, status
from sqlmodel import Session, select

from app.db import get_session
from app.models import Participant, UserAccount

DEFAULT_DEMO_USERS = [
    {
        "id": "USR-ADMIN",
        "username": "admin",
        "name": "Alex Vance (SuperAdmin)",
        "email": "admin@agrichain.sentinel",
        "role": "ADMIN",
        "participant_id": None,
    },
    {
        "id": "USR-AUDITOR",
        "username": "auditor",
        "name": "Dr. Sunita Sharma (Chief Auditor)",
        "email": "auditor@agrichain.sentinel",
        "role": "AUDITOR",
        "participant_id": None,
    },
    {
        "id": "USR-FARMER-1",
        "username": "farmer_ramesh",
        "name": "Ramesh Patil (Kisan Farm)",
        "email": "ramesh@kisanfarm.in",
        "role": "FARMER",
        "participant_id": "F-001",
    },
    {
        "id": "USR-COOP-1",
        "username": "coop_solapur",
        "name": "Solapur Agro-Cooperative Society",
        "email": "procurement@solapuragro.org",
        "role": "COOP",
        "participant_id": "C-001",
    },
    {
        "id": "USR-PROC-1",
        "username": "processor_agropack",
        "name": "AgroPack Foods & Purees Pvt Ltd",
        "email": "operations@agropack.com",
        "role": "PROCESSOR",
        "participant_id": "P-001",
    },
    {
        "id": "USR-DIST-1",
        "username": "distributor_coldtrans",
        "name": "ColdTrans Logistics & Cold Chain",
        "email": "dispatch@coldtrans.in",
        "role": "DISTRIBUTOR",
        "participant_id": "D-001",
    },
    {
        "id": "USR-RET-1",
        "username": "retailer_bigbasket",
        "name": "FreshMart Retail Organics",
        "email": "inward@freshmart.in",
        "role": "RETAILER",
        "participant_id": "R-001",
    },
]


def resolve_user(
    x_user_role: str | None = Header(None, alias="X-User-Role"),
    x_participant_id: str | None = Header(None, alias="X-Participant-Id"),
    user_param: str | None = Query(None, alias="as_user"),
    session: Session = Depends(get_session),
) -> dict:
    """Resolve the authenticated user from headers or query parameters."""
    # 1. Query param override (great for testing and demo deep links)
    chosen_role = (x_user_role or user_param or "ADMIN").upper()

    # Find matching demo profile
    profile = next((u for u in DEFAULT_DEMO_USERS if u["role"] == chosen_role), None)
    if profile is None:
        profile = DEFAULT_DEMO_USERS[0]  # Fallback to Admin

    # Override participant_id if explicitly specified
    pid = x_participant_id or profile["participant_id"]

    # If participant is present, fetch registered participant details
    participant_data = None
    if pid:
        p = session.get(Participant, pid)
        if p:
            participant_data = p.model_dump()

    return {
        "id": profile["id"],
        "username": profile["username"],
        "name": profile["name"],
        "email": profile["email"],
        "role": profile["role"],
        "participant_id": pid,
        "participant": participant_data,
        "is_admin": profile["role"] in {"ADMIN", "AUDITOR"},
        "is_auditor": profile["role"] == "AUDITOR",
    }


def require_admin(user: Annotated[dict, Depends(resolve_user)]) -> dict:
    if not user["is_admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Access denied: Role '{user['role']}' does not have administrative privileges.",
        )
    return user


def require_auditor(user: Annotated[dict, Depends(resolve_user)]) -> dict:
    if not (user["is_auditor"] or user["role"] == "ADMIN"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: Only certified compliance auditors can review quarantined transactions.",
        )
    return user


def require_participant(user: Annotated[dict, Depends(resolve_user)]) -> dict:
    if not user["participant_id"] and not user["is_admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: User is not associated with an authorized supply chain participant.",
        )
    return user
