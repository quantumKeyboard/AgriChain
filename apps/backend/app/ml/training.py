"""Training pipeline for the hybrid detector, shared by `scripts/train_model.py` and the
`POST /api/model/retrain` learning loop.

Models: Random Forest (multiclass: none + 6 fraud types), Isolation Forest (trained on
legitimate rows only), Logistic Regression baseline. Evaluates rules-only vs ML-only vs
hybrid on a held-out split and on a shifted (harder) test set.
"""

import json
from datetime import datetime

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest, RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    average_precision_score,
    confusion_matrix,
    f1_score,
    precision_recall_curve,
    precision_score,
    recall_score,
    roc_auc_score,
    roc_curve,
)
from sklearn.model_selection import train_test_split
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from app.config import ARTIFACTS_DIR, settings
from app.ml.dataset import RAW_COLUMNS, simulate_dataset
from app.ml.features import FEATURE_LABELS, FEATURE_NAMES
from app.ml.rules import evaluate_rules, rule_score
from app.ml.scorer import anomaly_from_raw, blend
from app.sim.generator import FRAUD_LABELS, FRAUD_TYPES

CLASSES = ["none", *FRAUD_TYPES]


def load(name: str, n: int, seed: int, shift: float) -> pd.DataFrame:
    path = ARTIFACTS_DIR / "data" / name
    if path.exists():
        return pd.read_csv(path)
    df = simulate_dataset(n, seed=seed, shift=shift)
    path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(path, index=False)
    return df


def rules_scores(df: pd.DataFrame) -> np.ndarray:
    out = np.zeros(len(df))
    for i, row in enumerate(df.to_dict("records")):
        tx = {k: row[k] for k in RAW_COLUMNS}
        out[i] = rule_score(evaluate_rules(tx, {f: row[f] for f in FEATURE_NAMES}))
    return out


def binary_metrics(y: np.ndarray, score: np.ndarray, thr: float) -> dict:
    pred = score >= thr
    return {
        "roc_auc": round(float(roc_auc_score(y, score)), 4),
        "pr_auc": round(float(average_precision_score(y, score)), 4),
        "precision": round(float(precision_score(y, pred, zero_division=0)), 4),
        "recall": round(float(recall_score(y, pred, zero_division=0)), 4),
        "f1": round(float(f1_score(y, pred, zero_division=0)), 4),
    }


def downsample(xs: np.ndarray, ys: np.ndarray, k: int = 60) -> list[dict]:
    idx = np.unique(np.linspace(0, len(xs) - 1, min(k, len(xs))).astype(int))
    return [{"x": round(float(xs[i]), 4), "y": round(float(ys[i]), 4)} for i in idx]


