"""Feature engineering — the single place features are computed.

Both the training pipeline (from simulated records) and the API (from DB rows)
call `history_from_records` + `compute_features`, so there is no train/serve skew.
"""

from __future__ import annotations

import math
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import datetime, timedelta

from app.sim.generator import CROP_NAMES, CROPS, STAGES

FEATURE_NAMES = [
    "crop_idx",
    "perishable",
    "stage_idx",
    "log_quantity",
    "price_deviation",
    "abs_price_deviation",
    "qty_vs_capacity",
    "organic_claimed",
    "organic_mismatch",
    "temp_over_limit",
    "cold_chain_concealed",
    "transit_speed_kmph",
    "moisture_pct",
    "grade_idx",
    "seller_tx_24h",
    "pair_count_7d",
    "buyer_in_trail",
    "duplicate_seen",
    "seller_age_days",
    "payment_cash",
    "round_total",
]

FEATURE_LABELS = {
    "crop_idx": "Crop type",
    "perishable": "Perishable crop",
    "stage_idx": "Supply-chain stage",
    "log_quantity": "Quantity (log kg)",
    "price_deviation": "Price vs. market reference",
    "abs_price_deviation": "Size of price deviation",
    "qty_vs_capacity": "Quantity vs. what seller could have",
    "organic_claimed": "Organic label claimed",
    "organic_mismatch": "Organic claim without certificate",
    "temp_over_limit": "Max temperature over crop limit (°C)",
    "cold_chain_concealed": "Breach hidden behind 'cold chain OK'",
    "transit_speed_kmph": "Implied transit speed (km/h)",
    "moisture_pct": "Moisture %",
    "grade_idx": "Quality grade",
    "seller_tx_24h": "Seller transactions in last 24h",
    "pair_count_7d": "Same seller→buyer trades in 7 days",
    "buyer_in_trail": "Buyer already handled this batch",
    "duplicate_seen": "Identical invoice seen before",
    "seller_age_days": "Seller account age (days)",
    "payment_cash": "Cash payment",
    "round_total": "Suspiciously round total",
}


@dataclass(frozen=True)
class History:
    seller_tx_24h: int
    pair_count_7d: int
    buyer_in_trail: bool
    duplicate_seen: bool
    available_qty: float  # what the seller could legitimately have of this batch


def history_from_records(tx: dict, seller: dict, records: Iterable[dict]) -> History:
    """Summarise prior records relevant to `tx`.

    `records` must include (at least) every earlier transaction of the same batch and every
    transaction by the same seller in the 7 days before `tx`. Extra records are harmless.
    """
    ts: datetime = tx["timestamp"]
    day_ago, week_ago = ts - timedelta(hours=24), ts - timedelta(days=7)
    seller_24h = pair_7d = 0
    in_trail = dup = False
    received = 0.0
    for r in records:
        if r.get("id") == tx.get("id") or r["timestamp"] > ts:
            continue
        if r["seller_id"] == tx["seller_id"]:
            if r["timestamp"] >= day_ago:
                seller_24h += 1
            if r["buyer_id"] == tx["buyer_id"] and r["timestamp"] >= week_ago:
                pair_7d += 1
        if r["batch_id"] == tx["batch_id"]:
            if tx["buyer_id"] in (r["seller_id"], r["buyer_id"]):
                in_trail = True
            if r["buyer_id"] == tx["seller_id"]:
                received += float(r["quantity_kg"])
            if (
                r["seller_id"] == tx["seller_id"]
                and r["buyer_id"] == tx["buyer_id"]
                and abs(float(r["quantity_kg"]) - float(tx["quantity_kg"])) < 1e-6
                and abs(float(r["total_value"]) - float(tx["total_value"])) < 1e-2
            ):
                dup = True
    if tx["stage"] == STAGES[0]:
        available = (seller.get("land_acres") or 1.0) * CROPS[tx["crop"]]["yield_per_acre"]
    else:
        available = received
    return History(seller_24h, pair_7d, in_trail, dup, available)


def compute_features(tx: dict, seller: dict, history: History) -> dict[str, float]:
    crop = CROPS[tx["crop"]]
    ref = float(tx["ref_price"]) or 1.0
    dev = (float(tx["unit_price"]) - ref) / ref
    qty = float(tx["quantity_kg"])
    over = 0.0
    if crop["perishable"] and crop["temp_limit"] is not None:
        over = max(0.0, float(tx["temp_max_c"]) - crop["temp_limit"])
    age = (tx["timestamp"] - seller["registered_on"]).days if seller.get("registered_on") else 365
    total = float(tx["total_value"])
    return {
        "crop_idx": float(CROP_NAMES.index(tx["crop"])),
        "perishable": float(crop["perishable"]),
        "stage_idx": float(STAGES.index(tx["stage"])),
        "log_quantity": math.log1p(qty),
        "price_deviation": dev,
        "abs_price_deviation": abs(dev),
        "qty_vs_capacity": min(qty / max(history.available_qty, 1.0), 50.0),
        "organic_claimed": float(bool(tx["organic_claimed"])),
        "organic_mismatch": float(bool(tx["organic_claimed"]) and not bool(tx["organic_cert_valid"])),
        "temp_over_limit": over,
        "cold_chain_concealed": float(over > 0 and bool(tx["cold_chain_ok_claimed"])),
        "transit_speed_kmph": float(tx["transit_km"]) / max(float(tx["transit_hours"]), 0.1),
        "moisture_pct": float(tx["moisture_pct"]),
        "grade_idx": float("ABC".index(tx["quality_grade"])),
        "seller_tx_24h": float(history.seller_tx_24h),
        "pair_count_7d": float(history.pair_count_7d),
        "buyer_in_trail": float(history.buyer_in_trail),
        "duplicate_seen": float(history.duplicate_seen),
        "seller_age_days": float(max(age, 0)),
        "payment_cash": float(tx["payment_mode"] == "CASH"),
        "round_total": float(total >= 10000 and total % 1000 == 0),
    }
