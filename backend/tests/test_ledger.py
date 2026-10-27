from sqlmodel import col, select

from app.chain import ledger
from app.models import Block, LedgerEntry, Transaction


def test_merkle_root_is_order_sensitive_and_handles_odd_counts():
    a, b, c = (ledger.sha256(x) for x in "abc")
    assert ledger.merkle_root([a, b, c]) == ledger.merkle_root([a, b, c, c])
    assert ledger.merkle_root([a, b]) != ledger.merkle_root([b, a])
    assert ledger.merkle_root([]) == ledger.sha256("")


def test_merkle_proof_rebuilds_root():
    leaves = [ledger.sha256(str(i)) for i in range(5)]
    root = ledger.merkle_root(leaves)
    for i, leaf in enumerate(leaves):
        h = leaf
        for step in ledger.merkle_proof(leaves, i):
            h = (
                ledger.sha256(step["hash"] + h)
                if step["position"] == "left"
                else ledger.sha256(h + step["hash"])
            )
        assert h == root


def test_mined_hash_meets_difficulty():
    from datetime import datetime

    nonce, h = ledger.mine(1, datetime(2026, 1, 1), "0" * 64, ledger.sha256("x"), 3)
    assert h.startswith("000")
    assert ledger.header_hash(1, datetime(2026, 1, 1), "0" * 64, ledger.sha256("x"), nonce, 3) == h


def test_seeded_chain_is_valid(client):
    r = client.get("/api/chain/verify").json()
    assert r["valid"] is True
    assert r["blocks_checked"] > 5


def test_editing_transaction_data_is_detected_and_located(client, session):
    entry = session.exec(select(LedgerEntry).where(col(LedgerEntry.block_index).is_not(None))).first()
    tx = session.get(Transaction, entry.tx_id)
    original = tx.quantity_kg
    tx.quantity_kg = original + 1
    session.commit()
    try:
        r = client.get("/api/chain/verify").json()
        assert r["valid"] is False
        assert r["first_broken_index"] == entry.block_index
        assert entry.tx_id in r["reason"]
    finally:
        tx.quantity_kg = original
        session.commit()
    assert client.get("/api/chain/verify").json()["valid"] is True


def test_flipping_a_verdict_is_detected(client, session):
    entry = session.exec(select(LedgerEntry).where(col(LedgerEntry.block_index).is_not(None))).first()
    original = entry.status
    entry.status = "REJECTED" if original != "REJECTED" else "COMMITTED"
    session.commit()
    try:
        assert client.get("/api/chain/verify").json()["first_broken_index"] == entry.block_index
    finally:
        entry.status = original
        session.commit()


def test_editing_a_header_is_detected(client, session):
    block = session.get(Block, 2)
    block.nonce += 1
    session.commit()
    try:
        r = client.get("/api/chain/verify").json()
        assert r["first_broken_index"] == 2
        assert "header" in r["reason"].lower() or "proof" in r["reason"].lower()
    finally:
        block.nonce -= 1
        session.commit()
