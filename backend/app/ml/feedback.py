"""Turn auditor verdicts into training labels (the learning loop).

APPROVED -> "none" (the model raised a false alarm).
REJECTED -> the fraud type the model suspected (the auditor confirmed it).
Rejections of forged signatures are skipped: that fraud is caught by cryptography, not the model.
"""

import pandas as pd
from sqlmodel import Session, select

from app.ml.dataset import RAW_COLUMNS
from app.ml.features import FEATURE_NAMES
from app.models import Assessment, Review, Transaction
from app.sim.generator import FRAUD_TYPES


def feedback_frame(session: Session) -> pd.DataFrame:
    rows = session.exec(
        select(Review, Assessment, Transaction)
        .join(Assessment, Assessment.tx_id == Review.tx_id)
        .join(Transaction, Transaction.id == Review.tx_id)
    ).all()
    out = []
    for review, a, tx in rows:
        if review.action == "APPROVED":
            label = "none"
        elif a.pred_type in FRAUD_TYPES:
            label = a.pred_type
        else:
            continue
        if not all(f in a.features for f in FEATURE_NAMES):
            continue
        out.append(
            {
                **{f: a.features[f] for f in FEATURE_NAMES},
                **{c: getattr(tx, c) for c in RAW_COLUMNS},
                "label": label,
                "region": "",
            }
        )
    return pd.DataFrame(out, columns=[*FEATURE_NAMES, *RAW_COLUMNS, "label", "region"])


def feedback_summary(session: Session) -> dict:
    reviews = session.exec(select(Review)).all()
    df = feedback_frame(session)
    return {
        "reviews": len(reviews),
        "approved": sum(r.action == "APPROVED" for r in reviews),
        "rejected": sum(r.action == "REJECTED" for r in reviews),
        "usable_labels": len(df),
        "label_counts": {k: int(v) for k, v in df["label"].value_counts().items()},
    }
