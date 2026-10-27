"""Database tables."""

from pydantic import NaiveDatetime
from sqlalchemy import JSON, Column
from sqlmodel import Field, SQLModel


class Participant(SQLModel, table=True):
    id: str = Field(primary_key=True)
    name: str
    role: str = Field(index=True)
    region: str
    registered_on: NaiveDatetime
    land_acres: float | None = None
    capacity_tons: float | None = None


class Batch(SQLModel, table=True):
    id: str = Field(primary_key=True)
    crop: str
    origin_farmer_id: str
    harvest_date: NaiveDatetime
    organic_claimed: bool
    organic_cert_valid: bool
    region: str


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
