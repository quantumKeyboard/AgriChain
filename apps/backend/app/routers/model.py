import json

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from app.config import ARTIFACTS_DIR
from app.db import get_session
from app.ml import explain, scorer
from app.ml.feedback import feedback_frame, feedback_summary
from app.ml.training import read_history, train

router = APIRouter(prefix="/api/model", tags=["model"])


def _metrics() -> dict:
    path = ARTIFACTS_DIR / "metrics.json"
    if not path.exists():
        raise HTTPException(404, "metrics.json missing — run scripts/train_model.py")
    return json.loads(path.read_text(encoding="utf-8"))


def _headline(m: dict) -> dict:
    keys = ("pr_auc", "roc_auc", "precision", "recall", "f1")
    return {k: m["headline"][k] for k in keys} | {"shifted_f1": m["headline"]["shifted"]["f1"]}


@router.get("/report")
def report() -> dict:
    return _metrics()


@router.get("/feedback")
def feedback(session: Session = Depends(get_session)) -> dict:
    """How many auditor verdicts are available as training labels."""
    return feedback_summary(session)


@router.get("/history")
def history() -> list[dict]:
    hist = read_history()
    if hist:
        return hist
    m = _metrics()  # the shipped model predates history tracking
    keys = ("pr_auc", "roc_auc", "precision", "recall", "f1")
    return [
        {
            "model_version": m["model_version"],
            "trained_at": m["trained_at"],
            "feedback_rows": m.get("feedback", {}).get("rows", 0),
            **{k: m["headline"][k] for k in keys},
            "shifted_f1": m["headline"]["shifted"]["f1"],
        }
    ]


@router.post("/retrain")
def retrain(session: Session = Depends(get_session)) -> dict:
    """Learning loop: retrain on the synthetic data + auditor verdicts, then hot-swap the model."""
    before = _metrics()
    fb = feedback_frame(session)
    after = train(feedback=fb if len(fb) else None)
    scorer.load_bundle.cache_clear()
    explain.reset_explainer()
    scorer.load_bundle()
    return {
        "previous_version": before["model_version"],
        "model_version": after["model_version"],
        "feedback": after["feedback"],
        "before": _headline(before),
        "after": _headline(after),
        "note": "New transactions use the new model; past assessments keep the version that made them.",
    }
