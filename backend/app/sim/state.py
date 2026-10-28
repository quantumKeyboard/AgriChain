"""The live simulator instance shared by the API, plus demo seeding."""

from __future__ import annotations

import random
import threading
from collections import defaultdict
from datetime import datetime, timedelta

from sqlmodel import Session, func, select

from app.chain import identity
from app.chain.ethereum import get_chain
from app.db import SCHEMA_VERSION, reset_db
from app.ml.explain import explain
from app.ml.features import compute_features, history_from_records
from app.ml.scorer import score_many
from app.models import AppMeta, LedgerEntry, Participant, Transaction
from app.services import STATUS_FOR_DECISION, fraud_code, review, store
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
    """Wipe the DB, deploy a fresh AgriChainLedger contract and build a realistic history on it:
    participants registered on-chain, ~n recorded transactions and auditor verdicts."""
    chain = get_chain()
    chain.require()
    reset_db()
    deployment = chain.deploy()
    domain = chain.domain()
    now = datetime.now().replace(microsecond=0)
    start = now - timedelta(minutes=9 * n)
    people = make_participants(42, now=start)
    for p in people:
        session.add(Participant(**p.as_dict(), address=identity.address_of(p.id)))
    chain.register_participants([(p.id, p.role) for p in people])
    meta = {
        "schema_version": SCHEMA_VERSION,
        "contract_address": deployment["address"],
        "deploy_tx": deployment["deploy_tx"],
        "deploy_block": str(deployment["deploy_block"]),
        "chain_id": str(chain.chain_id),
    }
    for k, v in meta.items():
        session.add(AppMeta(key=k, value=v))
    session.commit()

    sim = SupplyChainSimulator(seed=seed, start=start, fraud_rate=0.08)
    by_batch: dict[str, list[dict]] = defaultdict(list)
    by_seller: dict[str, list[dict]] = defaultdict(list)
    txs = [sim.next_transaction() for _ in range(n)]
    # Stretch simulated time so history spans [start, now - 2 min] evenly.
    t0, t1, end = txs[0]["timestamp"], txs[-1]["timestamp"], now - timedelta(minutes=2)
    scale = (end - start) / max(t1 - t0, timedelta(seconds=1))
    for tx in txs:
        tx["timestamp"] = (start + (tx["timestamp"] - t0) * scale).replace(microsecond=0)
        tx["signature"] = identity.sign_invoice(tx, tx["seller_id"], domain)

    # A couple of identity-spoofing cases so the history shows the signature gate at work.
    rng = random.Random(seed)
    for i in rng.sample(range(n // 4, n - 20), 2):
        txs[i]["sim_label"] = "forged_signature"
        txs[i]["signature"] = identity.sign_invoice(txs[i], forger_for(txs[i]["seller_id"]), domain)

    feats = []
    for tx in txs:
        seller = sim.by_id[tx["seller_id"]].as_dict()
        hist = history_from_records(tx, seller, by_batch[tx["batch_id"]] + by_seller[tx["seller_id"]][-60:])
        feats.append(compute_features(tx, seller, hist))
        by_batch[tx["batch_id"]].append(tx)
        by_seller[tx["seller_id"]].append(tx)

    valid = [tx["sim_label"] != "forged_signature" for tx in txs]
    scores = score_many([{**tx, "signature_valid": v} for tx, v in zip(txs, valid, strict=True)], feats)
    for tx, f, s in zip(txs, feats, scores, strict=True):
        s["features"] = f
        s["shap_top"] = explain(f) if s["decision"] != "CLEAR" else None
        store(session, tx, s, sim.batches[tx["batch_id"]].as_dict(), tx["timestamp"])
    session.commit()

    # Record the history on-chain in bulk (one Ethereum transaction per chunk of invoices).
    # Forged invoices are not sent: the contract would reject them; they stay quarantined off-chain.
    on_chain = [i for i in range(n) if valid[i]]
    for c in range(0, len(on_chain), 25):
        chunk = on_chain[c : c + 25]
        rcpt = chain.record_many(
            [(txs[i], txs[i]["signature"], scores[i], fraud_code(scores[i]["pred_type"])) for i in chunk]
        )
        for i in chunk:
            session.add(
                LedgerEntry(
                    tx_id=txs[i]["id"],
                    status=STATUS_FOR_DECISION[scores[i]["decision"]],
                    record_tx_hash=rcpt.tx_hash,
                    record_block=rcpt.block,
                )
            )
    session.commit()

    quarantined = [i for i, s in enumerate(scores) if s["decision"] == "QUARANTINED"]
    leave_open = set(quarantined[-pending_quarantine:])
    for i in quarantined:
        if i in leave_open:
            continue
        tx = txs[i]
        action = "reject" if tx["sim_label"] != "none" else "approve"
        note = "Confirmed fraud after document check." if action == "reject" else "Verified with buyer."
        reviewed_at = min(tx["timestamp"] + timedelta(minutes=30), now - timedelta(minutes=1))
        review(session, tx["id"], action, note, now=reviewed_at, chain=chain)
    set_sim(sim)
    sim.clock = now
    threading.Thread(target=_warm_signature_cache, daemon=True).start()
    return {"transactions": n, "quarantined_open": len(leave_open), "contract": deployment["address"]}


def forger_for(seller_id: str) -> str:
    """Someone who is not the seller (identity-spoofing demos)."""
    return "D-001" if seller_id != "D-001" else "D-002"


def ensure_chain(session: Session) -> dict | None:
    """Attach to the contract recorded in the DB, or re-seed if it is gone (e.g. node restarted).

    Returns the seed summary when a re-seed happened."""
    with _ensure_lock:
        result = _ensure_chain(session)
    threading.Thread(target=_warm_signature_cache, daemon=True).start()
    return result


def _warm_signature_cache() -> None:
    """Recover every stored signature once in the background, so the first Verify is fast."""
    from app.db import engine
    from app.views import signature_ok

    with Session(engine) as s:
        for tx in s.exec(select(Transaction)).all():
            signature_ok(tx)


_ensure_lock = threading.Lock()


def _ensure_chain(session: Session) -> dict | None:
    chain = get_chain()
    chain.require()
    meta = {m.key: m.value for m in session.exec(select(AppMeta)).all()}
    if (
        meta.get("schema_version") == SCHEMA_VERSION
        and meta.get("chain_id") == str(chain.chain_id)
        and session.exec(select(Participant)).first() is not None
        and chain.attach(meta.get("contract_address"), int(meta.get("deploy_block", "0")))
        and chain.record_count() == session.exec(select(func.count()).select_from(LedgerEntry)).one()
    ):
        return None
    return seed_demo(session)
