"""Hybrid fraud scorer: Random Forest + Isolation Forest + rules -> one risk score."""

from __future__ import annotations

from functools import lru_cache

import joblib
import numpy as np
import pandas as pd

from app.config import ARTIFACTS_DIR, settings
from app.ml.features import FEATURE_NAMES
from app.ml.rules import evaluate_rules, rule_score

MODEL_PATH = ARTIFACTS_DIR / "model.joblib"


@lru_cache(maxsize=1)
def load_bundle() -> dict:
    if not MODEL_PATH.exists():
        raise RuntimeError(f"Model not found at {MODEL_PATH}. Run `python scripts/train_model.py` first.")
    return joblib.load(MODEL_PATH)


def anomaly_from_raw(raw: np.ndarray, lo: float, hi: float) -> np.ndarray:
    return np.clip((raw - lo) / max(hi - lo, 1e-9), 0.0, 1.0)


def blend(p_fraud: np.ndarray | float, rules: np.ndarray | float, anomaly: np.ndarray | float):
    return settings.w_ml * p_fraud + settings.w_rules * rules + settings.w_anomaly * anomaly


def decide(risk: float) -> str:
    if risk >= settings.quarantine_threshold:
        return "QUARANTINED"
    if risk >= settings.flag_threshold:
        return "FLAGGED"
    return "CLEAR"


def score_many(txs: list[dict], feats_list: list[dict[str, float]]) -> list[dict]:
    """Score several transactions at once (no SHAP — see explain.py)."""
    b = load_bundle()
    X = pd.DataFrame(feats_list, columns=FEATURE_NAMES)
    proba = b["rf"].predict_proba(X)
    classes = list(b["rf"].classes_)
    none_idx = classes.index("none")
    p_fraud = 1.0 - proba[:, none_idx]
    anomaly = anomaly_from_raw(-b["iforest"].score_samples(X), b["anomaly_lo"], b["anomaly_hi"])
    out = []
    for i, (tx, feats) in enumerate(zip(txs, feats_list, strict=True)):
        hits = evaluate_rules(tx, feats)
        r = rule_score(hits)
        risk = float(np.clip(blend(p_fraud[i], r, anomaly[i]), 0, 1))
        fraud_probs = {c: float(proba[i, j]) for j, c in enumerate(classes) if c != "none"}
        pred_type = max(fraud_probs, key=fraud_probs.get) if risk >= settings.flag_threshold else "none"
        if any(h["id"] == "SIGNATURE_INVALID" for h in hits):
            # Cryptographic proof of forgery is a hard gate, not a weighted signal.
            risk, pred_type = max(risk, 0.99), "forged_signature"
        out.append(
            {
                "risk": round(risk, 4),
                "p_fraud": round(float(p_fraud[i]), 4),
                "rule_score": round(r, 4),
                "anomaly_score": round(float(anomaly[i]), 4),
                "pred_type": pred_type,
                "type_probs": {k: round(v, 4) for k, v in fraud_probs.items()},
                "decision": decide(risk),
                "rule_hits": hits,
                "model_version": b["version"],
            }
        )
    return out


def score_one(tx: dict, feats: dict[str, float]) -> dict:
    return score_many([tx], [feats])[0]
