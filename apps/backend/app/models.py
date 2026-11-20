"""Database tables."""

from pydantic import NaiveDatetime
from sqlalchemy import JSON, Column
from sqlmodel import Field, SQLModel


class Participant(SQLModel, table=True):
    id: str = Field(primary_key=True)
    name: str
    role: str = Field(index=True)  # FARMER, COOP, PROCESSOR, DISTRIBUTOR, RETAILER, AUDITOR, ADMIN
    region: str
    registered_on: NaiveDatetime
    land_acres: float | None = None
    capacity_tons: float | None = None
    public_key: str = ""  # Ed25519, hex


class UserAccount(SQLModel, table=True):
    id: str = Field(primary_key=True)
    username: str = Field(index=True)
    name: str
    email: str
    role: str = Field(index=True)  # ADMIN, AUDITOR, FARMER, COOP, PROCESSOR, DISTRIBUTOR, RETAILER
    participant_id: str | None = Field(default=None, index=True)
    created_at: NaiveDatetime


class Batch(SQLModel, table=True):
    id: str = Field(primary_key=True)
    crop: str
    origin_farmer_id: str
    harvest_date: NaiveDatetime
    organic_claimed: bool
    organic_cert_valid: bool
    region: str

    # Extended lifecycle fields
    variety: str = "Standard"
    farm_id: str = "FARM-DEFAULT"
    farm_location: str = ""
    initial_quantity_kg: float = 0.0
    current_quantity_kg: float = 0.0
    unit: str = "kg"
    quality_grade: str = "A"
    cert_reference: str = ""
    current_stage: str = "FARMER"  # FARMER, COOP, PROCESSOR, DISTRIBUTOR, RETAILER, COMPLETED
    current_holder_id: str = ""
    parent_batch_ids: list = Field(default_factory=list, sa_column=Column(JSON))
    status: str = "ACTIVE"  # ACTIVE, IN_TRANSIT, PROCESSED, COMPLETED, QUARANTINED, DISPUTED
    created_at: NaiveDatetime | None = None
    updated_at: NaiveDatetime | None = None


class BatchLineage(SQLModel, table=True):
    id: str = Field(primary_key=True)
    parent_batch_id: str = Field(index=True)
    child_batch_id: str = Field(index=True)
    operation_type: str = "SPLIT"  # SPLIT, MERGE, TRANSFORM
    input_qty_kg: float = 0.0
    output_qty_kg: float = 0.0
    ratio: float = 1.0
    notes: str = ""
    created_at: NaiveDatetime


class LifecycleEvent(SQLModel, table=True):
    id: str = Field(primary_key=True)
    batch_id: str = Field(index=True)
    event_type: str = Field(index=True)
    # Event types: HARVEST, TRANSFER_DISPATCH, TRANSFER_ACCEPT, TRANSFER_DISPUTE,
    #              PROCESS_TRANSFORM, COLD_CHAIN_TELEMETRY, AUDITOR_VERDICT, RETAIL_CONFIRM
    stage: str
    actor_id: str = Field(index=True)
    recipient_id: str | None = None
    tx_id: str | None = Field(default=None, index=True)
    quantity_before_kg: float | None = None
    quantity_after_kg: float | None = None
    quantity_diff_kg: float | None = None
    quality_grade: str | None = None
    temperature_c: float | None = None
    risk_score: float | None = None
    status: str = "VALIDATED"  # VALIDATED, FLAGGED, QUARANTINED, APPROVED, REJECTED, DISPUTED
    signature: str = ""
    signature_valid: bool = True
    details: dict = Field(default_factory=dict, sa_column=Column(JSON))
    block_index: int | None = None
    timestamp: NaiveDatetime = Field(index=True)


class Transfer(SQLModel, table=True):
    id: str = Field(primary_key=True)
    batch_id: str = Field(index=True)
    sender_id: str = Field(index=True)
    receiver_id: str = Field(index=True)
    stage: str = "FARM_TO_COOP"  # FARM_TO_COOP, COOP_TO_PROCESSOR, PROCESSOR_TO_DISTRIBUTOR, DISTRIBUTOR_TO_RETAILER
    dispatched_quantity_kg: float
    received_quantity_kg: float | None = None
    discrepancy_kg: float = 0.0
    tolerance_kg: float = 50.0
    discrepancy_flagged: bool = False
    status: str = Field(default="INITIATED", index=True)  # INITIATED, IN_TRANSIT, ACCEPTED, DISPUTED
    sender_signature: str = ""
    receiver_signature: str = ""
    sender_tx_id: str | None = None
    receiver_tx_id: str | None = None
    shipment_id: str = ""
    vehicle_number: str = ""
    transit_hours: float = 0.0
    transit_km: float = 0.0
    temp_avg_c: float | None = None
    temp_max_c: float | None = None
    cold_chain_breached: bool = False
    dispute_reason: str = ""
    notes: str = ""
    dispatched_at: NaiveDatetime = Field(index=True)
    accepted_at: NaiveDatetime | None = None


