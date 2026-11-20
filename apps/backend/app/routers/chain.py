from collections import Counter

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, col, select

from app.chain import ledger
from app.db import get_session
from app.models import Block, LedgerEntry, Transaction
from app.views import load_views

router = APIRouter(prefix="/api/chain", tags=["chain"])


def block_summary(b: Block, statuses: Counter) -> dict:
    return {**b.model_dump(), "status_counts": dict(statuses)}


@router.get("/blocks")
def blocks(limit: int = 30, before: int | None = None, session: Session = Depends(get_session)) -> dict:
    q = select(Block).order_by(col(Block.index).desc())
    if before is not None:
        q = q.where(Block.index < before)
    rows = list(session.exec(q.limit(min(limit, 200))).all())
    idx = [b.index for b in rows]
    entries = session.exec(select(LedgerEntry).where(col(LedgerEntry.block_index).in_(idx))).all()
    counts: dict[int, Counter] = {i: Counter() for i in idx}
    for e in entries:
        counts[e.block_index][e.status] += 1
    height = session.exec(select(Block.index).order_by(col(Block.index).desc())).first() or 0
    return {
        "height": height,
        "pending": ledger.pending_count(session),
        "difficulty": rows[0].difficulty if rows else None,
        "blocks": [block_summary(b, counts[b.index]) for b in rows],
    }


@router.get("/blocks/{index}")
def block_detail(index: int, session: Session = Depends(get_session)) -> dict:
    b = session.get(Block, index)
    if not b:
        raise HTTPException(404, "Block not found")
    entries = ledger.block_entries(session, index)
    txs = {
        t.id: t
        for t in session.exec(
            select(Transaction).where(col(Transaction.id).in_([e.tx_id for e in entries]))
        ).all()
    }
    views = {v["id"]: v for v in load_views(session, list(txs.values()))}
    hashes = [e.tx_hash for e in entries]
    prev = session.get(Block, index - 1) if index > 0 else None
    ok, reason, tampered = ledger.verify_block(session, b, prev)
    return {
        **b.model_dump(),
        "valid": ok,
        "reason": reason,
        "entries": [
            {
                "position": e.position,
                "status": e.status,
                "tx_hash": e.tx_hash,
                "recomputed_hash": ledger.tx_hash(txs[e.tx_id], e.status) if e.tx_id in txs else None,
                "tampered": e.tx_id in tampered,
                "merkle_proof": ledger.merkle_proof(hashes, e.position),
                "tx": views.get(e.tx_id),
            }
            for e in entries
        ],
    }


@router.post("/seal")
def seal(session: Session = Depends(get_session)) -> dict:
    created = ledger.seal_pending(session, force=True)
    return {"sealed_blocks": [b.index for b in created]}


@router.get("/verify")
def verify(session: Session = Depends(get_session)) -> dict:
    return ledger.verify_chain(session)
