"""Local explanations: SHAP contributions toward 'fraud' (i.e. away from the 'none' class)."""

from __future__ import annotations

from functools import lru_cache

import numpy as np
import pandas as pd
import shap

from app.ml.features import FEATURE_LABELS, FEATURE_NAMES
from app.ml.scorer import load_bundle


@lru_cache(maxsize=1)
def _explainer() -> shap.TreeExplainer:
    return shap.TreeExplainer(load_bundle()["rf"])


def explain(feats: dict[str, float], top: int = 6) -> list[dict]:
    rf = load_bundle()["rf"]
    none_idx = list(rf.classes_).index("none")
    X = pd.DataFrame([feats], columns=FEATURE_NAMES)
    values = _explainer().shap_values(X, check_additivity=False)
    arr = np.asarray(values)
    # shap returns (n, features, classes) in recent versions, list[classes] of (n, features) in older ones.
    contrib = -(
        arr[0, :, none_idx] if arr.ndim == 3 and arr.shape[-1] == len(rf.classes_) else arr[none_idx][0]
    )
    order = np.argsort(-np.abs(contrib))[:top]
    return [
        {
            "feature": FEATURE_NAMES[i],
            "label": FEATURE_LABELS[FEATURE_NAMES[i]],
            "value": round(float(feats[FEATURE_NAMES[i]]), 3),
            "contribution": round(float(contrib[i]), 4),
        }
        for i in order
    ]
