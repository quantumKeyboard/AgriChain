"""Build a labelled feature table by running the simulator."""

from __future__ import annotations

from collections import defaultdict

import pandas as pd

from app.ml.features import FEATURE_NAMES, compute_features, history_from_records
from app.sim.generator import SupplyChainSimulator

# Raw fields kept alongside features so rule reasons can be rendered offline too.
RAW_COLUMNS = [
    "crop",
    "stage",
    "unit_price",
    "ref_price",
    "quantity_kg",
    "temp_max_c",
    "transit_km",
    "transit_hours",
]


def simulate_dataset(
    n: int, seed: int = 42, fraud_rate: float = 0.07, label_noise: float = 0.004, shift: float = 0.0
) -> pd.DataFrame:
    sim = SupplyChainSimulator(seed=seed, fraud_rate=fraud_rate, label_noise=label_noise, shift=shift)
    by_batch: dict[str, list[dict]] = defaultdict(list)
    by_seller: dict[str, list[dict]] = defaultdict(list)
    rows = []
    for _ in range(n):
        tx = sim.next_transaction()
        seller = sim.by_id[tx["seller_id"]].as_dict()
        # Same contract as the API: all earlier tx of the batch + the seller's recent tx.
        records = by_batch[tx["batch_id"]] + by_seller[tx["seller_id"]][-60:]
        hist = history_from_records(tx, seller, records)
        feats = compute_features(tx, seller, hist)
        raw = {k: tx[k] for k in RAW_COLUMNS}
        rows.append({**feats, **raw, "label": tx["sim_label"], "region": seller["region"]})
        by_batch[tx["batch_id"]].append(tx)
        by_seller[tx["seller_id"]].append(tx)
    df = pd.DataFrame(rows)
    return df[[*FEATURE_NAMES, *RAW_COLUMNS, "label", "region"]]
