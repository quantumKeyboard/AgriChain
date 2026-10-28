"""EIP-712 signed invoices, forged-invoice handling, exports, learning loop, schema upgrade."""

from app.chain import identity


def legit_example(client) -> dict:
    return client.get("/api/sim/example", params={"type": "none"}).json()["transaction"]


DOMAIN = {"name": "AgriChainLedger", "version": "1", "chainId": 31337,
          "verifyingContract": "0x5FbDB2315678afecb367f032d93F642f64180aa3"}  # fmt: skip


def sample_tx() -> dict:
    tx = {f: 1.0 for f in identity.SIGNED_FIELDS}
    tx.update(id="TX-1", batch_id="B-1", seller_id="F-001", buyer_id="C-001", timestamp="2026-01-01T00:00:00")
    return tx


def test_sign_and_verify_roundtrip():
    tx = sample_tx()
    sig = identity.sign_invoice(tx, "F-001", DOMAIN)
    assert identity.verify_invoice(tx, sig, DOMAIN)
    assert identity.recover_signer(tx, sig, DOMAIN) == identity.address_of("F-001")
    assert not identity.verify_invoice(tx, identity.sign_invoice(tx, "F-002", DOMAIN), DOMAIN)  # wrong key
    assert not identity.verify_invoice({**tx, "quantity_kg": 2.0}, sig, DOMAIN)  # edited
    assert not identity.verify_invoice(tx, sig, {**DOMAIN, "chainId": 1})  # replayed on another chain
    assert not identity.verify_invoice(tx, "", DOMAIN)
    assert not identity.verify_invoice(tx, "0x1234", DOMAIN)  # malformed


def test_python_digest_matches_the_contract(client, chain):
    """The EIP-712 digest the backend signs is exactly the one the Solidity contract verifies."""
    from eth_account.messages import _hash_eip191_message, encode_typed_data

    tx = sample_tx()
    msg = identity.invoice_message(tx)
    ours = _hash_eip191_message(encode_typed_data(chain.domain(), identity.INVOICE_TYPES, msg))
    theirs = chain.contract.functions.invoiceDigest(chain.invoice_tuple(tx)).call()
    assert ours == theirs


def test_addresses_are_deterministic_and_distinct():
    assert identity.address_of("F-001") == identity.address_of("F-001")
    assert identity.address_of("F-001") != identity.address_of("F-002")


def test_participants_are_registered_on_chain(client, chain):
    p = client.get("/api/participants/F-001").json()
    assert p["address"] == identity.address_of("F-001")
    pid, role, active = chain.contract.functions.participants(p["address"]).call()
    assert identity.from_bytes32(pid) == "F-001" and role == identity.ROLE_CODES["FARMER"] and active


def test_transactions_are_signed_and_verified(client):
    tx = client.get("/api/transactions?limit=1").json()[0]
    assert tx["signature"] and tx["signature_valid"] is True


def test_forged_signature_is_hard_quarantined(client):
    ex = legit_example(client)
    assert client.post("/api/transactions/score", json=ex).json()["decision"] == "CLEAR"
    forged = client.post("/api/transactions/score", json={**ex, "forge_signature": True}).json()
    assert forged["decision"] == "QUARANTINED"
    assert forged["pred_type"] == "forged_signature"
    assert any(h["id"] == "SIGNATURE_INVALID" for h in forged["rule_hits"])


def test_rejected_forgery_stays_off_chain_and_chain_stays_valid(client):
    r = client.post("/api/sim/step", json={"n": 1, "inject": "forged_signature"}).json()["results"][-1]
    assert r["decision"] == "QUARANTINED" and r["sim_label"] == "Forged signature"
    assert r["on_chain"] is None  # never sent: the contract would reject the signature
    d = client.post(f"/api/quarantine/{r['tx_id']}/decision", json={"action": "reject", "note": "spoof"})
    assert d.json()["status"] == "REJECTED"
    assert client.get("/api/chain/verify").json()["valid"] is True


def test_forged_invoice_cannot_be_approved_onto_the_chain(client):
    r = client.post("/api/sim/step", json={"n": 1, "inject": "forged_signature"}).json()["results"][-1]
    assert r["on_chain"] is None
    d = client.post(f"/api/quarantine/{r['tx_id']}/decision", json={"action": "approve", "note": "x"})
    assert d.status_code == 409 and "InvalidSellerSignature" in d.json()["detail"]


def test_csv_exports(client):
    for name, first_col in [("transactions.csv", "id"), ("audit.csv", "id"), ("chain.csv", "tx_id")]:
        r = client.get(f"/api/export/{name}")
        assert r.status_code == 200
        assert "attachment" in r.headers["content-disposition"]
        lines = r.text.lstrip("﻿").splitlines()
        assert lines[0].split(",")[0] == first_col and len(lines) > 1


def test_feedback_summary_counts_reviews(client):
    fb = client.get("/api/model/feedback").json()
    assert fb["reviews"] == fb["approved"] + fb["rejected"]
    assert fb["usable_labels"] <= fb["reviews"]


def test_retrain_uses_feedback_and_hot_swaps_model(client):
    before = client.get("/api/health").json()["model_version"]
    r = client.post("/api/model/retrain").json()
    assert r["previous_version"] == before
    assert r["model_version"] != before
    assert client.get("/api/health").json()["model_version"] == r["model_version"]
    assert r["feedback"]["rows"] == client.get("/api/model/feedback").json()["usable_labels"]
    assert r["after"]["pr_auc"] > 0.8
    hist = client.get("/api/model/history").json()
    assert [h["model_version"] for h in hist[-2:]] == [before, r["model_version"]]
    # The new model scores live traffic.
    res = client.post("/api/sim/step", json={"n": 1, "inject": "duplicate_invoice"}).json()["results"][-1]
    assert res["decision"] == "QUARANTINED"


def test_outdated_schema_is_detected(client):
    from sqlalchemy import text

    from app.db import engine, schema_is_current

    assert schema_is_current()
    with engine.begin() as conn:
        conn.execute(text("UPDATE appmeta SET value = '1' WHERE key = 'schema_version'"))
    try:
        assert not schema_is_current()
    finally:
        with engine.begin() as conn:
            conn.execute(text("UPDATE appmeta SET value = '3' WHERE key = 'schema_version'"))
