"""Demo-only endpoints. Mounted only when DEMO_MODE=true."""

import random

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, col, select

from app.chain import ledger
from app.db import get_session
from app.models import Block, LedgerEntry, Transaction
from app.schemas import TamperIn
from app.sim.state import seed_demo

router = APIRouter(prefix="/api/dev", tags=["demo"])


@router.post("/tamper")
def tamper(body: TamperIn, session: Session = Depends(get_session)) -> dict:
    """Simulate an insider editing the database behind the ledger's back."""
    if body.mode == "verdict":
        q = select(LedgerEntry).where(
            LedgerEntry.status == "REJECTED", col(LedgerEntry.block_index).is_not(None)
        )
        if body.block_index is not None:
            q = q.where(LedgerEntry.block_index == body.block_index)
        entry = session.exec(q.order_by(col(LedgerEntry.block_index).desc())).first()
        if not entry:
            raise HTTPException(
                404, "No sealed REJECTED verdict to flip — reject a quarantined transaction first."
            )
        entry.status = "COMMITTED"
        session.commit()
        return {
            "block_index": entry.block_index,
            "tx_id": entry.tx_id,
            "mode": "verdict",
            "change": "Rejected fraud verdict silently flipped to COMMITTED",
        }

    q = select(Block).where(Block.index > 0, Block.tx_count > 0)
    if body.block_index is not None:
        q = q.where(Block.index == body.block_index)
    blocks = list(session.exec(q).all())
    if not blocks:
        raise HTTPException(404, "No block with transactions to tamper with.")
    block = random.choice(blocks[-12:]) if body.block_index is None else blocks[0]

    if body.mode == "header":
        block.nonce += 1
        session.commit()
        return {"block_index": block.index, "mode": "header", "change": "Block nonce edited"}

    entry = ledger.block_entries(session, block.index)[0]
    tx = session.get(Transaction, entry.tx_id)
    before = tx.quantity_kg
    tx.quantity_kg = round(tx.quantity_kg * 10, 1)
    tx.total_value = round(tx.quantity_kg * tx.unit_price, 2)
    session.commit()
    if body.mode == "rewrite":
        # A sophisticated attacker also recomputes every hash and re-mines the chain from here.
        remined = ledger.remine_from(session, block.index)
        return {
            "block_index": block.index,
            "tx_id": tx.id,
            "mode": "rewrite",
            "change": f"Quantity edited {before:,.0f} kg → {tx.quantity_kg:,.0f} kg, then {remined} "
            "blocks re-mined so every hash and link is valid again",
        }
    return {
        "block_index": block.index,
        "tx_id": tx.id,
        "mode": "quantity",
        "change": f"Quantity edited {before:,.0f} kg → {tx.quantity_kg:,.0f} kg",
    }


@router.post("/reset")
def reset(session: Session = Depends(get_session)) -> dict:
    return seed_demo(session)
