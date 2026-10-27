"""The live simulator instance shared by the API, plus demo seeding."""

from __future__ import annotations

import random
from collections import defaultdict
from datetime import datetime, timedelta

from sqlmodel import Session

from app.chain import ledger
from app.db import reset_db
from app.ml.explain import explain
from app.ml.features import compute_features, history_from_records
from app.ml.scorer import score_many
from app.models import Participant
from app.services import ingest, review
from app.sim.generator import SupplyChainSimulator, make_participants

_sim: SupplyChainSimulator | None = None


def get_sim() -> SupplyChainSimulator:
    global _sim
    if _sim is None:
        _sim = SupplyChainSimulator(seed=random.randrange(1 << 30), start=datetime.now())
    return _sim


def set_sim(sim: SupplyChainSimulator) -> None:
    global _sim
    _sim = sim


def seed_demo(session: Session, n: int = 300, seed: int = 7, pending_quarantine: int = 4) -> dict:
    """Wipe the DB and build a realistic history: participants, ~n tx, blocks, reviewed quarantine."""
    reset_db()
    now = datetime.now().replace(microsecond=0)
    start = now - timedelta(minutes=9 * n)
    for p in make_participants(42, now=start):
        session.add(Participant(**p.as_dict()))
    session.commit()
    ledger.ensure_genesis(session, now=start - timedelta(minutes=5))

    sim = SupplyChainSimulator(seed=seed, start=start, fraud_rate=0.08)
    by_batch: dict[str, list[dict]] = defaultdict(list)
    by_seller: dict[str, list[dict]] = defaultdict(list)
    txs = [sim.next_transaction() for _ in range(n)]
    # Stretch simulated time so history spans [start, now - 2 min] evenly.
    t0, t1, end = txs[0]["timestamp"], txs[-1]["timestamp"], now - timedelta(minutes=2)
    scale = (end - start) / max(t1 - t0, timedelta(seconds=1))
    for tx in txs:
        tx["timestamp"] = (start + (tx["timestamp"] - t0) * scale).replace(microsecond=0)

    feats = []
    for tx in txs:
        seller = sim.by_id[tx["seller_id"]].as_dict()
        hist = history_from_records(tx, seller, by_batch[tx["batch_id"]] + by_seller[tx["seller_id"]][-60:])
        feats.append(compute_features(tx, seller, hist))
        by_batch[tx["batch_id"]].append(tx)
        by_seller[tx["seller_id"]].append(tx)

    scores = score_many(txs, feats)
    quarantined = [i for i, s in enumerate(scores) if s["decision"] == "QUARANTINED"]
    leave_open = set(quarantined[-pending_quarantine:])
    for i, (tx, f, s) in enumerate(zip(txs, feats, scores, strict=True)):
        s["features"] = f
        s["shap_top"] = explain(f) if s["decision"] != "CLEAR" else None
        ingest(session, tx, batch=sim.batches[tx["batch_id"]].as_dict(), assessment=s, now=tx["timestamp"])
        if s["decision"] == "QUARANTINED" and i not in leave_open:
            action = "reject" if tx["sim_label"] != "none" else "approve"
            note = "Confirmed fraud after document check." if action == "reject" else "Verified with buyer."
            reviewed_at = min(tx["timestamp"] + timedelta(minutes=30), now - timedelta(minutes=1))
            review(session, tx["id"], action, note, now=reviewed_at, seal=False)
    ledger.seal_pending(session, force=True, now=now)
    set_sim(sim)
    sim.clock = now
    return {"transactions": n, "quarantined_open": len(leave_open)}
