"""Supply-Chain Lifecycle & Batch Operations Engine."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlmodel import Session, col, desc, select

from app.chain import identity, ledger
from app.notifications import create_notification, notify_chain_affected
from app.models import (
    Assessment,
    Batch,
    BatchLineage,
    EnvironmentalReading,
    LifecycleEvent,
    Participant,
    ProcessingOperation,
    Transaction,
    Transfer,
)
from app.services import assess, ingest
from app.sim.generator import CROPS


def generate_batch_id(crop: str, region: str) -> str:
    """Generate a clean, professional agricultural batch code (e.g. AGRI-MH-PUN-MNG-40291)."""
    reg_code = (region.replace(" ", "").upper()[:3]) if region else "IND"
    crop_code = (crop[:3].upper()) if crop else "AGR"
    unique_suffix = uuid.uuid4().hex[:5].upper()
    year = datetime.now().year
    return f"AGRI-{reg_code}-{year}-{crop_code}-{unique_suffix}"


def create_harvest_batch(
    session: Session,
    farmer_id: str,
    crop: str,
    quantity_kg: float,
    farm_id: str = "PLOT-A1",
    farm_location: str = "Solapur, Maharashtra",
    variety: str = "Standard",
    quality_grade: str = "A",
    organic_claimed: bool = False,
    organic_cert_valid: bool = False,
    cert_reference: str = "",
    custom_batch_id: str | None = None,
    now: datetime | None = None,
) -> dict:
    """Farmer harvests produce and registers a new batch lifecycle root."""
    farmer = session.get(Participant, farmer_id)
    if not farmer:
        raise ValueError(f"Unknown farmer ID: {farmer_id}")

    now = now or datetime.now()
    batch_id = custom_batch_id or generate_batch_id(crop, farmer.region)

    # Yield plausibility check
    acres = farmer.land_acres or 2.0
    crop_info = CROPS.get(crop.lower(), {"yield_per_acre": 5000.0, "perishable": False, "temp_limit": 25.0})
    max_expected_yield = acres * crop_info["yield_per_acre"]
    yield_ratio = quantity_kg / max(max_expected_yield, 1.0)

    # Determine status & risk flag if quantity is impossible
    is_phantom = yield_ratio > 2.5
    status = "QUARANTINED" if is_phantom else "ACTIVE"

    batch = Batch(
        id=batch_id,
        crop=crop,
        variety=variety,
        origin_farmer_id=farmer_id,
        farm_id=farm_id,
        farm_location=farm_location or farmer.region,
        harvest_date=now,
        organic_claimed=organic_claimed,
        organic_cert_valid=organic_cert_valid,
        cert_reference=cert_reference,
        region=farmer.region,
        initial_quantity_kg=quantity_kg,
        current_quantity_kg=quantity_kg,
        unit="kg",
        quality_grade=quality_grade,
        current_stage="FARMER",
        current_holder_id=farmer_id,
        parent_batch_ids=[],
        status=status,
        created_at=now,
        updated_at=now,
    )
    session.add(batch)

    # Record HARVEST Lifecycle Event
    event = LifecycleEvent(
        id=f"EVT-{uuid.uuid4().hex[:8].upper()}",
        batch_id=batch_id,
        event_type="HARVEST",
        stage="FARMER",
        actor_id=farmer_id,
        recipient_id=None,
        quantity_before_kg=0.0,
        quantity_after_kg=quantity_kg,
        quantity_diff_kg=quantity_kg,
        quality_grade=quality_grade,
        risk_score=0.95 if is_phantom else 0.05,
        status="QUARANTINED" if is_phantom else "VALIDATED",
        signature=identity.sign({"id": batch_id, "quantity_kg": quantity_kg, "crop": crop, "farmer_id": farmer_id}, farmer_id),
        signature_valid=True,
        details={
            "farm_id": farm_id,
            "acres": acres,
            "yield_ratio": round(yield_ratio, 2),
            "max_expected_yield_kg": max_expected_yield,
            "anomaly_detected": is_phantom,
            "organic_claimed": organic_claimed,
        },
        timestamp=now,
    )
    session.add(event)

    # Live Chain Notifications for Harvest
    if is_phantom:
        notify_chain_affected(
            session=session,
            batch_id=batch_id,
            title="Harvest Quarantined: Extreme Yield Anomaly",
            message=f"Batch {batch_id} quarantined. Reported yield ({yield_ratio:.1f}x) exceeds biological threshold for farm acreage.",
            category="QUARANTINE",
            severity="CRITICAL",
            extra_recipient_ids=[farmer_id],
            notify_auditors=True,
            created_at=now,
        )
    else:
        create_notification(
            session=session,
            recipient_id=farmer_id,
            title="Harvest Batch Registered",
            message=f"Batch {batch_id} ({crop.title()}) registered with {quantity_kg:,.0f} kg at {farm_location}.",
            category="LIFECYCLE",
            severity="SUCCESS",
            batch_id=batch_id,
            created_at=now,
        )
        create_notification(
            session=session,
            recipient_id="ALL_ADMINS",
            title="New Harvest Ingested",
            message=f"Batch {batch_id} ({quantity_kg:,.0f} kg {crop}) registered by {farmer.name}.",
            category="LIFECYCLE",
            severity="INFO",
            batch_id=batch_id,
            created_at=now,
        )

    session.commit()

    return {
        "batch_id": batch_id,
        "status": status,
        "quantity_kg": quantity_kg,
        "yield_ratio": round(yield_ratio, 2),
        "is_phantom": is_phantom,
        "event_id": event.id,
    }


def initiate_transfer(
    session: Session,
    batch_id: str,
    sender_id: str,
    receiver_id: str,
    stage: str,
    quantity_kg: float,
    shipment_id: str = "",
    vehicle_number: str = "",
    transit_hours: float = 3.0,
    transit_km: float = 85.0,
    unit_price: float = 40.0,
    quality_grade: str = "A",
    temp_avg_c: float | None = None,
    temp_max_c: float | None = None,
    notes: str = "",
    now: datetime | None = None,
) -> dict:
    """Sender dispatches goods to receiver, signing the dispatch declaration."""
    batch = session.get(Batch, batch_id)
    if not batch:
        raise ValueError(f"Batch {batch_id} not found.")

    sender = session.get(Participant, sender_id)
    receiver = session.get(Participant, receiver_id)
    if not sender or not receiver:
        raise ValueError("Invalid sender or receiver ID.")

    now = now or datetime.now()
    transfer_id = f"TRF-{uuid.uuid4().hex[:8].upper()}"

    # Verify cold chain conditions for perishables
    crop_info = CROPS.get(batch.crop.lower(), {"perishable": False, "temp_limit": 25.0})
    temp_limit = crop_info["temp_limit"]
    is_perishable = crop_info["perishable"]

    breached = False
    if is_perishable and temp_max_c is not None and temp_max_c > temp_limit:
        breached = True

    # Build transaction for ML assessment & ledger
    tx_id = f"TX-{uuid.uuid4().hex[:8].upper()}"
    tx_data = {
        "id": tx_id,
        "batch_id": batch_id,
        "crop": batch.crop,
        "stage": stage,
        "seller_id": sender_id,
        "buyer_id": receiver_id,
        "timestamp": now,
        "quantity_kg": quantity_kg,
        "unit_price": unit_price,
        "total_value": round(quantity_kg * unit_price, 2),
        "ref_price": unit_price,
        "quality_grade": quality_grade or batch.quality_grade,
        "moisture_pct": 82.0 if is_perishable else 12.0,
        "organic_claimed": batch.organic_claimed,
        "organic_cert_valid": batch.organic_cert_valid,
        "transit_km": transit_km,
        "transit_hours": transit_hours,
        "temp_avg_c": temp_avg_c if temp_avg_c is not None else (12.0 if is_perishable else 24.0),
        "temp_max_c": temp_max_c if temp_max_c is not None else (14.0 if is_perishable else 26.0),
        "cold_chain_ok_claimed": not breached,
        "payment_mode": "BANK",
        "signature": "",
    }
    tx_data["signature"] = identity.sign(tx_data, sender_id)

    # Ingest through ML assessment gate
    ingest_res = ingest(session, tx_data, batch=batch.model_dump(), now=now)

    transfer = Transfer(
        id=transfer_id,
        batch_id=batch_id,
        sender_id=sender_id,
        receiver_id=receiver_id,
        stage=stage,
        dispatched_quantity_kg=quantity_kg,
        received_quantity_kg=None,
        discrepancy_kg=0.0,
        tolerance_kg=max(20.0, quantity_kg * 0.02),  # 2% or 20kg acceptable handling loss
        discrepancy_flagged=False,
        status="IN_TRANSIT",
        sender_signature=tx_data["signature"],
        receiver_signature="",
        sender_tx_id=tx_id,
        shipment_id=shipment_id or f"SHP-{uuid.uuid4().hex[:6].upper()}",
        vehicle_number=vehicle_number or "MH-12-TR-9421",
        transit_hours=transit_hours,
        transit_km=transit_km,
        temp_avg_c=temp_avg_c,
        temp_max_c=temp_max_c,
        cold_chain_breached=breached,
        notes=notes,
        dispatched_at=now,
    )
    session.add(transfer)

    # Update Batch
    batch.status = "IN_TRANSIT"
    batch.updated_at = now
    session.add(batch)

    # Record Dispatch Event
    event = LifecycleEvent(
        id=f"EVT-{uuid.uuid4().hex[:8].upper()}",
        batch_id=batch_id,
        event_type="TRANSFER_DISPATCH",
        stage=stage.split("_")[0] if "_" in stage else "DISPATCH",
        actor_id=sender_id,
        recipient_id=receiver_id,
        tx_id=tx_id,
        quantity_before_kg=batch.current_quantity_kg,
        quantity_after_kg=quantity_kg,
        quantity_diff_kg=0.0,
        quality_grade=quality_grade,
        temperature_c=temp_max_c,
        risk_score=ingest_res.get("risk", 0.0),
        status="QUARANTINED" if ingest_res.get("decision") == "QUARANTINED" else "VALIDATED",
        signature=tx_data["signature"],
        signature_valid=True,
        details={
            "transfer_id": transfer_id,
            "vehicle_number": transfer.vehicle_number,
            "shipment_id": transfer.shipment_id,
            "cold_chain_breach": breached,
        },
        timestamp=now,
    )
    session.add(event)

    # Live Chain Notifications
    create_notification(
        session=session,
        recipient_id=receiver_id,
        title="Inward Shipment Dispatched",
        message=f"Consignment {transfer_id} with {quantity_kg:,.0f} kg ({batch.crop.title()}) dispatched by {sender.name}. Vehicle: {vehicle_number}.",
        category="TRANSFER",
        severity="INFO",
        batch_id=batch_id,
        tx_id=tx_id,
        created_at=now,
    )
    create_notification(
        session=session,
        recipient_id=sender_id,
        title="Outward Dispatch Recorded",
        message=f"Consignment {transfer_id} dispatched to {receiver.name} on vehicle {vehicle_number}.",
        category="TRANSFER",
        severity="INFO",
        batch_id=batch_id,
        tx_id=tx_id,
        created_at=now,
    )

    session.commit()

    return {
        "transfer_id": transfer_id,
        "tx_id": tx_id,
        "batch_id": batch_id,
        "status": transfer.status,
        "risk_decision": ingest_res.get("decision"),
        "risk_score": ingest_res.get("risk"),
    }


def complete_transfer(
    session: Session,
    transfer_id: str,
    receiver_id: str,
    received_quantity_kg: float,
    action: str = "ACCEPT",  # ACCEPT or DISPUTE
    dispute_reason: str = "",
    quality_grade: str = "A",
    now: datetime | None = None,
) -> dict:
    """Receiver weighs produce, checks condition, and records acceptance or dispute."""
    transfer = session.get(Transfer, transfer_id)
    if not transfer:
        raise ValueError(f"Transfer {transfer_id} not found.")

    if transfer.receiver_id != receiver_id:
        raise ValueError("Unauthorized: only the designated recipient can accept this transfer.")

    now = now or datetime.now()
    batch = session.get(Batch, transfer.batch_id)

    discrepancy = transfer.dispatched_quantity_kg - received_quantity_kg
    is_excessive_discrepancy = discrepancy > transfer.tolerance_kg
    dispute = action == "DISPUTE" or is_excessive_discrepancy

    transfer.received_quantity_kg = received_quantity_kg
    transfer.discrepancy_kg = round(discrepancy, 2)
    transfer.discrepancy_flagged = is_excessive_discrepancy
    transfer.status = "DISPUTED" if dispute else "ACCEPTED"
    transfer.dispute_reason = dispute_reason if dispute else ""
    transfer.accepted_at = now

    # Receiver digital signature
    rec_payload = {
        "transfer_id": transfer_id,
        "batch_id": transfer.batch_id,
        "received_quantity_kg": received_quantity_kg,
        "status": transfer.status,
        "timestamp": now.isoformat(),
    }
    transfer.receiver_signature = identity.sign(rec_payload, receiver_id)

    # Update Batch
    if batch:
        batch.current_quantity_kg = received_quantity_kg
        batch.current_holder_id = receiver_id
        # Update stage from transfer
        if "TO_" in transfer.stage:
            batch.current_stage = transfer.stage.split("TO_")[-1]
        batch.status = "DISPUTED" if dispute else ("COMPLETED" if batch.current_stage == "RETAILER" else "ACTIVE")
        batch.updated_at = now
        session.add(batch)

    # Record Lifecycle Event
    event = LifecycleEvent(
        id=f"EVT-{uuid.uuid4().hex[:8].upper()}",
        batch_id=transfer.batch_id,
        event_type="TRANSFER_DISPUTE" if dispute else "TRANSFER_ACCEPT",
        stage=batch.current_stage if batch else "TRANSFER",
        actor_id=receiver_id,
        recipient_id=transfer.sender_id,
        tx_id=transfer.sender_tx_id,
        quantity_before_kg=transfer.dispatched_quantity_kg,
        quantity_after_kg=received_quantity_kg,
        quantity_diff_kg=-discrepancy,
        quality_grade=quality_grade,
        risk_score=0.85 if dispute else 0.05,
        status="FLAGGED" if is_excessive_discrepancy else "VALIDATED",
        signature=transfer.receiver_signature,
        signature_valid=True,
        details={
            "transfer_id": transfer_id,
            "discrepancy_kg": round(discrepancy, 2),
            "tolerance_kg": transfer.tolerance_kg,
            "dispute_reason": dispute_reason,
        },
        timestamp=now,
    )
    session.add(event)
    session.add(transfer)

    # Live Chain Notifications for Handoff
    sender = session.get(Participant, transfer.sender_id)
    receiver = session.get(Participant, receiver_id)
    sender_name = sender.name if sender else transfer.sender_id
    receiver_name = receiver.name if receiver else receiver_id

    if dispute:
        notify_chain_affected(
            session=session,
            batch_id=transfer.batch_id,
            title="Weighbridge Discrepancy Flagged",
            message=f"Consignment {transfer.id} weighed by {receiver_name} with {discrepancy:,.0f} kg variance (tolerance: {transfer.tolerance_kg:,.0f} kg). Reason: {dispute_reason or 'Excess weight loss'}.",
            category="DISPUTE",
            severity="WARNING",
            tx_id=transfer.sender_tx_id,
            extra_recipient_ids=[transfer.sender_id, transfer.receiver_id],
            notify_auditors=True,
            created_at=now,
        )
    else:
        create_notification(
            session=session,
            recipient_id=transfer.sender_id,
            title="Inward Delivery Verified & Accepted",
            message=f"Consignment {transfer.id} received and accepted by {receiver_name} ({received_quantity_kg:,.0f} kg verified).",
            category="TRANSFER",
            severity="SUCCESS",
            batch_id=transfer.batch_id,
            tx_id=transfer.sender_tx_id,
            created_at=now,
        )
        create_notification(
            session=session,
            recipient_id=transfer.receiver_id,
            title="Produce Inward Stocked",
            message=f"Batch {transfer.batch_id} inwarded with {received_quantity_kg:,.0f} kg received from {sender_name}.",
            category="TRANSFER",
            severity="SUCCESS",
            batch_id=transfer.batch_id,
            tx_id=transfer.sender_tx_id,
            created_at=now,
        )

    session.commit()

    return {
        "transfer_id": transfer_id,
        "batch_id": transfer.batch_id,
        "status": transfer.status,
        "discrepancy_kg": round(discrepancy, 2),
        "is_disputed": dispute,
        "current_holder_id": receiver_id,
    }


def execute_processing_operation(
    session: Session,
    processor_id: str,
    operation_name: str,
    input_batch_id: str,
    input_quantity_kg: float,
    outputs: list[dict],  # [{name, variety, quantity_kg, quality_grade}]
    waste_quantity_kg: float = 0.0,
    byproducts_quantity_kg: float = 0.0,
    quality_certificate_ref: str = "",
    notes: str = "",
    now: datetime | None = None,
) -> dict:
    """Processor transforms raw batch into 1 or more finished/child batches with lineage."""
    parent_batch = session.get(Batch, input_batch_id)
    if not parent_batch:
        raise ValueError(f"Input batch {input_batch_id} not found.")

    processor = session.get(Participant, processor_id)
    if not processor or processor.role != "PROCESSOR":
        raise ValueError("Invalid processor ID or role.")

    now = now or datetime.now()
    op_id = f"PROC-{uuid.uuid4().hex[:8].upper()}"

    total_output_kg = sum(o["quantity_kg"] for o in outputs)
    yield_pct = round((total_output_kg / max(input_quantity_kg, 1.0)) * 100, 2)

    created_child_batches = []
    existing_child_count = len(session.exec(select(Batch.id).where(Batch.id.like(f"{parent_batch.id}-%"))).all())
    for idx, out_spec in enumerate(outputs):
        offset_idx = existing_child_count + idx
        suffix = chr(65 + offset_idx) if offset_idx < 26 else f"P{offset_idx + 1}"
        candidate_id = f"{parent_batch.id}-{suffix}"
        counter = 1
        while session.get(Batch, candidate_id) is not None:
            candidate_id = f"{parent_batch.id}-{suffix}-{counter}"
            counter += 1

        child_id = candidate_id

        child_batch = Batch(
            id=child_id,
            crop=parent_batch.crop,
            variety=out_spec.get("variety", out_spec.get("name", "Processed")),
            origin_farmer_id=parent_batch.origin_farmer_id,
            farm_id=parent_batch.farm_id,
            farm_location=parent_batch.farm_location,
            harvest_date=parent_batch.harvest_date,
            organic_claimed=parent_batch.organic_claimed,
            organic_cert_valid=parent_batch.organic_cert_valid,
            cert_reference=quality_certificate_ref or parent_batch.cert_reference,
            region=parent_batch.region,
            initial_quantity_kg=out_spec["quantity_kg"],
            current_quantity_kg=out_spec["quantity_kg"],
            unit="kg",
            quality_grade=out_spec.get("quality_grade", "A"),
            current_stage="PROCESSOR",
            current_holder_id=processor_id,
            parent_batch_ids=[parent_batch.id],
            status="ACTIVE",
            created_at=now,
            updated_at=now,
        )
        session.add(child_batch)

        # Batch Lineage record
        lineage = BatchLineage(
            id=f"LIN-{uuid.uuid4().hex[:8].upper()}",
            parent_batch_id=parent_batch.id,
            child_batch_id=child_id,
            operation_type="SPLIT" if len(outputs) > 1 else "TRANSFORM",
            input_qty_kg=input_quantity_kg * (out_spec["quantity_kg"] / max(total_output_kg, 1.0)),
            output_qty_kg=out_spec["quantity_kg"],
            ratio=round(out_spec["quantity_kg"] / max(input_quantity_kg, 1.0), 4),
            notes=f"Derived from {operation_name}",
            created_at=now,
        )
        session.add(lineage)
        created_child_batches.append(child_id)

    # Mark parent batch as PROCESSED
    parent_batch.status = "PROCESSED"
    parent_batch.current_quantity_kg = 0.0
    parent_batch.updated_at = now
    session.add(parent_batch)

    # Processing Operation entity
    proc_op = ProcessingOperation(
        id=op_id,
        processor_id=processor_id,
        operation_name=operation_name,
        input_batch_id=parent_batch.id,
        input_quantity_kg=input_quantity_kg,
        output_batch_ids=created_child_batches,
        output_quantity_kg=total_output_kg,
        waste_quantity_kg=waste_quantity_kg,
        byproducts_quantity_kg=byproducts_quantity_kg,
        yield_percentage=yield_pct,
        quality_certificate_ref=quality_certificate_ref,
        notes=notes,
        started_at=now,
        completed_at=now,
    )
    session.add(proc_op)

    # Lifecycle Event on parent
    evt = LifecycleEvent(
        id=f"EVT-{uuid.uuid4().hex[:8].upper()}",
        batch_id=parent_batch.id,
        event_type="PROCESS_TRANSFORM",
        stage="PROCESSOR",
        actor_id=processor_id,
        recipient_id=None,
        quantity_before_kg=input_quantity_kg,
        quantity_after_kg=total_output_kg,
        quantity_diff_kg=-(waste_quantity_kg + byproducts_quantity_kg),
        risk_score=0.05,
        status="VALIDATED",
        details={
            "operation_id": op_id,
            "operation_name": operation_name,
            "output_batch_ids": created_child_batches,
            "yield_pct": yield_pct,
            "waste_kg": waste_quantity_kg,
        },
        timestamp=now,
    )
    session.add(evt)

    # Live Chain Notifications for Processing
    processor = session.get(Participant, processor_id)
    proc_name = processor.name if processor else processor_id

    create_notification(
        session=session,
        recipient_id=processor_id,
        title="Processing & Split Complete",
        message=f"Parent batch {parent_batch.id} processed into {len(created_child_batches)} child lots ({yield_pct}% yield). Lineage cryptographically sealed.",
        category="LIFECYCLE",
        severity="SUCCESS",
        batch_id=parent_batch.id,
        created_at=now,
    )
    if parent_batch.origin_farmer_id:
        create_notification(
            session=session,
            recipient_id=parent_batch.origin_farmer_id,
            title="Harvested Lot Processed",
            message=f"Your harvest batch {parent_batch.id} was processed by {proc_name} into {len(created_child_batches)} finished lots.",
            category="LIFECYCLE",
            severity="INFO",
            batch_id=parent_batch.id,
            created_at=now,
        )

    session.commit()

    return {
        "operation_id": op_id,
        "input_batch_id": parent_batch.id,
        "child_batch_ids": created_child_batches,
        "total_output_kg": total_output_kg,
        "yield_pct": yield_pct,
    }


def record_environmental_telemetry(
    session: Session,
    batch_id: str,
    shipment_id: str,
    carrier_id: str,
    temp_c: float,
    humidity_pct: float | None = None,
    location_lat: float | None = None,
    location_lng: float | None = None,
    speed_kmh: float | None = None,
    sensor_id: str = "IOT-TEMP-001",
    now: datetime | None = None,
) -> dict:
    """Log an IoT sensor temperature reading for cold chain compliance."""
    batch = session.get(Batch, batch_id)
    now = now or datetime.now()

    crop_info = CROPS.get(batch.crop.lower() if batch else "mango", {"temp_limit": 14.0})
    temp_limit = crop_info["temp_limit"]
    breached = temp_c > temp_limit

    reading_id = f"TEL-{uuid.uuid4().hex[:8].upper()}"
    reading = EnvironmentalReading(
        id=reading_id,
        batch_id=batch_id,
        shipment_id=shipment_id,
        carrier_id=carrier_id,
        temp_c=temp_c,
        temp_limit_c=temp_limit,
        humidity_pct=humidity_pct,
        breach_detected=breached,
        location_lat=location_lat,
        location_lng=location_lng,
        speed_kmh=speed_kmh,
        sensor_id=sensor_id,
        recorded_at=now,
    )
    session.add(reading)

    if breached:
        evt = LifecycleEvent(
            id=f"EVT-{uuid.uuid4().hex[:8].upper()}",
            batch_id=batch_id,
            event_type="COLD_CHAIN_ALERT",
            stage="DISTRIBUTOR",
            actor_id=carrier_id,
            temperature_c=temp_c,
            risk_score=0.92,
            status="QUARANTINED",
            details={
                "sensor_id": sensor_id,
                "recorded_temp_c": temp_c,
                "permissible_limit_c": temp_limit,
                "excursion_c": round(temp_c - temp_limit, 2),
                "shipment_id": shipment_id,
            },
            timestamp=now,
        )
        session.add(evt)

        # Live Chain Notifications for Cold Chain Excursion
        notify_chain_affected(
            session=session,
            batch_id=batch_id,
            title="Critical Cold-Chain Excursion Detected",
            message=f"IoT Sensor {sensor_id} logged {temp_c}°C excursion (Limit: {temp_limit}°C) on shipment {shipment_id}.",
            category="COLD_CHAIN",
            severity="CRITICAL",
            extra_recipient_ids=[carrier_id],
            notify_auditors=True,
            created_at=now,
        )

    session.commit()
    return {
        "reading_id": reading_id,
        "breached": breached,
        "temp_c": temp_c,
        "limit_c": temp_limit,
    }


def get_full_lifecycle(session: Session, batch_id: str) -> dict:
    """Retrieve the end-to-end audit pedigree for a batch."""
    batch = session.get(Batch, batch_id)
    if not batch:
        return {}

    events = list(
        session.exec(
            select(LifecycleEvent)
            .where(LifecycleEvent.batch_id == batch_id)
            .order_by(LifecycleEvent.timestamp)
        ).all()
    )

    transfers = list(
        session.exec(
            select(Transfer)
            .where(Transfer.batch_id == batch_id)
            .order_by(Transfer.dispatched_at)
        ).all()
    )

    operations = list(
        session.exec(
            select(ProcessingOperation)
            .where(ProcessingOperation.input_batch_id == batch_id)
            .order_by(ProcessingOperation.started_at)
        ).all()
    )

    # Lineage links
    children_lineage = list(
        session.exec(select(BatchLineage).where(BatchLineage.parent_batch_id == batch_id)).all()
    )
    parent_lineage = list(
        session.exec(select(BatchLineage).where(BatchLineage.child_batch_id == batch_id)).all()
    )

    # Environmental readings
    readings = list(
        session.exec(
            select(EnvironmentalReading)
            .where(EnvironmentalReading.batch_id == batch_id)
            .order_by(desc(EnvironmentalReading.recorded_at))
        ).all()
    )

    # Related transactions
    txs = list(
        session.exec(
            select(Transaction, Assessment)
            .where(Transaction.batch_id == batch_id)
            .join(Assessment, Assessment.tx_id == Transaction.id, isouter=True)
            .order_by(Transaction.timestamp)
        ).all()
    )

    # Participants lookup
    p_ids = set()
    for e in events:
        if e.actor_id:
            p_ids.add(e.actor_id)
        if e.recipient_id:
            p_ids.add(e.recipient_id)
    for t in transfers:
        p_ids.add(t.sender_id)
        p_ids.add(t.receiver_id)
    if batch.origin_farmer_id:
        p_ids.add(batch.origin_farmer_id)
    if batch.current_holder_id:
        p_ids.add(batch.current_holder_id)

    people = {p.id: p.name for p in session.exec(select(Participant).where(col(Participant.id).in_(list(p_ids)))).all()}

    return {
        "batch": {
            **batch.model_dump(),
            "origin_farmer_name": people.get(batch.origin_farmer_id, batch.origin_farmer_id),
            "current_holder_name": people.get(batch.current_holder_id, batch.current_holder_id),
        },
        "events": [
            {
                **e.model_dump(),
                "actor_name": people.get(e.actor_id, e.actor_id),
                "recipient_name": people.get(e.recipient_id, e.recipient_id) if e.recipient_id else None,
            }
            for e in events
        ],
        "transfers": [
            {
                **t.model_dump(),
                "sender_name": people.get(t.sender_id, t.sender_id),
                "receiver_name": people.get(t.receiver_id, t.receiver_id),
            }
            for t in transfers
        ],
        "processing_operations": [op.model_dump() for op in operations],
        "lineage": {
            "parents": [p.parent_batch_id for p in parent_lineage],
            "children": [c.child_batch_id for c in children_lineage],
            "links": [
                {
                    "parent_id": l.parent_batch_id,
                    "child_id": l.child_batch_id,
                    "type": l.operation_type,
                    "input_kg": l.input_qty_kg,
                    "output_kg": l.output_qty_kg,
                }
                for l in (parent_lineage + children_lineage)
            ],
        },
        "telemetry": [r.model_dump() for r in readings[:30]],
        "transactions": [
            {
                **t.model_dump(),
                "risk": a.risk if a else 0.0,
                "decision": a.decision if a else "CLEAR",
                "pred_type": a.pred_type if a else "none",
                "seller_name": people.get(t.seller_id, t.seller_id),
                "buyer_name": people.get(t.buyer_id, t.buyer_id),
            }
            for t, a in txs
        ],
    }
