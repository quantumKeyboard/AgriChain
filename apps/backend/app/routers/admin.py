"""Admin Control Tower Endpoints."""

from __future__ import annotations

from collections import Counter, defaultdict
from datetime import datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlmodel import Session, col, func, select

from app.auth import require_admin
from app.chain import ledger
from app.db import get_session
from app.models import Assessment, Batch, Block, EnvironmentalReading, LifecycleEvent, Participant, Transaction, Transfer
from app.sim.generator import FRAUD_LABELS

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/metrics")
def get_control_tower_metrics(
    user: Annotated[dict, Depends(require_admin)],
    session: Session = Depends(get_session),
) -> dict:
    total_batches = session.exec(select(func.count(Batch.id))).one()
    active_batches = session.exec(select(func.count(Batch.id)).where(Batch.status == "ACTIVE")).one()
    in_transit_batches = session.exec(select(func.count(Batch.id)).where(Batch.status == "IN_TRANSIT")).one()
    completed_lifecycles = session.exec(select(func.count(Batch.id)).where(Batch.status == "COMPLETED")).one()
    disputed_transfers = session.exec(select(func.count(Transfer.id)).where(Transfer.status == "DISPUTED")).one()

    total_tx = session.exec(select(func.count(Transaction.id))).one()
    flagged_tx = session.exec(
        select(func.count(Assessment.tx_id)).where(Assessment.decision == "FLAGGED")
    ).one()
    quarantined_tx = session.exec(
        select(func.count(Assessment.tx_id)).where(Assessment.decision == "QUARANTINED")
    ).one()

    # Cold chain incidents
    temp_breaches = session.exec(
        select(func.count(EnvironmentalReading.id)).where(EnvironmentalReading.breach_detected == True)  # noqa: E712
    ).one()

    # Blockchain blocks
    total_blocks = session.exec(select(func.count(Block.index))).one()

    # Ledger integrity
    try:
        verification = ledger.verify_chain(session)
        chain_valid = verification.get("valid", False)
    except Exception:
        chain_valid = False

    total_participants = session.exec(select(func.count(Participant.id))).one()

    return {
        "total_batches": total_batches,
        "active_batches": active_batches,
        "in_transit_batches": in_transit_batches,
        "completed_lifecycles": completed_lifecycles,
        "disputed_transfers": disputed_transfers,
        "total_transactions": total_tx,
        "flagged_transactions": flagged_tx,
        "quarantined_transactions": quarantined_tx,
        "cold_chain_breaches": temp_breaches,
        "total_blocks": total_blocks,
        "chain_valid": chain_valid,
        "total_participants": total_participants,
    }


@router.get("/stage-overview")
def get_stage_overview(
    user: Annotated[dict, Depends(require_admin)],
    session: Session = Depends(get_session),
) -> dict:
    """Stage-by-stage distribution of produce across the agricultural supply chain."""
    stages = ["FARMER", "COOP", "PROCESSOR", "DISTRIBUTOR", "RETAILER"]
    stage_data = []

    batches = list(session.exec(select(Batch)).all())
    txs = list(session.exec(select(Transaction, Assessment).join(Assessment, Assessment.tx_id == Transaction.id, isouter=True)).all())

    by_stage_batches = defaultdict(list)
    for b in batches:
        stg = b.current_stage.upper()
        if stg in stages:
            by_stage_batches[stg].append(b)

    for stg in stages:
        s_batches = by_stage_batches[stg]
        total_qty = sum(b.current_quantity_kg for b in s_batches)
        in_transit = sum(1 for b in s_batches if b.status == "IN_TRANSIT")
        disputed = sum(1 for b in s_batches if b.status == "DISPUTED")
        quarantined = sum(1 for b in s_batches if b.status == "QUARANTINED")

        stage_data.append(
            {
                "stage": stg,
                "batch_count": len(s_batches),
                "total_quantity_kg": round(total_qty, 1),
                "in_transit_count": in_transit,
                "disputed_count": disputed,
                "quarantined_count": quarantined,
                "batches": [
                    {
                        "id": b.id,
                        "crop": b.crop,
                        "variety": b.variety,
                        "quantity_kg": b.current_quantity_kg,
                        "status": b.status,
                        "region": b.region,
                    }
                    for b in s_batches[:10]
                ],
            }
        )

    return {
        "stages": stage_data,
        "total_active_produce_kg": sum(s["total_quantity_kg"] for s in stage_data),
    }


@router.get("/fraud-center")
def get_fraud_intelligence(
    user: Annotated[dict, Depends(require_admin)],
    session: Session = Depends(get_session),
) -> dict:
    """Consolidated fraud category intelligence and incident monitoring."""
    categories = [
        "phantom_quantity",
        "price_manipulation",
        "cold_chain_concealed",
        "organic_label_fraud",
        "circular_trading",
        "duplicate_invoice",
        "forged_signature",
    ]

    assessments = list(session.exec(select(Assessment)).all())
    cat_counts = Counter(a.pred_type for a in assessments if a.pred_type != "none")

    incidents = []
    for cat in categories:
        cnt = cat_counts.get(cat, 0)
        label = FRAUD_LABELS.get(cat, cat.replace("_", " ").title())
        incidents.append(
            {
                "category": cat,
                "label": label,
                "total_detected": cnt,
                "description": _fraud_description(cat),
                "severity_level": "CRITICAL" if cat in {"forged_signature", "phantom_quantity", "circular_trading"} else "HIGH",
            }
        )

    # High-risk recent transactions
    high_risk_txs = list(
        session.exec(
            select(Transaction, Assessment)
            .join(Assessment, Assessment.tx_id == Transaction.id)
            .where(Assessment.risk >= 0.70)
            .order_by(Assessment.created_at.desc())
            .limit(15)
        ).all()
    )

    recent_cases = [
        {
            "tx_id": t.id,
            "batch_id": t.batch_id,
            "crop": t.crop,
            "seller_id": t.seller_id,
            "buyer_id": t.buyer_id,
            "quantity_kg": t.quantity_kg,
            "unit_price": t.unit_price,
            "risk": round(a.risk, 4),
            "pred_type": a.pred_type,
            "pred_label": FRAUD_LABELS.get(a.pred_type, a.pred_type),
            "decision": a.decision,
            "rule_hits": a.rule_hits,
            "timestamp": t.timestamp,
        }
        for t, a in high_risk_txs
    ]

    return {
        "categories": incidents,
        "recent_high_risk_cases": recent_cases,
        "total_quarantined": sum(1 for a in assessments if a.decision == "QUARANTINED"),
        "total_flagged": sum(1 for a in assessments if a.decision == "FLAGGED"),
    }


def _fraud_description(cat: str) -> str:
    descriptions = {
        "phantom_quantity": "Quantity declared substantially exceeds biological & land-acreage harvest capacity.",
        "price_manipulation": "Invoice unit price deviates sharply (>40%) from the regional mandi reference price.",
        "cold_chain_concealed": "Perishable produce exposed to critical temperatures above permissible thresholds.",
        "organic_label_fraud": "Produce sold with an 'Organic' markup without a verifiable, accredited certification.",
        "circular_trading": "Repeated invoice transactions circulating between identical participants to inflate artificial volume.",
        "duplicate_invoice": "Identical invoice or batch details billed multiple times to illicitly collect duplicate revenue.",
        "forged_signature": "Cryptographic Ed25519 digital signature does not correspond to the seller's registered public key.",
    }
    return descriptions.get(cat, "Suspect fraudulent supply chain activity.")
