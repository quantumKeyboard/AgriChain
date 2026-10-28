"""Synthetic agricultural supply-chain simulator.

Produces participants, produce batches and transactions flowing
farmer -> cooperative -> processor -> distributor -> retailer, and can inject
six kinds of fraud. Used both to build the training dataset and to drive the
live simulator in the API, so the two never drift apart.
"""

from __future__ import annotations

import math
import random
from dataclasses import dataclass, field
from datetime import datetime, timedelta

CROPS: dict[str, dict] = {
    "wheat": {"base_price": 25.0, "yield_per_acre": 1800, "perishable": False, "temp_limit": None},
    "rice": {"base_price": 32.0, "yield_per_acre": 2200, "perishable": False, "temp_limit": None},
    "soybean": {"base_price": 46.0, "yield_per_acre": 1000, "perishable": False, "temp_limit": None},
    "onion": {"base_price": 22.0, "yield_per_acre": 9000, "perishable": True, "temp_limit": 30.0},
    "tomato": {"base_price": 18.0, "yield_per_acre": 11000, "perishable": True, "temp_limit": 12.0},
    "mango": {"base_price": 70.0, "yield_per_acre": 3500, "perishable": True, "temp_limit": 14.0},
}
CROP_NAMES = list(CROPS)

REGIONS = ["Maharashtra", "Punjab", "Uttar Pradesh", "Karnataka", "Madhya Pradesh", "Gujarat"]

STAGES = ["FARM_TO_COOP", "COOP_TO_PROCESSOR", "PROCESSOR_TO_DISTRIBUTOR", "DISTRIBUTOR_TO_RETAILER"]
STAGE_ROLES = {
    "FARM_TO_COOP": ("FARMER", "COOP"),
    "COOP_TO_PROCESSOR": ("COOP", "PROCESSOR"),
    "PROCESSOR_TO_DISTRIBUTOR": ("PROCESSOR", "DISTRIBUTOR"),
    "DISTRIBUTOR_TO_RETAILER": ("DISTRIBUTOR", "RETAILER"),
}
STAGE_MARKUP = {
    "FARM_TO_COOP": 1.0,
    "COOP_TO_PROCESSOR": 1.15,
    "PROCESSOR_TO_DISTRIBUTOR": 1.35,
    "DISTRIBUTOR_TO_RETAILER": 1.6,
}

FRAUD_TYPES = [
    "price_manipulation",
    "phantom_quantity",
    "organic_label_fraud",
    "cold_chain_concealed",
    "circular_trading",
    "duplicate_invoice",
]
FRAUD_LABELS = {
    "none": "Legitimate",
    "price_manipulation": "Price manipulation",
    "phantom_quantity": "Phantom quantity",
    "organic_label_fraud": "Organic label fraud",
    "cold_chain_concealed": "Concealed cold-chain breach",
    "circular_trading": "Circular trading",
    "duplicate_invoice": "Duplicate invoice",
    "forged_signature": "Forged signature",
}
# Injectable from the UI: the 6 ML-learned types + identity spoofing, which is caught by
# cryptography (an invalid seller signature), not by the model.
INJECTABLE_TYPES = [*FRAUD_TYPES, "forged_signature"]

ROLE_COUNTS = {"FARMER": 80, "COOP": 12, "PROCESSOR": 10, "DISTRIBUTOR": 14, "RETAILER": 24}
ROLE_PREFIX = {"FARMER": "F", "COOP": "C", "PROCESSOR": "P", "DISTRIBUTOR": "D", "RETAILER": "R"}

