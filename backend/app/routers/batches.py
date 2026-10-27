from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, col, select

from app.db import get_session
from app.models import Assessment, Batch, Participant, Transaction
from app.sim.generator import FRAUD_LABELS
from app.views import load_views

router = APIRouter(prefix="/api/batches", tags=["batches"])


@router.get("")
def list_batches(
    flagged_only: bool = False, limit: int = 60, session: Session = Depends(get_session)
) -> list[dict]:
    rows = session.exec(
        select(Transaction, Assessment).join(Assessment, Assessment.tx_id == Transaction.id)
    ).all()
    agg: dict[str, dict] = defaultdict(
        lambda: {"hops": 0, "max_risk": 0.0, "flags": 0, "last": None, "types": set()}
    )
    for t, a in rows:
        g = agg[t.batch_id]
        g["hops"] += 1
        g["max_risk"] = max(g["max_risk"], a.risk)
        if a.decision != "CLEAR":
            g["flags"] += 1
            if a.pred_type != "none":
                g["types"].add(a.pred_type)
        g["last"] = max(g["last"], t.timestamp) if g["last"] else t.timestamp
    batches = {b.id: b for b in session.exec(select(Batch).where(col(Batch.id).in_(list(agg)))).all()}
    out = []
    for bid, g in agg.items():
        if flagged_only and not g["flags"]:
            continue
        b = batches.get(bid)
        out.append(
            {
                "id": bid,
                "crop": b.crop if b else None,
                "region": b.region if b else None,
                "organic_claimed": b.organic_claimed if b else False,
                "hops": g["hops"],
                "max_risk": round(g["max_risk"], 4),
                "flags": g["flags"],
                "last_activity": g["last"],
                "fraud_types": [FRAUD_LABELS[x] for x in sorted(g["types"])],
            }
        )
    out.sort(key=lambda x: x["last_activity"], reverse=True)
    return out[:limit]


@router.get("/{batch_id}/trail")
def trail(batch_id: str, session: Session = Depends(get_session)) -> dict:
    b = session.get(Batch, batch_id)
    if not b:
        raise HTTPException(404, "Batch not found")
    txs = list(
        session.exec(
            select(Transaction).where(Transaction.batch_id == batch_id).order_by(Transaction.timestamp)
        ).all()
    )
    origin = session.get(Participant, b.origin_farmer_id)
    return {
        "batch": {**b.model_dump(), "origin_name": origin.name if origin else b.origin_farmer_id},
        "hops": load_views(session, txs, full=True),
    }
