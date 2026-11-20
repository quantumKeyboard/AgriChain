"""Tests for batch lifecycle, admin control tower, and participant portal."""

from fastapi.testclient import TestClient
from sqlmodel import Session

from app.chain import identity
from app.db import engine
from app.main import app
from app.models import Batch, BatchLineage, LifecycleEvent, Participant, Transfer
from app.sim.state import seed_demo


def test_admin_metrics_and_stage_overview(client: TestClient):
    # Admin metrics
    res = client.get("/api/admin/metrics", headers={"X-User-Role": "ADMIN"})
    assert res.status_code == 200
    data = res.json()
    assert "total_batches" in data
    assert "chain_valid" in data
    assert data["chain_valid"] is True
    assert data["total_participants"] > 0

    # Non-admin forbidden from admin metrics
    forbidden_res = client.get("/api/admin/metrics", headers={"X-User-Role": "FARMER"})
    assert forbidden_res.status_code == 403

    # Stage overview
    stage_res = client.get("/api/admin/stage-overview", headers={"X-User-Role": "ADMIN"})
    assert stage_res.status_code == 200
    s_data = stage_res.json()
    assert len(s_data["stages"]) == 5
    assert any(s["stage"] == "FARMER" for s in s_data["stages"])


def test_fraud_center_intelligence(client: TestClient):
    res = client.get("/api/admin/fraud-center", headers={"X-User-Role": "ADMIN"})
    assert res.status_code == 200
    data = res.json()
    assert len(data["categories"]) >= 6
    assert any(c["category"] == "phantom_quantity" for c in data["categories"])
    assert any(c["category"] == "cold_chain_concealed" for c in data["categories"])


def test_participant_portal_dashboard_and_isolation(client: TestClient):
    # Farmer Ramesh
    res = client.get(
        "/api/participant/dashboard",
        headers={"X-User-Role": "FARMER", "X-Participant-Id": "F-001"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["role"] == "FARMER"
    assert "active_batches_count" in data

    # Digital identity
    id_res = client.get(
        "/api/participant/identity",
        headers={"X-User-Role": "FARMER", "X-Participant-Id": "F-001"},
    )
    assert id_res.status_code == 200
    id_data = id_res.json()
    assert id_data["algorithm"] == "Ed25519"
    assert len(id_data["public_key"]) == 64


def test_batch_lifecycle_harvest_transfer_and_lineage(client: TestClient):
    # 1. Farmer Ramesh creates a harvest batch
    harvest_res = client.post(
        "/api/lifecycle/harvest",
        headers={"X-User-Role": "FARMER", "X-Participant-Id": "F-001"},
        json={
            "farmer_id": "F-001",
            "crop": "tomato",
            "quantity_kg": 3500.0,
            "farm_id": "PLOT-TEST-1",
            "farm_location": "Solapur, MH",
            "variety": "Roma Standard",
            "quality_grade": "A",
            "organic_claimed": True,
            "organic_cert_valid": True,
            "cert_reference": "NPOP/2026/001",
        },
    )
    assert harvest_res.status_code == 200
    b_data = harvest_res.json()
    batch_id = b_data["batch_id"]
    assert b_data["is_phantom"] is False
    assert b_data["status"] == "ACTIVE"

    # 2. Farmer dispatches transfer to Cooperative
    dispatch_res = client.post(
        "/api/lifecycle/transfer",
        headers={"X-User-Role": "FARMER", "X-Participant-Id": "F-001"},
        json={
            "batch_id": batch_id,
            "sender_id": "F-001",
            "receiver_id": "C-001",
            "stage": "FARM_TO_COOP",
            "quantity_kg": 3500.0,
            "transit_km": 60.0,
            "transit_hours": 2.5,
            "unit_price": 28.0,
            "vehicle_number": "MH-12-TR-1111",
        },
    )
    assert dispatch_res.status_code == 200
    trf_data = dispatch_res.json()
    transfer_id = trf_data["transfer_id"]
    assert trf_data["status"] == "IN_TRANSIT"

    # 3. Cooperative accepts transfer with small legitimate handling loss (3,460 kg vs 3,500 kg, diff 40 kg <= 50 kg tolerance)
    accept_res = client.post(
        f"/api/lifecycle/transfer/{transfer_id}/respond",
        headers={"X-User-Role": "COOP", "X-Participant-Id": "C-001"},
        json={
            "receiver_id": "C-001",
            "received_quantity_kg": 3460.0,
            "action": "ACCEPT",
            "quality_grade": "A",
        },
    )
    assert accept_res.status_code == 200
    acc_data = accept_res.json()
    assert acc_data["status"] == "ACCEPTED"
    assert acc_data["discrepancy_kg"] == 40.0
    assert acc_data["is_disputed"] is False

    # 4. Processor transforms and splits batch into Pulp and Slices
    proc_res = client.post(
        "/api/lifecycle/process",
        headers={"X-User-Role": "PROCESSOR", "X-Participant-Id": "P-001"},
        json={
            "processor_id": "P-001",
            "operation_name": "Tomato Puree & Diced Packs",
            "input_batch_id": batch_id,
            "input_quantity_kg": 3460.0,
            "outputs": [
                {"name": "Puree Pack", "variety": "Puree Aseptic", "quantity_kg": 2400.0, "quality_grade": "A"},
                {"name": "Diced Cans", "variety": "Diced Canned", "quantity_kg": 750.0, "quality_grade": "A"},
            ],
            "waste_quantity_kg": 310.0,
            "quality_certificate_ref": "FSSAI/2026/TOM-01",
        },
    )
    assert proc_res.status_code == 200
    proc_data = proc_res.json()
    assert len(proc_data["child_batch_ids"]) == 2
    assert proc_data["total_output_kg"] == 3150.0

    # 5. Verify full lifecycle inspection endpoint
    life_res = client.get(f"/api/lifecycle/{batch_id}")
    assert life_res.status_code == 200
    l_data = life_res.json()
    assert l_data["batch"]["id"] == batch_id
    assert len(l_data["events"]) >= 3
    assert len(l_data["transfers"]) >= 1
    assert len(l_data["lineage"]["children"]) == 2


def test_live_chain_notifications_and_broadcast(client):
    # 1. Fetch Farmer notifications
    res = client.get("/api/notifications?participant_id=F-001&role=FARMER")
    assert res.status_code == 200
    data = res.json()
    assert "notifications" in data
    assert "unread_count" in data
    assert len(data["notifications"]) >= 1

    first_notif = data["notifications"][0]
    notif_id = first_notif["id"]

    # 2. Mark single notification as read
    read_res = client.post(f"/api/notifications/{notif_id}/read")
    assert read_res.status_code == 200
    assert read_res.json()["read"] is True

    # 3. Mark all as read for Farmer
    mark_all = client.post("/api/notifications/mark-all-read?participant_id=F-001&role=FARMER")
    assert mark_all.status_code == 200

    # 4. Fetch Auditor notifications (includes cold chain breaches and quarantine alerts)
    aud_res = client.get("/api/notifications?role=AUDITOR")
    assert aud_res.status_code == 200
    aud_data = aud_res.json()
    assert len(aud_data["notifications"]) >= 1
    categories = [n["category"] for n in aud_data["notifications"]]
    assert "COLD_CHAIN" in categories or "DISPUTE" in categories or "QUARANTINE" in categories