SURNAMES = [
    "Patil",
    "Shinde",
    "Pawar",
    "Jadhav",
    "Deshmukh",
    "Kulkarni",
    "Singh",
    "Gill",
    "Sandhu",
    "Yadav",
    "Verma",
    "Gowda",
    "Reddy",
    "Hegde",
    "Chauhan",
    "Patel",
    "Shah",
    "Desai",
    "Mishra",
    "Tiwari",
]
FIRST_NAMES = [
    "Ramesh",
    "Suresh",
    "Anita",
    "Kavita",
    "Harpreet",
    "Gurdeep",
    "Vijay",
    "Lakshmi",
    "Manoj",
    "Sunita",
    "Prakash",
    "Meena",
    "Arjun",
    "Pooja",
    "Rahul",
    "Savita",
    "Mahesh",
    "Rekha",
    "Nitin",
    "Asha",
]
ORG_WORDS = {
    "COOP": ["Kisan Sahakari", "Krishi Utpadak", "Annadata", "Gram Vikas", "Shetkari", "Harit"],
    "PROCESSOR": ["AgroFoods", "GrainTech", "FreshPack", "Agro Mills", "NutriProcess", "Harvest Labs"],
    "DISTRIBUTOR": ["Logistics", "Cold Chain Co.", "Freight", "Supply Lines", "Movers", "Express"],
    "RETAILER": ["Mart", "Fresh Store", "Bazaar", "SuperMart", "Grocers", "Kirana"],
}


@dataclass
class Participant:
    id: str
    name: str
    role: str
    region: str
    registered_on: datetime
    land_acres: float | None = None
    capacity_tons: float | None = None

    def as_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "role": self.role,
            "region": self.region,
            "registered_on": self.registered_on,
            "land_acres": self.land_acres,
            "capacity_tons": self.capacity_tons,
        }


@dataclass
class Batch:
    id: str
    crop: str
    origin_farmer_id: str
    harvest_date: datetime
    organic_claimed: bool
    organic_cert_valid: bool
    region: str
    next_stage: int = 0
    holder_id: str = ""
    quantity_kg: float = 0.0
    trail: list[str] = field(default_factory=list)  # participant ids in order

    def as_dict(self) -> dict:
        return {
            "id": self.id,
            "crop": self.crop,
            "origin_farmer_id": self.origin_farmer_id,
            "harvest_date": self.harvest_date,
            "organic_claimed": self.organic_claimed,
            "organic_cert_valid": self.organic_cert_valid,
            "region": self.region,
        }


def reference_price(crop: str, stage: str, ts: datetime) -> float:
    """Deterministic 'mandi' reference price for a crop at a stage on a given day."""
    day = ts.toordinal()
    seasonal = 1 + 0.08 * math.sin(day / 29.0 + CROP_NAMES.index(crop))
    return round(CROPS[crop]["base_price"] * STAGE_MARKUP[stage] * seasonal, 2)


def make_participants(seed: int = 42, now: datetime | None = None) -> list[Participant]:
    """Deterministic participant registry (same seed -> same people)."""
    rng = random.Random(seed)
    now = now or datetime(2026, 1, 1)
    people: list[Participant] = []
    for role, count in ROLE_COUNTS.items():
        for i in range(1, count + 1):
            pid = f"{ROLE_PREFIX[role]}-{i:03d}"
            region = REGIONS[(i * 7 + len(role)) % len(REGIONS)] if role != "FARMER" else rng.choice(REGIONS)
            age_days = rng.randint(120, 2200)
            if role == "FARMER":
                name = f"{rng.choice(FIRST_NAMES)} {rng.choice(SURNAMES)}"
                p = Participant(
                    pid,
                    name,
                    role,
                    region,
                    now - timedelta(days=age_days),
                    land_acres=round(rng.uniform(1.5, 12.0), 1),
                )
            else:
                word = rng.choice(ORG_WORDS[role])
                name = f"{rng.choice(SURNAMES)} {word}"
                cap = {"COOP": 400, "PROCESSOR": 1500, "DISTRIBUTOR": 900, "RETAILER": 120}[role]
                p = Participant(
                    pid,
                    name,
                    role,
                    region,
                    now - timedelta(days=age_days),
                    capacity_tons=round(cap * rng.uniform(0.6, 1.6), 1),
                )
            people.append(p)
    # A handful of freshly-registered shell entities: realistic for fraud rings.
    for p in rng.sample([x for x in people if x.role in ("COOP", "DISTRIBUTOR")], 3):
        p.registered_on = now - timedelta(days=rng.randint(5, 25))
    return people


