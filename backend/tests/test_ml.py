from datetime import datetime

from app.ml.features import FEATURE_NAMES, compute_features, history_from_records
from app.ml.rules import evaluate_rules
from app.ml.scorer import score_one
from app.services import assess, history_records
from app.sim.generator import FRAUD_TYPES, SupplyChainSimulator


def base_tx(**over):
    tx = {
        "id": "TX-T",
        "batch_id": "B-T",
        "crop": "tomato",
        "stage": "FARM_TO_COOP",
        "seller_id": "F-001",
        "buyer_id": "C-001",
        "timestamp": datetime(2026, 5, 1, 10),
        "quantity_kg": 5000.0,
        "unit_price": 18.0,
        "total_value": 90000.0,
        "ref_price": 18.0,
        "quality_grade": "A",
        "moisture_pct": 90.0,
        "organic_claimed": False,
        "organic_cert_valid": False,
        "transit_km": 100.0,
        "transit_hours": 3.0,
        "temp_avg_c": 8.0,
        "temp_max_c": 10.0,
        "cold_chain_ok_claimed": True,
        "payment_mode": "BANK",
    }
    tx.update(over)
    return tx


SELLER = {"land_acres": 2.0, "registered_on": datetime(2024, 1, 1)}


def rule_ids(tx, records=()):
    feats = compute_features(tx, SELLER, history_from_records(tx, SELLER, list(records)))
    return {h["id"] for h in evaluate_rules(tx, feats)}


def test_clean_transaction_fires_no_rules():
    assert rule_ids(base_tx()) == set()


def test_each_rule_fires_on_its_pattern():
    assert "PRICE_BAND" in rule_ids(base_tx(unit_price=30.0))
    assert "YIELD_IMPOSSIBLE" in rule_ids(base_tx(quantity_kg=60000.0))  # 2 acres × 11 t/acre = 22 t max
    assert "COLD_CHAIN" in rule_ids(base_tx(temp_max_c=20.0))
    assert "ORGANIC_UNCERTIFIED" in rule_ids(base_tx(organic_claimed=True))
    assert "IMPOSSIBLE_TRANSIT" in rule_ids(base_tx(transit_km=500.0, transit_hours=2.0))
    earlier = base_tx(id="TX-0", timestamp=datetime(2026, 5, 1, 9))
    assert "DUPLICATE" in rule_ids(base_tx(), [earlier])
    loop = base_tx(id="TX-1", seller_id="F-001", buyer_id="C-001", timestamp=datetime(2026, 5, 1, 9))
    assert "CIRCULAR" in rule_ids(
        base_tx(seller_id="P-001", buyer_id="F-001", stage="PROCESSOR_TO_DISTRIBUTOR"), [loop]
    )


def test_honest_breach_disclosure_is_not_a_rule_hit():
    assert "COLD_CHAIN" not in rule_ids(base_tx(temp_max_c=20.0, cold_chain_ok_claimed=False))


def test_simulator_is_deterministic():
    a = [SupplyChainSimulator(seed=1, fraud_rate=0.2).next_transaction()["unit_price"] for _ in range(1)]
    b = [SupplyChainSimulator(seed=1, fraud_rate=0.2).next_transaction()["unit_price"] for _ in range(1)]
    assert a == b


def test_injected_fraud_is_detected_by_the_trained_model():
    sim = SupplyChainSimulator(seed=3)
    records = []
    for _ in range(80):
        records.append(sim.next_transaction())
    caught = 0
    for kind in FRAUD_TYPES:
        tx = sim.next_transaction(inject=kind)
        seller = sim.by_id[tx["seller_id"]].as_dict()
        feats = compute_features(tx, seller, history_from_records(tx, seller, records))
        caught += score_one(tx, feats)["decision"] != "CLEAR"
        records.append(tx)
    assert caught >= 5


def test_feature_parity_between_db_and_in_memory_history(client, session):
    """The API (DB-backed history) must produce the same features as the training path (in-memory)."""
    from sqlmodel import select

    from app.models import Participant, Transaction

    tx_row = session.exec(select(Transaction).order_by(Transaction.timestamp.desc())).first()
    tx = tx_row.model_dump()
    seller = session.get(Participant, tx["seller_id"]).model_dump()
    all_rows = [t.model_dump() for t in session.exec(select(Transaction)).all()]
    in_memory = compute_features(tx, seller, history_from_records(tx, seller, all_rows))
    feats, _ = assess(session, tx, with_explanation=False)
    assert history_records(session, tx)  # contract query returns rows
    for name in FEATURE_NAMES:
        assert abs(in_memory[name] - feats[name]) < 1e-9, name
