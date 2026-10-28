"""Request bodies (responses are plain dicts built in app/views.py)."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.sim.generator import CROP_NAMES, INJECTABLE_TYPES, STAGES

FraudType = Literal[tuple(INJECTABLE_TYPES)]  # type: ignore[valid-type]


class BatchIn(BaseModel):
    id: str
    crop: str
    origin_farmer_id: str
    harvest_date: datetime
    organic_claimed: bool
    organic_cert_valid: bool
    region: str


class TransactionIn(BaseModel):
    id: str | None = None
    batch_id: str = Field(min_length=3, max_length=40)
    crop: Literal[tuple(CROP_NAMES)]  # type: ignore[valid-type]
    stage: Literal[tuple(STAGES)]  # type: ignore[valid-type]
    seller_id: str
    buyer_id: str
    timestamp: datetime | None = None
    quantity_kg: float = Field(gt=0, le=5_000_000)
    unit_price: float = Field(gt=0, le=100_000)
    ref_price: float | None = Field(default=None, gt=0)
    quality_grade: Literal["A", "B", "C"] = "A"
    moisture_pct: float = Field(ge=0, le=100, default=12.0)
    organic_claimed: bool = False
    organic_cert_valid: bool = False
    transit_km: float = Field(ge=0, le=5000, default=100)
    transit_hours: float = Field(gt=0, le=500, default=4)
    temp_avg_c: float = Field(ge=-30, le=70, default=20)
    temp_max_c: float = Field(ge=-30, le=80, default=24)
    cold_chain_ok_claimed: bool = False
    payment_mode: Literal["BANK", "UPI", "CASH"] = "BANK"
    batch: BatchIn | None = None
    # Demo: sign with a different participant's key to simulate identity spoofing.
    forge_signature: bool = False


class DecisionIn(BaseModel):
    action: Literal["approve", "reject"]
    note: str = Field(default="", max_length=500)


class SimStepIn(BaseModel):
    n: int = Field(default=1, ge=1, le=20)
    inject: FraudType | None = None


class AttackIn(BaseModel):
    kind: Literal[
        "db_quantity",
        "db_verdict",
        "chain_overwrite",
        "chain_unauthorized",
        "chain_reverdict",
        "chain_forged",
    ]
