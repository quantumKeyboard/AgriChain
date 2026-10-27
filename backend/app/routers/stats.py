from collections import Counter, defaultdict
from datetime import timedelta

from fastapi import APIRouter, Depends
from sqlmodel import Session, col, select

from app.db import get_session
from app.models import Assessment, Block, LedgerEntry, Participant, Review, Transaction
from app.sim.generator import CROP_NAMES, FRAUD_LABELS, REGIONS

router = APIRouter(prefix="/api/stats", tags=["stats"])


def _rows(session: Session):
    return session.exec(
        select(Transaction, Assessment).join(Assessment, Assessment.tx_id == Transaction.id)
    ).all()


@router.get("/summary")
def summary(session: Session = Depends(get_session)) -> dict:
    rows = _rows(session)
    reviews = {r.tx_id: r.action for r in session.exec(select(Review)).all()}
    decisions = Counter(a.decision for _, a in rows)
    open_q = [t for t, a in rows if a.decision == "QUARANTINED" and t.id not in reviews]
    rejected = [t for t, a in rows if reviews.get(t.id) == "REJECTED"]
    injected = [(t, a) for t, a in rows if t.sim_label and t.sim_label != "none"]
    legit = [(t, a) for t, a in rows if t.sim_label == "none"]
    height = session.exec(select(Block.index).order_by(col(Block.index).desc())).first() or 0
    pending = len(session.exec(select(LedgerEntry.tx_id).where(col(LedgerEntry.block_index).is_(None))).all())
    return {
        "transactions": len(rows),
        "clear": decisions["CLEAR"],
        "flagged": decisions["FLAGGED"],
        "quarantined": decisions["QUARANTINED"],
        "open_quarantine": len(open_q),
        "rejected": len(rejected),
        "approved": sum(1 for v in reviews.values() if v == "APPROVED"),
        "value_screened": round(sum(t.total_value for t, _ in rows), 2),
        "value_blocked": round(sum(t.total_value for t in rejected + open_q), 2),
        "avg_risk": round(sum(a.risk for _, a in rows) / max(len(rows), 1), 4),
        "chain_height": height,
        "pending_pool": pending,
        # Ground truth only exists for simulator traffic.
        "ground_truth": {
            "injected": len(injected),
            "caught": sum(1 for _, a in injected if a.decision != "CLEAR"),
            "legit": len(legit),
            "false_alarms": sum(1 for _, a in legit if a.decision == "QUARANTINED"),
        },
    }


@router.get("/timeseries")
def timeseries(
    bucket_minutes: int = 60, buckets: int = 24, session: Session = Depends(get_session)
) -> list[dict]:
    rows = _rows(session)
    if not rows:
        return []
    end = max(t.timestamp for t, _ in rows)
    size = timedelta(minutes=max(bucket_minutes, 1))
    start = end - size * buckets
    out = [
        {
            "t": (start + size * (i + 1)).isoformat(timespec="minutes"),
            "clear": 0,
            "flagged": 0,
            "quarantined": 0,
            "risk_sum": 0.0,
            "n": 0,
        }
        for i in range(buckets)
    ]
    for t, a in rows:
        if t.timestamp <= start:
            continue
        i = min(int((t.timestamp - start) / size), buckets - 1)
        out[i][a.decision.lower()] += 1
        out[i]["risk_sum"] += a.risk
        out[i]["n"] += 1
    for o in out:
        o["avg_risk"] = round(o.pop("risk_sum") / o["n"], 4) if o["n"] else None
    return out


@router.get("/fraud-by-type")
def fraud_by_type(session: Session = Depends(get_session)) -> list[dict]:
    counts = Counter(
        a.pred_type for _, a in _rows(session) if a.decision != "CLEAR" and a.pred_type != "none"
    )
    return [
        {"type": k, "label": FRAUD_LABELS[k], "count": counts.get(k, 0)} for k in FRAUD_LABELS if k != "none"
    ]


@router.get("/risk-heatmap")
def risk_heatmap(session: Session = Depends(get_session)) -> dict:
    people = {p.id: p for p in session.exec(select(Participant)).all()}
    cells: dict[tuple[str, str], list[float]] = defaultdict(list)
    flagged: Counter = Counter()
    for t, a in _rows(session):
        key = (people[t.seller_id].region, t.crop)
        cells[key].append(a.risk)
        if a.decision != "CLEAR":
            flagged[key] += 1
    return {
        "regions": REGIONS,
        "crops": CROP_NAMES,
        "cells": [
            {
                "region": r,
                "crop": c,
                "count": len(cells[(r, c)]),
                "avg_risk": round(sum(cells[(r, c)]) / len(cells[(r, c)]), 4) if cells[(r, c)] else None,
                "flagged": flagged[(r, c)],
            }
            for r in REGIONS
            for c in CROP_NAMES
        ],
    }


@router.get("/stages")
def by_stage(session: Session = Depends(get_session)) -> list[dict]:
    agg: dict[str, Counter] = defaultdict(Counter)
    for t, a in _rows(session):
        agg[t.stage][a.decision] += 1
    order = ["FARM_TO_COOP", "COOP_TO_PROCESSOR", "PROCESSOR_TO_DISTRIBUTOR", "DISTRIBUTOR_TO_RETAILER"]
    return [
        {
            "stage": s,
            "clear": agg[s]["CLEAR"],
            "flagged": agg[s]["FLAGGED"],
            "quarantined": agg[s]["QUARANTINED"],
        }
        for s in order
    ]
