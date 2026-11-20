"""The live simulator instance shared by the API, plus rich demo seeding."""

from __future__ import annotations

import random
from collections import defaultdict
from datetime import datetime, timedelta

from sqlmodel import Session, select

from app.auth import DEFAULT_DEMO_USERS
from app.chain import identity, ledger
from app.db import SCHEMA_VERSION, reset_db
from app.ml.explain import explain
from app.ml.features import compute_features, history_from_records
from app.ml.scorer import score_many
from app.models import (
    AppMeta,
    Batch,
    BatchLineage,
    EnvironmentalReading,
    LifecycleEvent,
    Participant,
    ProcessingOperation,
    Transfer,
    UserAccount,
)
from app.services import ingest, review
from app.sim.generator import CROPS, SupplyChainSimulator, make_participants

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
    """Wipe the DB and build a rich lifecycle history: participants, batches, lineage, transfers, blocks."""
    reset_db()
    now = datetime.now().replace(microsecond=0)
    start = now - timedelta(minutes=9 * n)

    # 1. Seed Participants
    participants_map = {}
    for p in make_participants(42, now=start):
        part = Participant(**p.as_dict(), public_key=identity.public_key_hex(p.id))
        session.add(part)
        participants_map[p.id] = part

    # 2. Seed Default User Accounts
    for u in DEFAULT_DEMO_USERS:
        session.add(
            UserAccount(
                id=u["id"],
                username=u["username"],
                name=u["name"],
                email=u["email"],
                role=u["role"],
                participant_id=u["participant_id"],
                created_at=start,
            )
        )

    session.add(AppMeta(key="schema_version", value=SCHEMA_VERSION))
    session.commit()
    ledger.ensure_genesis(session, now=start - timedelta(minutes=5))

    # 3. Simulate transactions
    sim = SupplyChainSimulator(seed=seed, start=start, fraud_rate=0.08)
    by_batch: dict[str, list[dict]] = defaultdict(list)
    by_seller: dict[str, list[dict]] = defaultdict(list)
    txs = [sim.next_transaction() for _ in range(n)]

    t0, t1, end = txs[0]["timestamp"], txs[-1]["timestamp"], now - timedelta(minutes=2)
    scale = (end - start) / max(t1 - t0, timedelta(seconds=1))
    for tx in txs:
        tx["timestamp"] = (start + (tx["timestamp"] - t0) * scale).replace(microsecond=0)

    # Forgery examples
    rng = random.Random(seed)
    for i in rng.sample(range(n // 4, n - 20), 2):
        txs[i]["sim_label"] = "forged_signature"
        txs[i]["signature"] = identity.sign(txs[i], "D-001" if txs[i]["seller_id"] != "D-001" else "D-002")

    feats = []
    for tx in txs:
        seller = sim.by_id[tx["seller_id"]].as_dict()
        hist = history_from_records(tx, seller, by_batch[tx["batch_id"]] + by_seller[tx["seller_id"]][-60:])
        feats.append(compute_features(tx, seller, hist))
        by_batch[tx["batch_id"]].append(tx)
        by_seller[tx["seller_id"]].append(tx)

    scores = score_many([{**tx, "signature_valid": "signature" not in tx} for tx in txs], feats)
    quarantined = [i for i, s in enumerate(scores) if s["decision"] == "QUARANTINED"]
    leave_open = set(quarantined[-pending_quarantine:])

    # 4. Ingest transactions & create batches
    for i, (tx, f, s) in enumerate(zip(txs, feats, scores, strict=True)):
        s["features"] = f
        s["shap_top"] = explain(f) if s["decision"] != "CLEAR" else None

        # Build rich batch info
        sb = sim.batches.get(tx["batch_id"])
        b_dict = sb.as_dict() if sb else None
        if b_dict:
            b_dict.update(
                {
                    "variety": "Alphonso" if tx["crop"] == "mango" else "Grade-1 Special",
                    "farm_id": f"PLOT-{abs(hash(tx['batch_id'])) % 40 + 1}",
                    "farm_location": f"{participants_map.get(tx['seller_id'], Participant(region='Solapur')).region}, Maharashtra",
                    "initial_quantity_kg": tx["quantity_kg"],
                    "current_quantity_kg": tx["quantity_kg"],
                    "unit": "kg",
                    "quality_grade": tx["quality_grade"],
                    "cert_reference": f"NPOP/AGRI/{abs(hash(tx['batch_id'])) % 90000 + 10000}" if tx["organic_claimed"] else "",
                    "current_stage": tx["stage"].split("_")[-1] if "_" in tx["stage"] else "FARMER",
                    "current_holder_id": tx["buyer_id"],
                    "parent_batch_ids": [],
                    "status": "COMPLETED" if "RETAIL" in tx["stage"] else ("QUARANTINED" if s["decision"] == "QUARANTINED" else "ACTIVE"),
                    "created_at": tx["timestamp"] - timedelta(days=2),
                    "updated_at": tx["timestamp"],
                }
            )

        ingest(session, tx, batch=b_dict, assessment=s, now=tx["timestamp"])

        # Also create a Transfer entity for every transaction
        discrepancy = 0.0
        disputed = False
        if tx["stage"] in {"FARM_TO_COOP", "COOP_TO_PROCESSOR"} and rng.random() < 0.12:
            discrepancy = round(tx["quantity_kg"] * rng.uniform(0.015, 0.04), 1)
            disputed = discrepancy > 50.0

        transfer = Transfer(
            id=f"TRF-{tx['id'][3:] if tx['id'].startswith('TX-') else tx['id']}",
            batch_id=tx["batch_id"],
            sender_id=tx["seller_id"],
            receiver_id=tx["buyer_id"],
            stage=tx["stage"],
            dispatched_quantity_kg=tx["quantity_kg"],
            received_quantity_kg=max(0.0, tx["quantity_kg"] - discrepancy),
            discrepancy_kg=discrepancy,
            tolerance_kg=max(20.0, tx["quantity_kg"] * 0.02),
            discrepancy_flagged=disputed,
            status="DISPUTED" if disputed else "ACCEPTED",
            sender_signature=tx["signature"],
            receiver_signature=identity.sign({"tx_id": tx["id"], "received": tx["quantity_kg"] - discrepancy}, tx["buyer_id"]),
            sender_tx_id=tx["id"],
            shipment_id=f"SHP-{abs(hash(tx['id'])) % 90000 + 10000}",
            vehicle_number=f"MH-{abs(hash(tx['seller_id'])) % 48 + 1:02d}-TR-{abs(hash(tx['id'])) % 9000 + 1000}",
            transit_hours=tx["transit_hours"],
            transit_km=tx["transit_km"],
            temp_avg_c=tx["temp_avg_c"],
            temp_max_c=tx["temp_max_c"],
            cold_chain_breached=(tx["crop"] in CROPS and CROPS[tx["crop"]]["perishable"] and tx["temp_max_c"] > CROPS[tx["crop"]]["temp_limit"]),
            dispute_reason="Handling weight discrepancy exceeded 50kg permissible limit" if disputed else "",
            dispatched_at=tx["timestamp"] - timedelta(hours=tx["transit_hours"]),
            accepted_at=tx["timestamp"],
        )
        session.add(transfer)

        # Create Lifecycle Event for this handoff
        evt = LifecycleEvent(
            id=f"EVT-{tx['id'][3:] if tx['id'].startswith('TX-') else tx['id']}",
            batch_id=tx["batch_id"],
            event_type="TRANSFER_DISPUTE" if disputed else "TRANSFER_ACCEPT",
            stage=tx["stage"].split("_")[-1] if "_" in tx["stage"] else "TRANSFER",
            actor_id=tx["buyer_id"],
            recipient_id=tx["seller_id"],
            tx_id=tx["id"],
            quantity_before_kg=tx["quantity_kg"],
            quantity_after_kg=tx["quantity_kg"] - discrepancy,
            quantity_diff_kg=-discrepancy,
            quality_grade=tx["quality_grade"],
            temperature_c=tx["temp_max_c"],
            risk_score=s["risk"],
            status="FLAGGED" if disputed else ("QUARANTINED" if s["decision"] == "QUARANTINED" else "VALIDATED"),
            signature=transfer.receiver_signature,
            signature_valid=True,
            details={
                "discrepancy_kg": discrepancy,
                "disputed": disputed,
                "decision": s["decision"],
                "rule_hits": s["rule_hits"],
            },
            timestamp=tx["timestamp"],
        )
        session.add(evt)

        # Environmental Telemetry for cold chain
        if CROPS.get(tx["crop"], {}).get("perishable", False):
            session.add(
                EnvironmentalReading(
                    id=f"TEL-{tx['id'][3:] if tx['id'].startswith('TX-') else tx['id']}",
                    batch_id=tx["batch_id"],
                    shipment_id=transfer.shipment_id,
                    carrier_id=tx["seller_id"],
                    temp_c=tx["temp_max_c"],
                    temp_limit_c=CROPS[tx["crop"]]["temp_limit"],
                    breach_detected=transfer.cold_chain_breached,
                    sensor_id=f"IOT-BLE-{abs(hash(tx['batch_id'])) % 900 + 100}",
                    recorded_at=tx["timestamp"] - timedelta(hours=1),
                )
            )

        if s["decision"] == "QUARANTINED" and i not in leave_open:
            action = "reject" if tx["sim_label"] != "none" else "approve"
            note = "Confirmed fraud after document check." if action == "reject" else "Verified with buyer."
            reviewed_at = min(tx["timestamp"] + timedelta(minutes=30), now - timedelta(minutes=1))
            review(session, tx["id"], action, note, now=reviewed_at, seal=False)

    # 5. Create Flagship Lineage & Processing Demo Batch (AGRI-MH-SOL-2026-00001)
    flagship_id = "AGRI-MH-SOL-2026-00001"
    f_farmer = session.get(Participant, "F-001") or list(participants_map.values())[0]
    f_coop = session.get(Participant, "C-001") or list(participants_map.values())[1]
    f_proc = session.get(Participant, "P-001") or list(participants_map.values())[2]
    f_dist = session.get(Participant, "D-001") or list(participants_map.values())[3]
    f_ret = session.get(Participant, "R-001") or list(participants_map.values())[4]

    # Parent Harvest Batch: 5,000 kg Alphonso Mangoes
    b_parent = Batch(
        id=flagship_id,
        crop="mango",
        variety="Alphonso Grade-A",
        origin_farmer_id=f_farmer.id,
        farm_id="PLOT-SOL-09",
        farm_location="Solapur South Orchards, Maharashtra",
        harvest_date=now - timedelta(days=4),
        organic_claimed=True,
        organic_cert_valid=True,
        cert_reference="APEDA/ORG/2026/89421",
        region="Solapur",
        initial_quantity_kg=5000.0,
        current_quantity_kg=0.0,  # Processed into children
        unit="kg",
        quality_grade="A",
        current_stage="PROCESSOR",
        current_holder_id=f_proc.id,
        parent_batch_ids=[],
        status="PROCESSED",
        created_at=now - timedelta(days=4),
        updated_at=now - timedelta(days=2),
    )
    session.add(b_parent)

    # Harvest event
    session.add(
        LifecycleEvent(
            id="EVT-FLAG-01",
            batch_id=flagship_id,
            event_type="HARVEST",
            stage="FARMER",
            actor_id=f_farmer.id,
            quantity_before_kg=0.0,
            quantity_after_kg=5000.0,
            quantity_diff_kg=5000.0,
            quality_grade="A",
            risk_score=0.04,
            status="VALIDATED",
            signature=identity.sign({"id": flagship_id, "qty": 5000.0}, f_farmer.id),
            details={"acres": 6.5, "crop": "mango", "organic_cert": "APEDA/ORG/2026/89421"},
            timestamp=now - timedelta(days=4),
        )
    )

    # Farmer -> Coop Transfer with 130 kg discrepancy (5,000 kg -> 4,870 kg)
    session.add(
        Transfer(
            id="TRF-FLAG-01",
            batch_id=flagship_id,
            sender_id=f_farmer.id,
            receiver_id=f_coop.id,
            stage="FARM_TO_COOP",
            dispatched_quantity_kg=5000.0,
            received_quantity_kg=4870.0,
            discrepancy_kg=130.0,
            tolerance_kg=50.0,
            discrepancy_flagged=True,
            status="DISPUTED",
            sender_signature=identity.sign({"batch": flagship_id, "qty": 5000.0}, f_farmer.id),
            receiver_signature=identity.sign({"batch": flagship_id, "qty": 4870.0}, f_coop.id),
            shipment_id="SHP-FLAG-01",
            vehicle_number="MH-13-AG-4912",
            transit_hours=4.0,
            transit_km=110.0,
            temp_avg_c=12.5,
            temp_max_c=13.8,
            dispute_reason="Cooperative weighbridge recorded 4,870 kg (130 kg discrepancy exceeds 50 kg tolerance limit)",
            dispatched_at=now - timedelta(days=3, hours=18),
            accepted_at=now - timedelta(days=3, hours=14),
        )
    )

    session.add(
        LifecycleEvent(
            id="EVT-FLAG-02",
            batch_id=flagship_id,
            event_type="TRANSFER_DISPUTE",
            stage="COOP",
            actor_id=f_coop.id,
            recipient_id=f_farmer.id,
            quantity_before_kg=5000.0,
            quantity_after_kg=4870.0,
            quantity_diff_kg=-130.0,
            quality_grade="A",
            risk_score=0.74,
            status="FLAGGED",
            signature=identity.sign({"event": "dispute", "batch": flagship_id}, f_coop.id),
            details={"discrepancy_kg": 130.0, "tolerance_kg": 50.0, "note": "Handling loss under dispute"},
            timestamp=now - timedelta(days=3, hours=14),
        )
    )

    # Processing transformation & split: 4,870 kg -> Child A (Pulp 3,200 kg) + Child B (Slices 900 kg) + 770 kg waste
    child_a_id = f"{flagship_id}-A"
    child_b_id = f"{flagship_id}-B"

    b_child_a = Batch(
        id=child_a_id,
        crop="mango",
        variety="Alphonso Aseptic Pulp",
        origin_farmer_id=f_farmer.id,
        farm_id="PLOT-SOL-09",
        farm_location="Solapur South Orchards, Maharashtra",
        harvest_date=now - timedelta(days=4),
        organic_claimed=True,
        organic_cert_valid=True,
        cert_reference="APEDA/ORG/2026/89421",
        region="Solapur",
        initial_quantity_kg=3200.0,
        current_quantity_kg=3200.0,
        unit="kg",
        quality_grade="A+",
        current_stage="DISTRIBUTOR",
        current_holder_id=f_dist.id,
        parent_batch_ids=[flagship_id],
        status="IN_TRANSIT",
        created_at=now - timedelta(days=2),
        updated_at=now - timedelta(hours=10),
    )
    b_child_b = Batch(
        id=child_b_id,
        crop="mango",
        variety="Alphonso Dehydrated Slices",
        origin_farmer_id=f_farmer.id,
        farm_id="PLOT-SOL-09",
        farm_location="Solapur South Orchards, Maharashtra",
        harvest_date=now - timedelta(days=4),
        organic_claimed=True,
        organic_cert_valid=True,
        cert_reference="APEDA/ORG/2026/89421",
        region="Solapur",
        initial_quantity_kg=900.0,
        current_quantity_kg=900.0,
        unit="kg",
        quality_grade="A",
        current_stage="PROCESSOR",
        current_holder_id=f_proc.id,
        parent_batch_ids=[flagship_id],
        status="ACTIVE",
        created_at=now - timedelta(days=2),
        updated_at=now - timedelta(days=2),
    )
    session.add(b_child_a)
    session.add(b_child_b)

    # Lineage links
    session.add(
        BatchLineage(
            id="LIN-FLAG-01",
            parent_batch_id=flagship_id,
            child_batch_id=child_a_id,
            operation_type="SPLIT",
            input_qty_kg=3500.0,
            output_qty_kg=3200.0,
            ratio=0.657,
            notes="Aseptic Mango Pulp Line",
            created_at=now - timedelta(days=2),
        )
    )
    session.add(
        BatchLineage(
            id="LIN-FLAG-02",
            parent_batch_id=flagship_id,
            child_batch_id=child_b_id,
            operation_type="SPLIT",
            input_qty_kg=1370.0,
            output_qty_kg=900.0,
            ratio=0.185,
            notes="Vacuum Freeze-Dried Mango Slices Line",
            created_at=now - timedelta(days=2),
        )
    )

    # Processing operation record
    session.add(
        ProcessingOperation(
            id="PROC-FLAG-01",
            processor_id=f_proc.id,
            operation_name="Industrial Mango Pulping & Slice Fractionation",
            input_batch_id=flagship_id,
            input_quantity_kg=4870.0,
            output_batch_ids=[child_a_id, child_b_id],
            output_quantity_kg=4100.0,
            waste_quantity_kg=770.0,
            byproducts_quantity_kg=0.0,
            yield_percentage=84.19,
            quality_certificate_ref="FSSAI/PROC/2026/9102",
            notes="Yield 84.2%, skin and seed fiber waste: 770 kg",
            started_at=now - timedelta(days=2, hours=4),
            completed_at=now - timedelta(days=2),
        )
    )

    # Cold chain telemetry with temperature breach on Child A (refrigerated transit to retailer)
    session.add(
        EnvironmentalReading(
            id="TEL-FLAG-01",
            batch_id=child_a_id,
            shipment_id="SHP-COLD-99",
            carrier_id=f_dist.id,
            temp_c=18.4,
            temp_limit_c=14.0,
            humidity_pct=88.0,
            breach_detected=True,
            sensor_id="IOT-SENS-BLE-09",
            recorded_at=now - timedelta(hours=6),
        )
    )
    session.add(
        LifecycleEvent(
            id="EVT-FLAG-03",
            batch_id=child_a_id,
            event_type="COLD_CHAIN_ALERT",
            stage="DISTRIBUTOR",
            actor_id=f_dist.id,
            temperature_c=18.4,
            risk_score=0.91,
            status="QUARANTINED",
            details={
                "sensor_id": "IOT-SENS-BLE-09",
                "recorded_temp_c": 18.4,
                "permissible_limit_c": 14.0,
                "excursion_duration_min": 145,
                "shipment_id": "SHP-COLD-99",
            },
            timestamp=now - timedelta(hours=6),
        )
    )

    # Seed rich initial notifications tailored to each chain participant & auditor
    from app.models import ChainNotification

    demo_notifications = [
        # Farmer Ramesh (F-001)
        ChainNotification(
            id="NOTIF-SEED-F01",
            recipient_id=f_farmer.id,
            role="FARMER",
            batch_id=flagship_id,
            title="Harvest Batch Registered",
            message=f"Batch {flagship_id} (5,000 kg Alphonso Mangoes) registered at Solapur South Orchards.",
            category="LIFECYCLE",
            severity="SUCCESS",
            read=True,
            created_at=now - timedelta(days=4),
        ),
        ChainNotification(
            id="NOTIF-SEED-F02",
            recipient_id=f_farmer.id,
            role="FARMER",
            batch_id=flagship_id,
            title="Weighbridge Discrepancy Flagged",
            message=f"Solapur Agro-Cooperative weighed 4,870 kg (-130 kg variance vs 50 kg tolerance). Handoff status set to DISPUTED.",
            category="DISPUTE",
            severity="WARNING",
            read=False,
            created_at=now - timedelta(days=3, hours=14),
        ),
        ChainNotification(
            id="NOTIF-SEED-F03",
            recipient_id=f_farmer.id,
            role="FARMER",
            batch_id=flagship_id,
            title="Produce Lineage Fractionated",
            message=f"Your harvest {flagship_id} was processed by AgroPack Foods into Aseptic Pulp (3,200 kg) & Dehydrated Slices (900 kg).",
            category="LIFECYCLE",
            severity="INFO",
            read=False,
            created_at=now - timedelta(days=2),
        ),

        # Coop Solapur (C-001)
        ChainNotification(
            id="NOTIF-SEED-C01",
            recipient_id=f_coop.id,
            role="COOP",
            batch_id=flagship_id,
            title="Inward Shipment Received with Variance",
            message="Transfer TRF-FLAG-01 from Ramesh Patil weighed in at 4,870 kg. Discrepancy of 130 kg logged under review.",
            category="DISPUTE",
            severity="WARNING",
            read=True,
            created_at=now - timedelta(days=3, hours=14),
        ),
        ChainNotification(
            id="NOTIF-SEED-C02",
            recipient_id=f_coop.id,
            role="COOP",
            batch_id=flagship_id,
            title="Consignment Dispatched to Processor",
            message="4,870 kg mangoes dispatched to AgroPack Foods Pvt Ltd. Sealed on ledger.",
            category="TRANSFER",
            severity="SUCCESS",
            read=True,
            created_at=now - timedelta(days=2, hours=6),
        ),

        # Processor AgroPack (P-001)
        ChainNotification(
            id="NOTIF-SEED-P01",
            recipient_id=f_proc.id,
            role="PROCESSOR",
            batch_id=flagship_id,
            title="Inward Raw Batch Accepted",
            message=f"Batch {flagship_id} (4,870 kg) received and inspected from Solapur Agro-Cooperative.",
            category="TRANSFER",
            severity="SUCCESS",
            read=True,
            created_at=now - timedelta(days=2, hours=4),
        ),
        ChainNotification(
            id="NOTIF-SEED-P02",
            recipient_id=f_proc.id,
            role="PROCESSOR",
            batch_id=flagship_id,
            title="Processing & Fractionation Sealed",
            message=f"Pulping & dehydration complete. Generated child batches {child_a_id} and {child_b_id} (84.2% mass balance).",
            category="LIFECYCLE",
            severity="SUCCESS",
            read=False,
            created_at=now - timedelta(days=2),
        ),

        # Distributor ColdTrans (D-001)
        ChainNotification(
            id="NOTIF-SEED-D01",
            recipient_id=f_dist.id,
            role="DISTRIBUTOR",
            batch_id=child_a_id,
            title="Refrigerated Shipment In Transit",
            message=f"Consignment SHP-COLD-99 (3,200 kg Aseptic Mango Pulp) dispatched on vehicle MH-12-TR-9421.",
            category="TRANSFER",
            severity="INFO",
            read=True,
            created_at=now - timedelta(hours=10),
        ),
        ChainNotification(
            id="NOTIF-SEED-D02",
            recipient_id=f_dist.id,
            role="DISTRIBUTOR",
            batch_id=child_a_id,
            title="CRITICAL: Cold-Chain IoT Breach",
            message=f"Sensor IOT-SENS-BLE-09 logged 18.4°C (Limit: 14.0°C) for 145 min on shipment SHP-COLD-99. Batch quarantined.",
            category="COLD_CHAIN",
            severity="CRITICAL",
            read=False,
            created_at=now - timedelta(hours=6),
        ),

        # Retailer FreshMart (R-001)
        ChainNotification(
            id="NOTIF-SEED-R01",
            recipient_id=f_ret.id,
            role="RETAILER",
            batch_id=child_a_id,
            title="Incoming Consignment In Transit",
            message=f"Shipment SHP-COLD-99 with 3,200 kg Organic Mango Pulp scheduled for retail arrival.",
            category="TRANSFER",
            severity="INFO",
            read=False,
            created_at=now - timedelta(hours=8),
        ),
        ChainNotification(
            id="NOTIF-SEED-R02",
            recipient_id=f_ret.id,
            role="RETAILER",
            batch_id=child_a_id,
            title="ALERT: Upstream Cold-Chain Excursion",
            message=f"Consignment SHP-COLD-99 flagged with 18.4°C breach. Requires temperature verification prior to retail inward.",
            category="COLD_CHAIN",
            severity="CRITICAL",
            read=False,
            created_at=now - timedelta(hours=6),
        ),

        # Auditor / Admin Tower
        ChainNotification(
            id="NOTIF-SEED-AUD01",
            recipient_id="ALL_ADMINS",
            role="AUDITOR",
            batch_id=child_a_id,
            title="CRITICAL: Cold-Chain Telemetry Excursion",
            message=f"Shipment SHP-COLD-99 breached temperature threshold: 18.4°C recorded (Limit 14.0°C). Carrier: {f_dist.name}.",
            category="COLD_CHAIN",
            severity="CRITICAL",
            read=False,
            created_at=now - timedelta(hours=6),
        ),
        ChainNotification(
            id="NOTIF-SEED-AUD02",
            recipient_id="ALL_ADMINS",
            role="AUDITOR",
            batch_id=flagship_id,
            title="Active Weighbridge Dispute",
            message=f"Batch {flagship_id}: Solapur Agro logged 130 kg discrepancy vs Ramesh Patil. Investigation pending.",
            category="DISPUTE",
            severity="WARNING",
            read=False,
            created_at=now - timedelta(days=3, hours=14),
        ),
        ChainNotification(
            id="NOTIF-SEED-AUD03",
            recipient_id="ALL_ADMINS",
            role="AUDITOR",
            batch_id=None,
            title="Quarantine Review Queue Alert",
            message=f"{len(leave_open)} suspicious transactions flagged by Sentinel AI models awaiting auditor resolution.",
            category="QUARANTINE",
            severity="CRITICAL",
            read=False,
            created_at=now - timedelta(hours=2),
        ),
    ]

    for notif in demo_notifications:
        session.add(notif)

    session.commit()
    ledger.seal_pending(session, force=True, now=now)

    set_sim(sim)
    sim.clock = now
    return {"transactions": n, "quarantined_open": len(leave_open), "flagship_batch": flagship_id}