def train(
    seed: int = 42,
    feedback: pd.DataFrame | None = None,
    feedback_weight: float = 5.0,
    verbose: bool = False,
) -> dict:
    """Train, evaluate, save `model.joblib` + `metrics.json`, append to `history.json`.

    `feedback` = auditor-labelled rows (same columns as the dataset). They are added to the
    training split only (never the test sets) with weight `feedback_weight`, so metrics stay
    comparable across retrains.
    """
    df = load("transactions.csv", 20000, seed, 0.0)
    shifted = load("transactions_shifted.csv", 5000, seed + 1000, 1.0)
    train_df, test = train_test_split(df, test_size=0.25, stratify=df["label"], random_state=seed)
    n_feedback = 0 if feedback is None else len(feedback)
    weights = np.ones(len(train_df))
    if n_feedback:
        train_df = pd.concat([train_df, feedback[train_df.columns]], ignore_index=True)
        weights = np.r_[weights, np.full(n_feedback, feedback_weight)]

    X_tr = train_df[FEATURE_NAMES]
    y_tr = train_df["label"].to_numpy()

    rf = RandomForestClassifier(
        n_estimators=160,
        max_depth=14,
        min_samples_leaf=2,
        class_weight="balanced_subsample",
        n_jobs=-1,
        random_state=seed,
    )
    rf.fit(X_tr, y_tr, sample_weight=weights)

    legit = X_tr[y_tr == "none"]
    iforest = IsolationForest(n_estimators=200, contamination="auto", random_state=seed).fit(legit)
    raw_legit = -iforest.score_samples(legit)
    a_lo, a_hi = float(np.percentile(raw_legit, 50)), float(np.percentile(raw_legit, 99.5))

    lr = make_pipeline(StandardScaler(), LogisticRegression(max_iter=2000, class_weight="balanced"))
    lr.fit(X_tr, y_tr != "none")

    version = datetime.now().strftime("rf-%Y%m%d-%H%M%S")
    bundle = {
        "rf": rf,
        "iforest": iforest,
        "anomaly_lo": a_lo,
        "anomaly_hi": a_hi,
        "version": version,
        "features": FEATURE_NAMES,
    }
    joblib.dump(bundle, ARTIFACTS_DIR / "model.joblib", compress=3)

    thr = settings.flag_threshold

    def evaluate(frame: pd.DataFrame) -> dict:
        X = frame[FEATURE_NAMES]
        y_lab = frame["label"].to_numpy()
        y = (y_lab != "none").astype(int)
        proba = rf.predict_proba(X)
        none_idx = list(rf.classes_).index("none")
        p = 1 - proba[:, none_idx]
        r = rules_scores(frame)
        a = anomaly_from_raw(-iforest.score_samples(X), a_lo, a_hi)
        hyb = np.clip(blend(p, r, a), 0, 1)
        lr_p = lr.predict_proba(X)[:, 1]
        return {"y": y, "y_lab": y_lab, "p": p, "r": r, "a": a, "hyb": hyb, "lr": lr_p, "proba": proba}

    ev = evaluate(test)
    sh = evaluate(shifted)

    ablation = [
        {"model": "Rules only", **binary_metrics(ev["y"], ev["r"], thr)},
        {"model": "Isolation Forest only", **binary_metrics(ev["y"], ev["a"], 0.5)},
        {"model": "Logistic Regression", **binary_metrics(ev["y"], ev["lr"], 0.5)},
        {"model": "Random Forest only", **binary_metrics(ev["y"], ev["p"], 0.5)},
        {"model": "Hybrid (RF + IF + rules)", **binary_metrics(ev["y"], ev["hyb"], thr)},
    ]
    shifted_ablation = [
        {"model": "Rules only", **binary_metrics(sh["y"], sh["r"], thr)},
        {"model": "Random Forest only", **binary_metrics(sh["y"], sh["p"], 0.5)},
        {"model": "Hybrid (RF + IF + rules)", **binary_metrics(sh["y"], sh["hyb"], thr)},
    ]

    # Multiclass confusion matrix of the hybrid decision + RF type guess
    classes = list(rf.classes_)
    fraud_cols = [i for i, c in enumerate(classes) if c != "none"]
    best_fraud = np.array(classes)[np.array(fraud_cols)[ev["proba"][:, fraud_cols].argmax(axis=1)]]
    pred_lab = np.where(ev["hyb"] >= thr, best_fraud, "none")
    cm = confusion_matrix(ev["y_lab"], pred_lab, labels=CLASSES)

    per_type = []
    for t in FRAUD_TYPES:
        m = ev["y_lab"] == t
        ms = sh["y_lab"] == t
        per_type.append(
            {
                "type": t,
                "label": FRAUD_LABELS[t],
                "support": int(m.sum()),
                "recall": round(float((ev["hyb"][m] >= thr).mean()), 4),
                "type_accuracy": round(float((pred_lab[m] == t).mean()), 4),
                "recall_shifted": round(float((sh["hyb"][ms] >= thr).mean()), 4) if ms.any() else None,
            }
        )

    fpr, tpr, _ = roc_curve(ev["y"], ev["hyb"])
    prec, rec, _ = precision_recall_curve(ev["y"], ev["hyb"])
    fpr_r, tpr_r, _ = roc_curve(ev["y"], ev["r"])

    sweep = []
    for t in np.round(np.arange(0.05, 0.96, 0.05), 2):
        pred = ev["hyb"] >= t
        tp = int((pred & (ev["y"] == 1)).sum())
        fp = int((pred & (ev["y"] == 0)).sum())
        fn = int((~pred & (ev["y"] == 1)).sum())
        tn = int((~pred & (ev["y"] == 0)).sum())
        sweep.append(
            {
                "threshold": float(t),
                "tp": tp,
                "fp": fp,
                "fn": fn,
                "tn": tn,
                "precision": round(tp / max(tp + fp, 1), 4),
                "recall": round(tp / max(tp + fn, 1), 4),
            }
        )

    bins = np.linspace(0, 1, 21)
    hist_legit, _ = np.histogram(ev["hyb"][ev["y"] == 0], bins=bins)
    hist_fraud, _ = np.histogram(ev["hyb"][ev["y"] == 1], bins=bins)

    importances = sorted(
        (
            {"feature": f, "label": FEATURE_LABELS[f], "importance": round(float(v), 4)}
            for f, v in zip(FEATURE_NAMES, rf.feature_importances_, strict=True)
        ),
        key=lambda d: -d["importance"],
    )

    metrics = {
        "model_version": version,
        "trained_at": datetime.now().isoformat(timespec="seconds"),
        "thresholds": {"flag": settings.flag_threshold, "quarantine": settings.quarantine_threshold},
        "weights": {"ml": settings.w_ml, "rules": settings.w_rules, "anomaly": settings.w_anomaly},
        "dataset": {
            "rows": len(df),
            "train_rows": len(train_df),
            "test_rows": len(test),
            "shifted_rows": len(shifted),
            "fraud_rate": round(float((df["label"] != "none").mean()), 4),
            "class_counts": {k: int(v) for k, v in df["label"].value_counts().items()},
        },
        "headline": {
            **binary_metrics(ev["y"], ev["hyb"], thr),
            "shifted": binary_metrics(sh["y"], sh["hyb"], thr),
        },
        "ablation": ablation,
        "ablation_shifted": shifted_ablation,
        "per_type": per_type,
        "confusion_matrix": {
            "labels": CLASSES,
            "display": [FRAUD_LABELS[c] for c in CLASSES],
            "matrix": cm.tolist(),
        },
        "roc": {"hybrid": downsample(fpr, tpr), "rules": downsample(fpr_r, tpr_r)},
        "pr": downsample(rec[::-1], prec[::-1]),
        "threshold_sweep": sweep,
        "score_hist": [
            {"bin": round(float(bins[i]), 2), "legit": int(hist_legit[i]), "fraud": int(hist_fraud[i])}
            for i in range(20)
        ],
        "feature_importance": importances,
        "feedback": {
            "rows": n_feedback,
            "approved": int((feedback["label"] == "none").sum()) if n_feedback else 0,
            "rejected": int((feedback["label"] != "none").sum()) if n_feedback else 0,
            "weight": feedback_weight,
        },
    }
    metrics_path = ARTIFACTS_DIR / "metrics.json"
    previous = json.loads(metrics_path.read_text(encoding="utf-8")) if metrics_path.exists() else None
    metrics_path.write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    if previous and not (ARTIFACTS_DIR / HISTORY_FILE).exists():
        append_history(previous)  # record the model being replaced as v1
    append_history(metrics)

    if verbose:
        print(f"model {version} saved")
        print(pd.DataFrame(ablation).to_string(index=False))
        print("\nshifted test set:")
        print(pd.DataFrame(shifted_ablation).to_string(index=False))
        print("\nper type:")
        print(pd.DataFrame(per_type).to_string(index=False))
    return metrics


HISTORY_FILE = "history.json"


def read_history() -> list[dict]:
    path = ARTIFACTS_DIR / HISTORY_FILE
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else []


def append_history(metrics: dict) -> None:
    hist = read_history()
    hist.append(
        {
            "model_version": metrics["model_version"],
            "trained_at": metrics["trained_at"],
            "feedback_rows": metrics.get("feedback", {}).get("rows", 0),
            **{k: metrics["headline"][k] for k in ("pr_auc", "roc_auc", "precision", "recall", "f1")},
            "shifted_f1": metrics["headline"]["shifted"]["f1"],
        }
    )
    (ARTIFACTS_DIR / HISTORY_FILE).write_text(json.dumps(hist[-50:], indent=2), encoding="utf-8")
