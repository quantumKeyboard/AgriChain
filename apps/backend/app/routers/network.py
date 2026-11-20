"""Participants, trust scores and the trade network (with circular-trading detection)."""

from collections import Counter, defaultdict
from datetime import datetime

import networkx as nx
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, col, select

from app.db import get_session
from app.models import Assessment, Participant, Review, Transaction
from app.views import load_views

router = APIRouter(prefix="/api", tags=["network"])


def trust_scores(session: Session) -> dict[str, dict]:
    rows = session.exec(
        select(Transaction, Assessment).join(Assessment, Assessment.tx_id == Transaction.id)
    ).all()
    rejected = {r.tx_id for r in session.exec(select(Review).where(Review.action == "REJECTED")).all()}
    stats: dict[str, Counter] = defaultdict(Counter)
    for t, a in rows:
        s = stats[t.seller_id]
        s["sold"] += 1
        s["value"] += t.total_value
        s["flagged"] += a.decision != "CLEAR"
        s["rejected"] += t.id in rejected
        stats[t.buyer_id]["bought"] += 1
    now = datetime.now()
    out = {}
    for p in session.exec(select(Participant)).all():
        s = stats[p.id]
        sold = max(s["sold"], 1)
        age = (now - p.registered_on).days
        flag_ratio = s["flagged"] / sold
        reject_ratio = s["rejected"] / sold
        score = (
            100 - 55 * flag_ratio - 35 * reject_ratio - (12 if age < 30 else 0) - (4 if s["sold"] < 2 else 0)
        )
        out[p.id] = {
            "trust": round(max(0.0, min(100.0, score)), 1),
            "sold": s["sold"],
            "bought": s["bought"],
            "flagged": s["flagged"],
            "rejected": s["rejected"],
            "value": round(s["value"], 2),
            "account_age_days": age,
            # radar dimensions, 0-100, higher is better
            "dims": {
                "Clean history": round(100 * (1 - flag_ratio)),
                "Verdicts upheld": round(100 * (1 - reject_ratio)),
                "Account age": min(100, round(age / 7.3)),
                "Activity": min(100, s["sold"] * 10 + s["bought"] * 5),
            },
        }
    return out


@router.get("/participants")
def participants(role: str | None = None, session: Session = Depends(get_session)) -> list[dict]:
    trust = trust_scores(session)
    q = select(Participant)
    if role:
        q = q.where(Participant.role == role)
    return sorted(
        ({**p.model_dump(), **trust[p.id]} for p in session.exec(q).all()), key=lambda x: x["trust"]
    )


@router.get("/participants/{pid}")
def participant(pid: str, session: Session = Depends(get_session)) -> dict:
    p = session.get(Participant, pid)
    if not p:
        raise HTTPException(404, "Participant not found")
    txs = list(
        session.exec(
            select(Transaction)
            .where((Transaction.seller_id == pid) | (Transaction.buyer_id == pid))
            .order_by(col(Transaction.timestamp).desc())
            .limit(25)
        ).all()
    )
    return {**p.model_dump(), **trust_scores(session)[pid], "recent": load_views(session, txs)}


@router.get("/network")
def network(limit: int = 400, session: Session = Depends(get_session)) -> dict:
    rows = session.exec(
        select(Transaction, Assessment)
        .join(Assessment, Assessment.tx_id == Transaction.id)
        .order_by(col(Transaction.timestamp).desc())
        .limit(limit)
    ).all()
    edges: dict[tuple[str, str], dict] = {}
    for t, a in rows:
        e = edges.setdefault(
            (t.seller_id, t.buyer_id),
            {"count": 0, "value": 0.0, "max_risk": 0.0, "circular": False, "flagged": 0},
        )
        e["count"] += 1
        e["value"] += t.total_value
        e["max_risk"] = max(e["max_risk"], a.risk)
        e["flagged"] += a.decision != "CLEAR"
        if any(h["id"] == "CIRCULAR" for h in a.rule_hits or []):
            e["circular"] = True
    g = nx.DiGraph()
    g.add_edges_from(edges)
    cycles = [c for c in nx.simple_cycles(g, length_bound=5)][:20]
    in_cycle = {n for c in cycles for n in c}
    trust = trust_scores(session)
    people = {p.id: p for p in session.exec(select(Participant)).all()}
    return {
        "nodes": [
            {
                "id": n,
                "name": people[n].name,
                "role": people[n].role,
                "region": people[n].region,
                "trust": trust[n]["trust"],
                "in_cycle": n in in_cycle,
            }
            for n in g.nodes
        ],
        "edges": [
            {
                "source": s,
                "target": d,
                **{k: (round(v, 4) if isinstance(v, float) else v) for k, v in e.items()},
            }
            for (s, d), e in edges.items()
        ],
        "cycles": cycles,
    }
