def test_health(client):
    r = client.get("/api/health").json()
    assert r["status"] == "ok" and r["demo_mode"] is True


def test_dry_run_score_does_not_persist(client):
    ex = client.get("/api/sim/example", params={"type": "price_manipulation"}).json()["transaction"]
    before = client.get("/api/stats/summary").json()["transactions"]
    r = client.post("/api/transactions/score", json=ex)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["decision"] in {"FLAGGED", "QUARANTINED"}
    assert body["shap_top"] and body["rule_hits"]
    assert client.get("/api/stats/summary").json()["transactions"] == before


def test_validation_errors_are_422(client):
    ex = client.get("/api/sim/example").json()["transaction"]
    ex["quantity_kg"] = -5
    assert client.post("/api/transactions", json=ex).status_code == 422
    ex["quantity_kg"] = 100
    ex["buyer_id"] = "NOPE"
    assert client.post("/api/transactions", json=ex).status_code == 422


def test_injected_fraud_is_quarantined_then_rejected_onto_the_chain(client):
    res = client.post("/api/sim/step", json={"n": 1, "inject": "duplicate_invoice"}).json()["results"][-1]
    assert res["decision"] == "QUARANTINED"
    tx_id = res["tx_id"]
    assert any(t["id"] == tx_id for t in client.get("/api/quarantine").json()["open"])

    d = client.post(f"/api/quarantine/{tx_id}/decision", json={"action": "reject", "note": "test"}).json()
    assert d["status"] == "REJECTED" and d["sealed_blocks"]
    detail = client.get(f"/api/transactions/{tx_id}").json()
    assert detail["ledger_status"] == "REJECTED" and detail["block_index"] == d["sealed_blocks"][-1]
    assert client.post(f"/api/quarantine/{tx_id}/decision", json={"action": "approve"}).status_code == 409
    assert client.get("/api/chain/verify").json()["valid"] is True


def test_clean_traffic_fills_blocks(client):
    h0 = client.get("/api/chain/blocks?limit=1").json()["height"]
    client.post("/api/sim/step", json={"n": 12})
    client.post("/api/chain/seal")
    assert client.get("/api/chain/blocks?limit=1").json()["height"] > h0


def test_dashboard_endpoints(client):
    for path in [
        "/api/stats/summary",
        "/api/stats/timeseries",
        "/api/stats/fraud-by-type",
        "/api/stats/risk-heatmap",
        "/api/stats/stages",
        "/api/batches",
        "/api/participants",
        "/api/network",
        "/api/model/report",
        "/api/sim/meta",
        "/api/chain/blocks/1",
    ]:
        assert client.get(path).status_code == 200, path


def test_batch_trail(client):
    b = client.get("/api/batches?limit=1").json()[0]
    trail = client.get(f"/api/batches/{b['id']}/trail").json()
    assert trail["batch"]["id"] == b["id"] and len(trail["hops"]) == b["hops"]


def test_tamper_endpoint_then_reset(client):
    client.post("/api/dev/tamper", json={"mode": "quantity"})
    assert client.get("/api/chain/verify").json()["valid"] is False
    client.post("/api/dev/reset")
    assert client.get("/api/chain/verify").json()["valid"] is True
