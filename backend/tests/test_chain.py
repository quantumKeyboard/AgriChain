"""The smart-contract ledger: on-chain records, verification against the database, and attacks."""

from sqlmodel import select

from app.chain import identity
from app.models import LedgerEntry, Transaction


def test_seeded_history_is_on_chain_and_valid(client, chain):
    r = client.get("/api/chain/verify").json()
    assert r["valid"] is True
    assert r["checked"] == chain.record_count() > 50
    assert r["off_chain_only"] >= 2  # the seeded forged invoices never reach the contract


def test_record_matches_contract_storage(client, session, chain):
    entry = session.exec(select(LedgerEntry)).first()
    tx = session.get(Transaction, entry.tx_id)
    rec = client.get(f"/api/chain/records/{tx.id}").json()
    assert rec["matches"] is True
    assert rec["on_chain"]["data_hash"] == "0x" + identity.data_hash(tx).hex()
    assert rec["on_chain"]["seller"] == identity.address_of(tx.seller_id)
    assert rec["on_chain"]["status"] == entry.status


def test_editing_transaction_data_is_detected(client, session):
    entry = session.exec(select(LedgerEntry)).first()
    tx = session.get(Transaction, entry.tx_id)
    original = tx.quantity_kg
    tx.quantity_kg = original + 1
    session.commit()
    try:
        r = client.get("/api/chain/verify").json()
        assert r["valid"] is False
        problems = {i["problem"] for i in r["issues"] if i["tx_id"] == tx.id}
        assert problems == {"DATA_MISMATCH", "BAD_SIGNATURE"}
    finally:
        tx.quantity_kg = original
        session.commit()
    assert client.get("/api/chain/verify").json()["valid"] is True


def test_flipping_a_verdict_in_the_database_is_detected(client, session):
    entry = session.exec(select(LedgerEntry)).first()
    original = entry.status
    entry.status = "REJECTED" if original != "REJECTED" else "APPROVED"
    session.commit()
    try:
        issues = client.get("/api/chain/verify").json()["issues"]
        assert [(i["tx_id"], i["problem"]) for i in issues] == [(entry.tx_id, "STATUS_MISMATCH")]
    finally:
        entry.status = original
        session.commit()


def test_deleting_a_mirrored_row_is_detected(client, session):
    entry = session.exec(select(LedgerEntry)).first()
    saved = entry.model_dump()
    session.delete(entry)
    session.commit()
    try:
        issues = client.get("/api/chain/verify").json()["issues"]
        assert (saved["tx_id"], "MISSING_OFF_CHAIN") in [(i["tx_id"], i["problem"]) for i in issues]
    finally:
        session.add(LedgerEntry(**saved))
        session.commit()


def test_contract_rejects_overwrite_unauthorized_reverdict_and_forgery(client):
    expected = {
        "chain_overwrite": "RecordExists",
        "chain_unauthorized": "AccessControlUnauthorizedAccount",
        "chain_reverdict": "NotPendingReview",
        "chain_forged": "InvalidSellerSignature",
    }
    for kind, error in expected.items():
        r = client.post("/api/dev/attack", json={"kind": kind})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["result"] == "reverted" and body["revert"]["error"] == error, body
        # The failed attempt was really mined, with status 0.
        block = client.get(f"/api/chain/blocks/{body['revert']['block']}").json()
        assert [t["status"] for t in block["transactions"]] == ["reverted"]
    assert client.get("/api/chain/verify").json()["valid"] is True


def test_unauthorized_attack_names_the_missing_role(client):
    body = client.post("/api/dev/attack", json={"kind": "chain_unauthorized"}).json()
    assert body["revert"]["args"]["neededRole"] == "AUDITOR_ROLE"


def test_database_attacks_are_detected_then_reset(client):
    for kind, problem in [("db_quantity", "DATA_MISMATCH"), ("db_verdict", "STATUS_MISMATCH")]:
        t = client.post("/api/dev/attack", json={"kind": kind}).json()
        v = client.get("/api/chain/verify").json()
        assert v["valid"] is False
        assert (t["tx_id"], problem) in [(i["tx_id"], i["problem"]) for i in v["issues"]]
    client.post("/api/dev/reset")
    assert client.get("/api/chain/verify").json()["valid"] is True


def test_explorer_decodes_contract_calls(client, chain):
    info = client.get("/api/chain/info").json()
    assert info["contract_address"] == chain.contract.address
    assert info["record_count"] == chain.record_count()
    blocks = client.get("/api/chain/blocks?limit=10").json()
    assert blocks["head"] == info["block_number"]
    functions = {t["function"] for b in blocks["blocks"] for t in b["transactions"]}
    assert functions & {"recordTransactions", "resolve", "registerParticipants"}
    detail = client.get(f"/api/chain/blocks/{blocks['blocks'][-1]['number']}").json()
    assert detail["hash"].startswith("0x") and "events" in detail["transactions"][0]
