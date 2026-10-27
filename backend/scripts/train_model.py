"""Train the hybrid fraud model and write artifacts/model.joblib + artifacts/metrics.json.

Models: Random Forest (multiclass: none + 6 fraud types), Isolation Forest (trained on
legitimate rows only), Logistic Regression baseline. Evaluates rules-only vs ML-only vs
hybrid on a held-out split and on a shifted (harder) test set.
"""

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import joblib  # noqa: E402
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
from sklearn.ensemble import IsolationForest, RandomForestClassifier  # noqa: E402
from sklearn.linear_model import LogisticRegression  # noqa: E402
from sklearn.metrics import (  # noqa: E402
    average_precision_score,
    confusion_matrix,
    f1_score,
    precision_recall_curve,
    precision_score,
    recall_score,
    roc_auc_score,
    roc_curve,
)
from sklearn.model_selection import train_test_split  # noqa: E402
from sklearn.pipeline import make_pipeline  # noqa: E402
from sklearn.preprocessing import StandardScaler  # noqa: E402

from app.config import ARTIFACTS_DIR, settings  # noqa: E402
from app.ml.dataset import RAW_COLUMNS, simulate_dataset  # noqa: E402
from app.ml.features import FEATURE_LABELS, FEATURE_NAMES  # noqa: E402
from app.ml.rules import evaluate_rules, rule_score  # noqa: E402
from app.ml.scorer import anomaly_from_raw, blend  # noqa: E402
from app.sim.generator import FRAUD_LABELS, FRAUD_TYPES  # noqa: E402

CLASSES = ["none", *FRAUD_TYPES]


def load(name: str, n: int, seed: int, shift: float) -> pd.DataFrame:
    path = ARTIFACTS_DIR / "data" / name
    if path.exists():
        return pd.read_csv(path)
    print(f"{path.name} missing — generating")
    return simulate_dataset(n, seed=seed, shift=shift)


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


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    df = load("transactions.csv", 20000, args.seed, 0.0)
    shifted = load("transactions_shifted.csv", 5000, args.seed + 1000, 1.0)
    train, test = train_test_split(df, test_size=0.25, stratify=df["label"], random_state=args.seed)

    X_tr = train[FEATURE_NAMES]
    y_tr = train["label"].to_numpy()

    rf = RandomForestClassifier(
        n_estimators=160,
        max_depth=14,
        min_samples_leaf=2,
        class_weight="balanced_subsample",
        n_jobs=-1,
        random_state=args.seed,
    )
    rf.fit(X_tr, y_tr)

    legit = X_tr[y_tr == "none"]
    iforest = IsolationForest(n_estimators=200, contamination="auto", random_state=args.seed).fit(legit)
    raw_legit = -iforest.score_samples(legit)
    a_lo, a_hi = float(np.percentile(raw_legit, 50)), float(np.percentile(raw_legit, 99.5))

    lr = make_pipeline(StandardScaler(), LogisticRegression(max_iter=2000, class_weight="balanced"))
    lr.fit(X_tr, y_tr != "none")

    version = datetime.now().strftime("rf-%Y%m%d-%H%M")
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
            "train_rows": len(train),
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
    }
    (ARTIFACTS_DIR / "metrics.json").write_text(json.dumps(metrics, indent=2), encoding="utf-8")

    print(f"model {version} saved")
    print(pd.DataFrame(ablation).to_string(index=False))
    print("\nshifted test set:")
    print(pd.DataFrame(shifted_ablation).to_string(index=False))
    print("\nper type:")
    print(pd.DataFrame(per_type).to_string(index=False))


if __name__ == "__main__":
    main()