class SupplyChainSimulator:
    """Stateful generator of raw (un-scored) transactions."""

    def __init__(
        self,
        seed: int | None = 42,
        participant_seed: int = 42,
        start: datetime | None = None,
        fraud_rate: float = 0.0,
        benign_outlier_rate: float = 0.04,
        label_noise: float = 0.0,
        shift: float = 0.0,
    ):
        self.rng = random.Random(seed)
        self.clock = start or datetime(2025, 6, 1, 6, 0)
        self.participants = make_participants(participant_seed, now=self.clock)
        self.by_id = {p.id: p for p in self.participants}
        self.by_role: dict[str, list[Participant]] = {}
        for p in self.participants:
            self.by_role.setdefault(p.role, []).append(p)
        self.fraud_rate = fraud_rate
        self.benign_outlier_rate = benign_outlier_rate
        self.label_noise = label_noise
        self.shift = shift  # >0 makes fraud subtler / distributions wider (robustness test)
        self.active: list[Batch] = []
        self.batches: dict[str, Batch] = {}
        self.recent: list[dict] = []  # recent raw tx, for duplicate-invoice injection
        self._tx_counter = 0
        self._batch_counter = 0

    # ------------------------------------------------------------------ helpers
    def _new_id(self, prefix: str) -> str:
        return f"{prefix}-{self.rng.getrandbits(32):08X}"

    def _pick(self, role: str, region: str | None = None) -> Participant:
        pool = self.by_role[role]
        if region and self.rng.random() < 0.75:
            local = [p for p in pool if p.region == region]
            if local:
                return self.rng.choice(local)
        return self.rng.choice(pool)

    def _new_batch(self, perishable: bool | None = None) -> Batch:
        crops = CROP_NAMES
        if perishable is not None:
            crops = [c for c in CROP_NAMES if CROPS[c]["perishable"] == perishable]
        crop = self.rng.choice(crops)
        farmer = self._pick("FARMER")
        organic = self.rng.random() < 0.18
        b = Batch(
            id=self._new_id("B"),
            crop=crop,
            origin_farmer_id=farmer.id,
            harvest_date=self.clock
            - timedelta(days=self.rng.randint(1, 20 if CROPS[crop]["perishable"] else 90)),
            organic_claimed=organic,
            organic_cert_valid=organic,
            region=farmer.region,
            holder_id=farmer.id,
            trail=[farmer.id],
        )
        capacity = (farmer.land_acres or 1) * CROPS[crop]["yield_per_acre"]
        b.quantity_kg = round(capacity * self.rng.uniform(0.25, 0.85), 0)
        self.batches[b.id] = b
        self.active.append(b)
        return b

    def _advance_clock(self) -> None:
        self.clock += timedelta(minutes=self.rng.expovariate(1 / 9.0))

    def _transit(self, perishable: bool) -> tuple[float, float]:
        km = round(self.rng.uniform(15, 700 if not perishable else 450), 1)
        speed = self.rng.uniform(25, 55)
        return km, round(km / speed + self.rng.uniform(0.5, 4), 1)

    def _temps(self, crop: str) -> tuple[float, float, bool]:
        c = CROPS[crop]
        if c["perishable"]:
            limit = c["temp_limit"]
            avg = limit - self.rng.uniform(1.5, 6)
            mx = avg + self.rng.uniform(0.5, 3.5)
            return round(avg, 1), round(min(mx, limit - 0.2), 1), True
        avg = self.rng.uniform(18, 34)
        return round(avg, 1), round(avg + self.rng.uniform(1, 6), 1), False

    # ------------------------------------------------------------------ core
    def warmup_for(self, fraud: str | None, now: datetime | None = None) -> list[dict]:
        """Legit hops needed before `fraud` can be injected (a circular trade needs a 2+ hop trail)."""
        if fraud != "circular_trading" or any(b.next_stage >= 2 for b in self.active):
            return []
        batch = self._new_batch()
        return [self.next_transaction(now=now, force_batch=batch) for _ in range(2)]

    def next_transaction(
        self, inject: str | None = None, now: datetime | None = None, force_batch: Batch | None = None
    ) -> dict:
        """Return one raw transaction dict (with ground-truth `sim_label`)."""
        if now is not None:
            self.clock = now
        else:
            self._advance_clock()

        fraud = inject
        if force_batch is None and fraud is None and self.fraud_rate and self.rng.random() < self.fraud_rate:
            fraud = self.rng.choice(FRAUD_TYPES)

        if fraud == "duplicate_invoice" and self.recent:
            return self._duplicate()
        if fraud == "duplicate_invoice":
            fraud = "price_manipulation"
        if fraud == "circular_trading" and not any(b.next_stage >= 2 for b in self.active):
            fraud = "price_manipulation"

        batch = force_batch or self._choose_batch(fraud)
        stage = STAGES[batch.next_stage]
        seller = self.by_id[batch.holder_id]
        buyer = self._pick(STAGE_ROLES[stage][1], seller.region)
        if buyer.id in batch.trail:  # keep legitimate chains acyclic
            buyer = self._pick(STAGE_ROLES[stage][1])

        qty = (
            batch.quantity_kg
            if batch.next_stage == 0
            else round(batch.quantity_kg * self.rng.uniform(0.95, 0.99))
        )
        ref = reference_price(batch.crop, stage, self.clock)
        price = ref * self.rng.gauss(1.0, 0.07 + self.shift * 0.05)
        km, hours = self._transit(CROPS[batch.crop]["perishable"])
        t_avg, t_max, cold_claim = self._temps(batch.crop)
        organic = batch.organic_claimed
        cert = batch.organic_cert_valid
        payment = self.rng.choices(["BANK", "UPI", "CASH"], weights=[0.5, 0.38, 0.12])[0]
        grade = self.rng.choices(["A", "B", "C"], weights=[0.45, 0.4, 0.15])[0]
        moisture = round(
            self.rng.uniform(9, 14) if not CROPS[batch.crop]["perishable"] else self.rng.uniform(70, 92), 1
        )
        label = fraud or "none"

        # ---- benign outliers: weird but legitimate (keeps the model honest)
        if fraud is None and self.rng.random() < self.benign_outlier_rate:
            kind = self.rng.choice(["price_spike", "big_harvest", "honest_breach", "fast_highway", "new_org"])
            if kind == "price_spike":
                price = ref * self.rng.uniform(1.18, 1.38)
            elif kind == "big_harvest" and batch.next_stage == 0:
                farmer = self.by_id[batch.origin_farmer_id]
                qty = round(
                    (farmer.land_acres or 1)
                    * CROPS[batch.crop]["yield_per_acre"]
                    * self.rng.uniform(0.9, 1.1)
                )
            elif kind == "honest_breach" and CROPS[batch.crop]["perishable"]:
                t_max = round(CROPS[batch.crop]["temp_limit"] + self.rng.uniform(1, 6), 1)
                cold_claim = False  # breach disclosed honestly
            elif kind == "fast_highway":
                hours = round(km / self.rng.uniform(60, 78), 1)
            payment = "CASH" if self.rng.random() < 0.4 else payment

        # ---- fraud injection
        s = self.shift
        if fraud == "price_manipulation":
            if self.rng.random() < 0.75:
                price = ref * self.rng.uniform(1.35 - 0.1 * s, 2.2)
            else:
                price = ref * self.rng.uniform(0.35, 0.68 + 0.08 * s)
            qty = round(qty / 100) * 100 or qty
            payment = "CASH" if self.rng.random() < 0.5 else payment
        elif fraud == "phantom_quantity":
            if batch.next_stage == 0:  # more than the farm could ever grow
                farmer = self.by_id[batch.origin_farmer_id]
                cap = (farmer.land_acres or 1) * CROPS[batch.crop]["yield_per_acre"]
                qty = round(cap * self.rng.uniform(1.3 - 0.2 * s, 4.0))
            else:  # more than the seller received
                qty = round(qty * self.rng.uniform(1.6 - 0.3 * s, 5.5))
        elif fraud == "organic_label_fraud":
            organic, cert = True, False
            price = price * self.rng.uniform(1.15, 1.45)
        elif fraud == "cold_chain_concealed":
            limit = CROPS[batch.crop]["temp_limit"]
            t_max = round(limit + self.rng.uniform(2.5 - s, 14), 1)
            t_avg = round(t_max - self.rng.uniform(1, 4), 1)
            cold_claim = True
        elif fraud == "circular_trading":
            earlier = [pid for pid in batch.trail if pid != seller.id]
            buyer = self.by_id[self.rng.choice(earlier)] if earlier else buyer
            price = price * self.rng.uniform(1.05, 1.3)

        price = round(max(price, 0.5), 2)
        self._tx_counter += 1
        tx = {
            "id": self._new_id("TX"),
            "batch_id": batch.id,
            "crop": batch.crop,
            "stage": stage,
            "seller_id": seller.id,
            "buyer_id": buyer.id,
            "timestamp": self.clock,
            "quantity_kg": float(qty),
            "unit_price": price,
            "total_value": round(qty * price, 2),
            "ref_price": ref,
            "quality_grade": grade,
            "moisture_pct": moisture,
            "organic_claimed": organic,
            "organic_cert_valid": cert,
            "transit_km": km,
            "transit_hours": max(hours, 0.2),
            "temp_avg_c": t_avg,
            "temp_max_c": t_max,
            "cold_chain_ok_claimed": cold_claim,
            "payment_mode": payment,
            "sim_label": label,
        }
        if self.label_noise and self.rng.random() < self.label_noise:
            tx["sim_label"] = "none" if label != "none" else self.rng.choice(FRAUD_TYPES)

        # ---- advance batch state (a circular trade ends the batch's story)
        batch.trail.append(buyer.id)
        batch.holder_id = buyer.id
        if fraud != "phantom_quantity":
            batch.quantity_kg = qty
        batch.next_stage += 1
        if fraud == "circular_trading" or batch.next_stage >= len(STAGES):
            self._retire(batch)

        self.recent.append(tx)
        self.recent = self.recent[-200:]
        return tx

    def _retire(self, batch: Batch) -> None:
        if batch in self.active:
            self.active.remove(batch)

    def _choose_batch(self, fraud: str | None) -> Batch:
        if fraud == "cold_chain_concealed":
            cands = [b for b in self.active if CROPS[b.crop]["perishable"] and b.next_stage > 0]
            return (
                self.rng.choice(cands)
                if cands and self.rng.random() < 0.6
                else self._new_batch(perishable=True)
            )
        if fraud == "circular_trading":
            return self.rng.choice([b for b in self.active if b.next_stage >= 2])
        if fraud == "organic_label_fraud":
            cands = [b for b in self.active if not b.organic_claimed]
            if cands and self.rng.random() < 0.5:
                return self.rng.choice(cands)
            return self._new_batch()
        # Keep ~25 batches in flight; start a new one otherwise.
        if len(self.active) < 25 or self.rng.random() < 0.25:
            return self._new_batch()
        return self.rng.choice(self.active)

    def _duplicate(self) -> dict:
        src = self.rng.choice(self.recent[-60:])
        tx = dict(src)
        tx.pop("signature", None)  # the seller signs the resubmitted invoice afresh
        tx["id"] = self._new_id("TX")
        tx["timestamp"] = self.clock
        tx["sim_label"] = "duplicate_invoice"
        self.recent.append(tx)
        return tx
