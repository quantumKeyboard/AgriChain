"""Lifecycle & Batch Management Endpoints."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlmodel import Session, col, desc, select

from app.auth import require_admin, require_participant, resolve_user
from app.db import get_session
from app.models import Batch, BatchLineage, LifecycleEvent, Transfer
from app.services_lifecycle import (
    complete_transfer,
    create_harvest_batch,
    execute_processing_operation,
    get_full_lifecycle,
    initiate_transfer,
    record_environmental_telemetry,
)

router = APIRouter(prefix="/api/lifecycle", tags=["lifecycle"])


class HarvestBatchIn(BaseModel):
    farmer_id: str
    crop: str
    quantity_kg: float
    farm_id: str = "PLOT-A1"
    farm_location: str = "Solapur, Maharashtra"
    variety: str = "Standard"
    quality_grade: str = "A"
    organic_claimed: bool = False
    organic_cert_valid: bool = False
    cert_reference: str = ""
    custom_batch_id: str | None = None


class TransferDispatchIn(BaseModel):
    batch_id: str
    sender_id: str
    receiver_id: str
    stage: str = "FARM_TO_COOP"
    quantity_kg: float
    shipment_id: str = ""
    vehicle_number: str = ""
    transit_hours: float = 3.0
    transit_km: float = 80.0
    unit_price: float = 40.0
    quality_grade: str = "A"
    temp_avg_c: float | None = None
    temp_max_c: float | None = None
    notes: str = ""


class TransferResponseIn(BaseModel):
    receiver_id: str
    received_quantity_kg: float
    action: str = "ACCEPT"  # ACCEPT or DISPUTE
    dispute_reason: str = ""
    quality_grade: str = "A"


class ProcessingIn(BaseModel):
    processor_id: str
    operation_name: str
    input_batch_id: str
    input_quantity_kg: float
    outputs: list[dict]
    waste_quantity_kg: float = 0.0
    byproducts_quantity_kg: float = 0.0
    quality_certificate_ref: str = ""
    notes: str = ""


class TelemetryIn(BaseModel):
    batch_id: str
    shipment_id: str
    carrier_id: str
    temp_c: float
    humidity_pct: float | None = None
    location_lat: float | None = None
    location_lng: float | None = None
    speed_kmh: float | None = None
    sensor_id: str = "IOT-TEMP-001"


@router.post("/harvest")
def harvest(
    body: HarvestBatchIn,
    user: Annotated[dict, Depends(resolve_user)],
    session: Session = Depends(get_session),
) -> dict:
    # RBAC: Only farmers or admins can declare a harvest batch
    if user["role"] not in {"FARMER", "ADMIN"}:
        raise HTTPException(403, "Only registered farmers or administrators can create harvest batches.")
    farmer_id = user["participant_id"] if user["role"] == "FARMER" else body.farmer_id

    try:
        return create_harvest_batch(
            session=session,
            farmer_id=farmer_id,
            crop=body.crop,
            quantity_kg=body.quantity_kg,
            farm_id=body.farm_id,
            farm_location=body.farm_location,
            variety=body.variety,
            quality_grade=body.quality_grade,
            organic_claimed=body.organic_claimed,
            organic_cert_valid=body.organic_cert_valid,
            cert_reference=body.cert_reference,
            custom_batch_id=body.custom_batch_id,
        )
    except Exception as e:
        raise HTTPException(400, str(e))


@router.post("/transfer")
def transfer_dispatch(
    body: TransferDispatchIn,
    user: Annotated[dict, Depends(resolve_user)],
    session: Session = Depends(get_session),
) -> dict:
    sender_id = user["participant_id"] if not user["is_admin"] else body.sender_id
    try:
        return initiate_transfer(
            session=session,
            batch_id=body.batch_id,
            sender_id=sender_id,
            receiver_id=body.receiver_id,
            stage=body.stage,
            quantity_kg=body.quantity_kg,
            shipment_id=body.shipment_id,
            vehicle_number=body.vehicle_number,
            transit_hours=body.transit_hours,
            transit_km=body.transit_km,
            unit_price=body.unit_price,
            quality_grade=body.quality_grade,
            temp_avg_c=body.temp_avg_c,
            temp_max_c=body.temp_max_c,
            notes=body.notes,
        )
    except Exception as e:
        raise HTTPException(400, str(e))


@router.post("/transfer/{transfer_id}/respond")
def transfer_respond(
    transfer_id: str,
    body: TransferResponseIn,
    user: Annotated[dict, Depends(resolve_user)],
    session: Session = Depends(get_session),
) -> dict:
    receiver_id = user["participant_id"] if not user["is_admin"] else body.receiver_id
    try:
        return complete_transfer(
            session=session,
            transfer_id=transfer_id,
            receiver_id=receiver_id,
            received_quantity_kg=body.received_quantity_kg,
            action=body.action,
            dispute_reason=body.dispute_reason,
            quality_grade=body.quality_grade,
        )
    except Exception as e:
        raise HTTPException(400, str(e))


@router.post("/process")
def process(
    body: ProcessingIn,
    user: Annotated[dict, Depends(resolve_user)],
    session: Session = Depends(get_session),
) -> dict:
    if user["role"] not in {"PROCESSOR", "ADMIN"}:
        raise HTTPException(403, "Only registered processors can record processing operations.")
    proc_id = user["participant_id"] if user["role"] == "PROCESSOR" else body.processor_id
    try:
        return execute_processing_operation(
            session=session,
            processor_id=proc_id,
            operation_name=body.operation_name,
            input_batch_id=body.input_batch_id,
            input_quantity_kg=body.input_quantity_kg,
            outputs=body.outputs,
            waste_quantity_kg=body.waste_quantity_kg,
            byproducts_quantity_kg=body.byproducts_quantity_kg,
            quality_certificate_ref=body.quality_certificate_ref,
            notes=body.notes,
        )
    except Exception as e:
        raise HTTPException(400, str(e))


@router.post("/telemetry")
def telemetry(body: TelemetryIn, session: Session = Depends(get_session)) -> dict:
    try:
        return record_environmental_telemetry(
            session=session,
            batch_id=body.batch_id,
            shipment_id=body.shipment_id,
            carrier_id=body.carrier_id,
            temp_c=body.temp_c,
            humidity_pct=body.humidity_pct,
            location_lat=body.location_lat,
            location_lng=body.location_lng,
            speed_kmh=body.speed_kmh,
            sensor_id=body.sensor_id,
        )
    except Exception as e:
        raise HTTPException(400, str(e))


@router.get("/batches")
def search_batches(
    stage: str | None = None,
    crop: str | None = None,
    status: str | None = None,
    search: str | None = None,
    limit: int = 50,
    session: Session = Depends(get_session),
) -> list[dict]:
    q = select(Batch)
    if stage:
        q = q.where(Batch.current_stage == stage.upper())
    if crop:
        q = q.where(Batch.crop == crop.lower())
    if status:
        q = q.where(Batch.status == status.upper())
    if search:
        s = f"%{search.lower()}%"
        q = q.where(col(Batch.id).ilike(s) | col(Batch.crop).ilike(s) | col(Batch.region).ilike(s))

    batches = list(session.exec(q.order_by(desc(Batch.harvest_date)).limit(limit)).all())
    return [b.model_dump() for b in batches]


@router.get("/{batch_id}")
def lifecycle_details(batch_id: str, session: Session = Depends(get_session)) -> dict:
    res = get_full_lifecycle(session, batch_id)
    if not res:
        raise HTTPException(404, f"Batch {batch_id} not found.")
    return res


@router.get("/{batch_id}/lineage")
def batch_lineage(batch_id: str, session: Session = Depends(get_session)) -> dict:
    links = list(
        session.exec(
            select(BatchLineage).where(
                (BatchLineage.parent_batch_id == batch_id) | (BatchLineage.child_batch_id == batch_id)
            )
        ).all()
    )
    return {
        "batch_id": batch_id,
        "nodes": list({l.parent_batch_id for l in links} | {l.child_batch_id for l in links} | {batch_id}),
        "edges": [l.model_dump() for l in links],
    }