class ProcessingOperation(SQLModel, table=True):
    id: str = Field(primary_key=True)
    processor_id: str = Field(index=True)
    operation_name: str  # e.g. Mango Pulp Extraction, Grain Milling
    input_batch_id: str = Field(index=True)
    input_quantity_kg: float
    output_batch_ids: list = Field(default_factory=list, sa_column=Column(JSON))
    output_quantity_kg: float
    waste_quantity_kg: float = 0.0
    byproducts_quantity_kg: float = 0.0
    yield_percentage: float = 0.0
    quality_certificate_ref: str = ""
    notes: str = ""
    started_at: NaiveDatetime
    completed_at: NaiveDatetime


class EnvironmentalReading(SQLModel, table=True):
    id: str = Field(primary_key=True)
    batch_id: str = Field(index=True)
    shipment_id: str = Field(index=True)
    carrier_id: str = Field(index=True)
    temp_c: float
    temp_limit_c: float
    humidity_pct: float | None = None
    breach_detected: bool = False
    location_lat: float | None = None
    location_lng: float | None = None
    speed_kmh: float | None = None
    sensor_id: str = "IOT-TEMP-001"
    recorded_at: NaiveDatetime = Field(index=True)


class Transaction(SQLModel, table=True):
    id: str = Field(primary_key=True)
    batch_id: str = Field(index=True)
    crop: str
    stage: str
    seller_id: str = Field(index=True)
    buyer_id: str = Field(index=True)
    timestamp: NaiveDatetime = Field(index=True)
    quantity_kg: float
    unit_price: float
    total_value: float
    ref_price: float
    quality_grade: str
    moisture_pct: float
    organic_claimed: bool
    organic_cert_valid: bool
    transit_km: float
    transit_hours: float
    temp_avg_c: float
    temp_max_c: float
    cold_chain_ok_claimed: bool
    payment_mode: str
    signature: str = ""  # seller's Ed25519 signature over the canonical payload, hex
    # Ground truth from the simulator (None for hand-entered tx). Never used for scoring.
    sim_label: str | None = None


class Assessment(SQLModel, table=True):
    tx_id: str = Field(primary_key=True, foreign_key="transaction.id")
    risk: float = Field(index=True)
    p_fraud: float
    rule_score: float
    anomaly_score: float
    pred_type: str
    decision: str = Field(index=True)  # CLEAR / FLAGGED / QUARANTINED
    rule_hits: list = Field(default_factory=list, sa_column=Column(JSON))
    type_probs: dict = Field(default_factory=dict, sa_column=Column(JSON))
    shap_top: list | None = Field(default=None, sa_column=Column(JSON))
    features: dict = Field(default_factory=dict, sa_column=Column(JSON))
    model_version: str
    created_at: NaiveDatetime


class Review(SQLModel, table=True):
    tx_id: str = Field(primary_key=True, foreign_key="transaction.id")
    action: str  # APPROVED / REJECTED
    note: str = ""
    reviewed_at: NaiveDatetime


class AppMeta(SQLModel, table=True):
    """Key/value store; holds the schema version so old local databases are re-seeded, not crashed on."""

    key: str = Field(primary_key=True)
    value: str


class Block(SQLModel, table=True):
    index: int = Field(primary_key=True)
    timestamp: NaiveDatetime
    prev_hash: str
    merkle_root: str
    nonce: int
    difficulty: int
    hash: str
    tx_count: int = 0


class LedgerEntry(SQLModel, table=True):
    """A transaction's record on the chain. block_index is None while it waits in the pending pool."""

    tx_id: str = Field(primary_key=True, foreign_key="transaction.id")
    status: str  # COMMITTED / FLAGGED / APPROVED / REJECTED
    block_index: int | None = Field(default=None, index=True)
    position: int = 0
    tx_hash: str = ""
    queued_at: NaiveDatetime


class ChainNotification(SQLModel, table=True):
    """Live chain notifications targeted to affected participants and auditors."""

    id: str = Field(primary_key=True)
    recipient_id: str = Field(index=True)  # Specific participant id (e.g. F-001, C-001), or "ALL_ADMINS", or "BROADCAST"
    role: str | None = Field(default=None, index=True)  # Optional target role (e.g. "AUDITOR", "FARMER")
    batch_id: str | None = Field(default=None, index=True)
    tx_id: str | None = Field(default=None, index=True)
    title: str
    message: str
    category: str = "LIFECYCLE"  # LIFECYCLE, TRANSFER, DISPUTE, COLD_CHAIN, QUARANTINE, AUDIT, LEDGER
    severity: str = "INFO"  # INFO, SUCCESS, WARNING, CRITICAL
    read: bool = Field(default=False, index=True)
    created_at: NaiveDatetime = Field(index=True)

