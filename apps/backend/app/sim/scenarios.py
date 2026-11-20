"""Hand-written demo transactions: each one tells a single, readable story.

Used by `scripts/live_demo.py` (narrated walkthrough against the running API) and by
`tests/test_demo_scenarios.py`. Every scenario is a plain JSON body for
`POST /api/transactions`, built from the deterministic participant registry (seed 42), so
the same people and numbers appear on every machine.

Order matters: the honest journey comes first, because the duplicate invoice and the
circular trade reuse its batch and need its earlier hops to be on record.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta

from app.sim.generator import CROPS, make_participants, reference_price


@dataclass(frozen=True)
class Scenario:
    key: str
    title: str
    story: str  # one sentence the presenter can read out
    body: dict
    expect_fraud: bool
    expect_rule: str | None = None  # the named rule that should fire
    tags: tuple[str, ...] = field(default_factory=tuple)


def _cast(now: datetime) -> dict:
    """Pick a stable, long-registered cast from one region (no freshly-registered shell firms)."""
    people = make_participants(42, now=now)

    def ok(p) -> bool:
        return (now - p.registered_on).days >= 100

    for region in sorted({p.region for p in people}):
        local = [p for p in people if p.region == region and ok(p)]
        by = {r: [p for p in local if p.role == r] for r in ("FARMER", "COOP", "PROCESSOR")}
        farmers = sorted((p for p in by["FARMER"] if 4 <= (p.land_acres or 0) <= 10), key=lambda p: p.id)
        if len(farmers) >= 5 and by["COOP"] and by["PROCESSOR"]:
            return {
                "region": region,
                "farmers": farmers,
                "coop": by["COOP"][0],
                "processor": by["PROCESSOR"][0],
            }
    raise RuntimeError("No region has a complete cast of participants.")


def _tx(batch_id: str, crop: str, stage: str, seller, buyer, qty: float, price: float, **extra) -> dict:
    perishable = CROPS[crop]["perishable"]
    limit = CROPS[crop]["temp_limit"]
    body = {
        "batch_id": batch_id,
        "crop": crop,
        "stage": stage,
        "seller_id": seller.id,
        "buyer_id": buyer.id,
        "quantity_kg": float(round(qty)),
        "unit_price": round(price, 2),
        "quality_grade": "A",
        "moisture_pct": 85.0 if perishable else 12.0,
        "organic_claimed": False,
        "organic_cert_valid": False,
        "transit_km": 80.0,
        "transit_hours": 3.0,
        # Perishables travel refrigerated, comfortably under their limit.
        "temp_avg_c": (limit - 4.0) if perishable else 26.0,
        "temp_max_c": (limit - 2.0) if perishable else 29.0,
        "cold_chain_ok_claimed": perishable,
        "payment_mode": "BANK",
    }
    body.update(extra)
    return body


def _batch(
    batch_id: str, crop: str, farmer, now: datetime, organic: bool = False, cert: bool = False
) -> dict:
    return {
        "id": batch_id,
        "crop": crop,
        "origin_farmer_id": farmer.id,
        "harvest_date": (now - timedelta(days=3)).isoformat(timespec="seconds"),
        "organic_claimed": organic,
        "organic_cert_valid": cert,
        "region": farmer.region,
    }


def build_scenarios(tag: str, now: datetime | None = None) -> list[Scenario]:
    """Return the demo scenarios in submission order. `tag` keeps batch ids unique per run."""
    now = now or datetime.now()
    c = _cast(now)
    f1, f2, f3, f4, f5 = c["farmers"][:5]
    coop, proc = c["coop"], c["processor"]

    def ref(crop: str, stage: str) -> float:
        return reference_price(crop, stage, now)

    def capacity(farmer, crop: str) -> float:
        return (farmer.land_acres or 1) * CROPS[crop]["yield_per_acre"]

    out: list[Scenario] = []

    # 1-2. An honest tomato batch: farmer -> cooperative -> processor.
    b_main = f"B-DEMO-{tag}-TOM"
    q1 = capacity(f1, "tomato") * 0.5
    hop1 = _tx(b_main, "tomato", "FARM_TO_COOP", f1, coop, q1, ref("tomato", "FARM_TO_COOP") * 1.02)
    hop1["batch"] = _batch(b_main, "tomato", f1, now)
    out.append(
        Scenario(
            "honest_farm",
            "Honest sale: farmer → cooperative",
            f"{f1.name} ({f1.land_acres} acres) sells {q1:,.0f} kg of tomatoes to {coop.name} at the "
            "market price, refrigerated all the way.",
            hop1,
            expect_fraud=False,
            tags=("honest",),
        )
    )
    q2 = q1 * 0.97
    hop2 = _tx(b_main, "tomato", "COOP_TO_PROCESSOR", coop, proc, q2, ref("tomato", "COOP_TO_PROCESSOR"))
    out.append(
        Scenario(
            "honest_coop",
            "Honest sale: cooperative → processor",
            f"{coop.name} passes the same batch ({q2:,.0f} kg after 3% handling loss) to {proc.name}.",
            hop2,
            expect_fraud=False,
            tags=("honest",),
        )
    )

    # 3. Duplicate invoice: the cooperative bills the processor twice for the same goods.
    out.append(
        Scenario(
            "duplicate_invoice",
            "Duplicate invoice",
            f"{coop.name} resubmits the exact same invoice to get paid twice.",
            dict(hop2),
            expect_fraud=True,
            expect_rule="DUPLICATE",
        )
    )

    # 4. Circular trading: the processor 'sells' the batch back to the cooperative.
    out.append(
        Scenario(
            "circular_trading",
            "Circular trading",
            f"{proc.name} sells the batch back to {coop.name}, who already held it — "
            "a ring that inflates trading volume.",
            _tx(
                b_main,
                "tomato",
                "PROCESSOR_TO_DISTRIBUTOR",
                proc,
                coop,
                q2 * 0.98,
                ref("tomato", "PROCESSOR_TO_DISTRIBUTOR") * 1.15,
            ),
            expect_fraud=True,
            expect_rule="CIRCULAR",
        )
    )

    # 5. Phantom quantity: a farmer sells far more wheat than the land can grow.
    b = f"B-DEMO-{tag}-WHT"
    cap = capacity(f2, "wheat")
    body = _tx(b, "wheat", "FARM_TO_COOP", f2, coop, cap * 3.5, ref("wheat", "FARM_TO_COOP"))
    body["batch"] = _batch(b, "wheat", f2, now)
    out.append(
        Scenario(
            "phantom_quantity",
            "Phantom quantity",
            f"{f2.name} has {f2.land_acres} acres (max ≈ {cap:,.0f} kg of wheat) but invoices "
            f"{cap * 3.5:,.0f} kg.",
            body,
            expect_fraud=True,
            expect_rule="YIELD_IMPOSSIBLE",
        )
    )

    # 6. Price manipulation: rice billed at about twice the mandi price, round total, cash.
    b = f"B-DEMO-{tag}-RIC"
    r = ref("rice", "FARM_TO_COOP")
    body = _tx(
        b, "rice", "FARM_TO_COOP", f3, coop, 2000, round(r * 2.1), payment_mode="CASH"
    )  # round price × round qty -> round total
    body["batch"] = _batch(b, "rice", f3, now)
    out.append(
        Scenario(
            "price_manipulation",
            "Price manipulation",
            f"{f3.name} bills rice at ₹{round(r * 2.1)}/kg against a market reference of ₹{r:.2f}/kg, "
            "paid in cash.",
            body,
            expect_fraud=True,
            expect_rule="PRICE_BAND",
        )
    )

    # 7. Organic label fraud: soybean sold as organic, no certificate, premium price.
    b = f"B-DEMO-{tag}-SOY"
    body = _tx(
        b,
        "soybean",
        "FARM_TO_COOP",
        f4,
        coop,
        capacity(f4, "soybean") * 0.5,
        ref("soybean", "FARM_TO_COOP") * 1.25,
        organic_claimed=True,
        organic_cert_valid=False,
    )
    body["batch"] = _batch(b, "soybean", f4, now, organic=True, cert=False)
    out.append(
        Scenario(
            "organic_label_fraud",
            "Organic label fraud",
            f"{f4.name} sells soybean as 'organic' at a 25% premium with no valid organic certificate.",
            body,
            expect_fraud=True,
            expect_rule="ORGANIC_UNCERTIFIED",
        )
    )

    # 8. Concealed cold-chain breach: mangoes hit 24 °C (limit 14 °C) but declared 'cold chain OK'.
    b = f"B-DEMO-{tag}-MNG"
    body = _tx(
        b,
        "mango",
        "FARM_TO_COOP",
        f5,
        coop,
        capacity(f5, "mango") * 0.5,
        ref("mango", "FARM_TO_COOP"),
        temp_avg_c=20.0,
        temp_max_c=24.0,
        cold_chain_ok_claimed=True,
    )
    body["batch"] = _batch(b, "mango", f5, now)
    out.append(
        Scenario(
            "cold_chain_concealed",
            "Concealed cold-chain breach",
            f"The truck's sensor logged 24 °C for {f5.name}'s mangoes (limit 14 °C), yet the "
            "invoice says 'cold chain OK'.",
            body,
            expect_fraud=True,
            expect_rule="COLD_CHAIN",
        )
    )

    # 9. Forged signature: a perfectly normal invoice, but signed by someone else.
    b = f"B-DEMO-{tag}-FRG"
    body = _tx(
        b,
        "wheat",
        "FARM_TO_COOP",
        f2,
        coop,
        capacity(f2, "wheat") * 0.4,
        ref("wheat", "FARM_TO_COOP"),
        forge_signature=True,
    )
    body["batch"] = _batch(b, "wheat", f2, now)
    out.append(
        Scenario(
            "forged_signature",
            "Forged signature (identity spoofing)",
            f"An ordinary-looking invoice in {f2.name}'s name — but signed with another participant's "
            "private key.",
            body,
            expect_fraud=True,
            expect_rule="SIGNATURE_INVALID",
        )
    )
    return out
