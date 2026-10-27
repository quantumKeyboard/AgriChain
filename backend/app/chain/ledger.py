"""A small, fully-inspectable blockchain ledger.

* Every transaction's on-chain record = SHA-256 of a canonical JSON of its immutable
  fields plus its final ledger status (COMMITTED / FLAGGED / APPROVED / REJECTED).
* Blocks hold a Merkle root of those hashes, the previous block's hash, and a nonce
  found by proof-of-work (hash must start with `difficulty` hex zeros).
* `verify_chain` recomputes everything from the database, so any edit to a stored
  transaction, verdict or block header is detected and located.
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime

from sqlmodel import Session, col, select

from app.config import settings
from app.models import Block, LedgerEntry, Transaction

GENESIS_PREV = "0" * 64

# Fields that make up a transaction's on-chain identity. `sim_label` is deliberately excluded.
HASHED_FIELDS = [
    "id",
    "batch_id",
    "crop",
    "stage",
    "seller_id",
    "buyer_id",
    "timestamp",
    "quantity_kg",
    "unit_price",
    "total_value",
    "ref_price",
    "quality_grade",
    "moisture_pct",
    "organic_claimed",
    "organic_cert_valid",
    "transit_km",
    "transit_hours",
    "temp_avg_c",
    "temp_max_c",
    "cold_chain_ok_claimed",
    "payment_mode",
]


def sha256(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()


def _canon(value):
    if isinstance(value, datetime):
        return value.isoformat(timespec="seconds")
    if isinstance(value, float):
        return round(value, 4)
    return value


def tx_hash(tx: Transaction, status: str) -> str:
    payload = {f: _canon(getattr(tx, f)) for f in HASHED_FIELDS}
    payload["ledger_status"] = status
    return sha256(json.dumps(payload, sort_keys=True, separators=(",", ":")))


def merkle_root(hashes: list[str]) -> str:
    if not hashes:
        return sha256("")
    level = list(hashes)
    while len(level) > 1:
        if len(level) % 2:
            level.append(level[-1])
        level = [sha256(level[i] + level[i + 1]) for i in range(0, len(level), 2)]
    return level[0]


def merkle_proof(hashes: list[str], index: int) -> list[dict]:
    """Sibling path from leaf `index` up to the root."""
    proof, level, i = [], list(hashes), index
    while len(level) > 1:
        if len(level) % 2:
            level.append(level[-1])
        sib = i ^ 1
        proof.append({"hash": level[sib], "position": "left" if sib < i else "right"})
        level = [sha256(level[k] + level[k + 1]) for k in range(0, len(level), 2)]
        i //= 2
    return proof


def header_hash(
    index: int, timestamp: datetime, prev_hash: str, root: str, nonce: int, difficulty: int
) -> str:
    return sha256(f"{index}|{_canon(timestamp)}|{prev_hash}|{root}|{nonce}|{difficulty}")


def mine(index: int, timestamp: datetime, prev_hash: str, root: str, difficulty: int) -> tuple[int, str]:
    target = "0" * difficulty
    nonce = 0
    while True:
        h = header_hash(index, timestamp, prev_hash, root, nonce, difficulty)
        if h.startswith(target):
            return nonce, h
        nonce += 1


def ensure_genesis(session: Session, now: datetime | None = None) -> Block:
    genesis = session.get(Block, 0)
    if genesis:
        return genesis
    ts = (now or datetime.now()).replace(microsecond=0)
    root = merkle_root([])
    nonce, h = mine(0, ts, GENESIS_PREV, root, settings.pow_difficulty)
    genesis = Block(
        index=0,
        timestamp=ts,
        prev_hash=GENESIS_PREV,
        merkle_root=root,
        nonce=nonce,
        difficulty=settings.pow_difficulty,
        hash=h,
        tx_count=0,
    )
    session.add(genesis)
    session.commit()
    return genesis


def enqueue(session: Session, tx_id: str, status: str, now: datetime | None = None) -> LedgerEntry:
    entry = session.get(LedgerEntry, tx_id)
    if entry is None:
        entry = LedgerEntry(tx_id=tx_id, status=status, queued_at=now or datetime.now())
        session.add(entry)
    else:
        entry.status = status
    return entry


def pending_count(session: Session) -> int:
    return len(session.exec(select(LedgerEntry.tx_id).where(col(LedgerEntry.block_index).is_(None))).all())


def seal_pending(session: Session, force: bool = False, now: datetime | None = None) -> list[Block]:
    """Seal pending entries into blocks of `block_size`. With force=True a final partial block is sealed."""
    created: list[Block] = []
    while True:
        pending = session.exec(
            select(LedgerEntry).where(col(LedgerEntry.block_index).is_(None)).order_by(LedgerEntry.queued_at)
        ).all()
        if not pending or (len(pending) < settings.block_size and not force):
            break
        chunk = pending[: settings.block_size]
        last = session.exec(select(Block).order_by(col(Block.index).desc())).first() or ensure_genesis(
            session
        )
        index = last.index + 1
        ts = (now or datetime.now()).replace(microsecond=0)
        if ts < last.timestamp:
            ts = last.timestamp
        hashes = []
        for pos, entry in enumerate(chunk):
            tx = session.get(Transaction, entry.tx_id)
            entry.tx_hash = tx_hash(tx, entry.status)
            entry.block_index = index
            entry.position = pos
            hashes.append(entry.tx_hash)
        root = merkle_root(hashes)
        nonce, h = mine(index, ts, last.hash, root, settings.pow_difficulty)
        block = Block(
            index=index,
            timestamp=ts,
            prev_hash=last.hash,
            merkle_root=root,
            nonce=nonce,
            difficulty=settings.pow_difficulty,
            hash=h,
            tx_count=len(chunk),
        )
        session.add(block)
        session.commit()
        created.append(block)
    return created


def block_entries(session: Session, index: int) -> list[LedgerEntry]:
    return list(
        session.exec(
            select(LedgerEntry).where(LedgerEntry.block_index == index).order_by(LedgerEntry.position)
        ).all()
    )


def verify_block(session: Session, block: Block, prev: Block | None) -> tuple[bool, str | None, list[str]]:
    """Return (ok, reason, ids of tampered transactions)."""
    entries = block_entries(session, block.index)
    tampered, recomputed = [], []
    for e in entries:
        tx = session.get(Transaction, e.tx_id)
        h = tx_hash(tx, e.status) if tx else "missing"
        recomputed.append(h)
        if h != e.tx_hash:
            tampered.append(e.tx_id)
    if merkle_root(recomputed) != block.merkle_root:
        who = ", ".join(tampered) or "unknown"
        return (
            False,
            f"Merkle root mismatch — transaction data or verdict changed after sealing ({who}).",
            tampered,
        )
    if (
        header_hash(
            block.index, block.timestamp, block.prev_hash, block.merkle_root, block.nonce, block.difficulty
        )
        != block.hash
    ):
        return False, "Block header was edited — its hash no longer matches its contents.", []
    if not block.hash.startswith("0" * block.difficulty):
        return False, "Proof-of-work invalid — hash does not meet the difficulty target.", []
    expected_prev = prev.hash if prev else GENESIS_PREV
    if block.prev_hash != expected_prev:
        return False, "Broken link — previous-hash pointer does not match the previous block.", []
    return True, None, []


def verify_chain(session: Session) -> dict:
    blocks = session.exec(select(Block).order_by(Block.index)).all()
    results, first_broken, reason, prev = [], None, None, None
    for b in blocks:
        ok, why, tampered = verify_block(session, b, prev)
        if not ok and first_broken is None:
            first_broken, reason = b.index, why
        results.append({"index": b.index, "ok": ok, "reason": why, "tampered_tx": tampered})
        prev = b
    return {
        "valid": first_broken is None,
        "first_broken_index": first_broken,
        "reason": reason,
        "blocks_checked": len(blocks),
        "blocks": results,
        "checked_at": datetime.now().isoformat(timespec="seconds"),
    }
