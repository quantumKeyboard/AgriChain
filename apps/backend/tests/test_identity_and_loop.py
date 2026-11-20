"""Signed transactions, history-rewrite detection, exports, learning loop, schema upgrade."""

from app.chain import identity


def legit_example(client) -> dict:
    return client.get("/api/sim/example", params={"type": "none"}).json()["transaction"]


def test_sign_and_verify_roundtrip():
    tx = {f: 1.0 for f in identity.SIGNED_FIELDS}
    tx.update(id="TX-1", seller_id="F-001", buyer_id="C-001", timestamp="2026-01-01T00:00:00")
    sig = identity.sign(tx, "F-001")
    assert identity.verify(tx, sig, identity.public_key_hex("F-001"))
    assert not identity.verify(tx, sig, identity.public_key_hex("F-002"))  # wrong key
    assert not identity.verify({**tx, "quantity_kg": 2.0}, sig, identity.public_key_hex("F-001"))  # edited
    assert not identity.verify(tx, "", identity.public_key_hex("F-001"))


def test_keys_are_deterministic_and_distinct():
    assert identity.public_key_hex("F-001") == identity.public_key_hex("F-001")
    assert identity.public_key_hex("F-001") != identity.public_key_hex("F-002")


def test_participants_have_registered_keys(client):
    p = client.get("/api/participants/F-001").json()
    assert p["public_key"] == identity.public_key_hex("F-001")


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


def test_sealed_rejected_forgery_keeps_chain_valid(client):
    r = client.post("/api/sim/step", json={"n": 1, "inject": "forged_signature"}).json()["results"][-1]
    assert r["decision"] == "QUARANTINED" and r["sim_label"] == "Forged signature"
    d = client.post(f"/api/quarantine/{r['tx_id']}/decision", json={"action": "reject", "note": "spoof"})
    assert d.json()["status"] == "REJECTED"
    assert client.get("/api/chain/verify").json()["valid"] is True


def test_rewritten_and_remined_history_is_caught_by_signatures(client):
    t = client.post("/api/dev/tamper", json={"mode": "rewrite"}).json()
    v = client.get("/api/chain/verify").json()
    assert v["valid"] is False
    assert v["first_broken_index"] == t["block_index"]
    assert "signature" in v["reason"].lower()
    # Every hash and link was recomputed, so only the signature check can have caught it.
    others = [b for b in v["blocks"] if b["index"] != t["block_index"]]
    assert all(b["ok"] for b in others)
    client.post("/api/dev/reset")
    assert client.get("/api/chain/verify").json()["valid"] is True


def test_csv_exports(client):
    for name, first_col in [("transactions.csv", "id"), ("audit.csv", "id"), ("chain.csv", "index")]:
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
            conn.execute(text("UPDATE appmeta SET value = '2' WHERE key = 'schema_version'"))
