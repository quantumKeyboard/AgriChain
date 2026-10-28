"""Deterministic, named fraud rules. Each hit carries a human-readable reason shown in the UI."""

from __future__ import annotations

from app.sim.generator import CROPS


def _pct(x: float) -> str:
    return f"{x * 100:+.0f}%"


def evaluate_rules(tx: dict, feats: dict[str, float]) -> list[dict]:
    hits: list[dict] = []

    dev = feats["price_deviation"]
    if abs(dev) > 0.30:
        sev = min(1.0, 0.45 + (abs(dev) - 0.30) * 1.2)
        hits.append(
            {
                "id": "PRICE_BAND",
                "severity": round(sev, 2),
                "reason": f"Unit price ₹{tx['unit_price']:.2f}/kg is {_pct(dev)} vs. the market reference "
                f"₹{tx['ref_price']:.2f}/kg (allowed band ±30%).",
            }
        )

    ratio = feats["qty_vs_capacity"]
    if ratio > 1.25:
        sev = min(1.0, 0.75 + (ratio - 1.25) * 0.25)
        what = (
            "this farm's maximum plausible harvest"
            if tx["stage"] == "FARM_TO_COOP"
            else "the quantity the seller actually received for this batch"
        )
        hits.append(
            {
                "id": "YIELD_IMPOSSIBLE",
                "severity": round(sev, 2),
                "reason": f"Quantity {tx['quantity_kg']:,.0f} kg is {ratio:.1f}× {what}.",
            }
        )

    if feats["cold_chain_concealed"]:
        limit = CROPS[tx["crop"]]["temp_limit"]
        hits.append(
            {
                "id": "COLD_CHAIN",
                "severity": round(min(1.0, 0.6 + feats["temp_over_limit"] * 0.04), 2),
                "reason": f"Sensor max {tx['temp_max_c']:.1f}°C exceeds the {limit:.0f}°C limit "
                f"for {tx['crop']}, yet the shipment is declared 'cold chain OK'.",
            }
        )

    if feats["organic_mismatch"]:
        hits.append(
            {
                "id": "ORGANIC_UNCERTIFIED",
                "severity": 0.8,
                "reason": "Batch is sold as organic but has no valid organic certificate.",
            }
        )

    if feats["buyer_in_trail"]:
        hits.append(
            {
                "id": "CIRCULAR",
                "severity": 0.85,
                "reason": "Buyer already handled this batch earlier — goods are moving in a circle.",
            }
        )

    if feats["duplicate_seen"]:
        hits.append(
            {
                "id": "DUPLICATE",
                "severity": 0.9,
                "reason": "An identical invoice (same parties, batch, quantity and value) "
                "was already submitted.",
            }
        )

    if feats["transit_speed_kmph"] > 90:
        hits.append(
            {
                "id": "IMPOSSIBLE_TRANSIT",
                "severity": 0.5,
                "reason": f"{tx['transit_km']:.0f} km in {tx['transit_hours']:.1f} h implies "
                f"{feats['transit_speed_kmph']:.0f} km/h — not plausible for a truck.",
            }
        )

    # Set by the pipeline after checking the seller's Ed25519 signature (absent in training data).
    if tx.get("signature_valid") is False:
        hits.append(
            {
                "id": "SIGNATURE_INVALID",
                "severity": 1.0,
                "reason": f"The signature does not match seller {tx['seller_id']}'s registered public key — "
                "someone else signed this invoice in the seller's name.",
            }
        )

    return hits


def rule_score(hits: list[dict]) -> float:
    return max((h["severity"] for h in hits), default=0.0)
