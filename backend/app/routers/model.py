import json

from fastapi import APIRouter, HTTPException

from app.config import ARTIFACTS_DIR

router = APIRouter(prefix="/api/model", tags=["model"])


@router.get("/report")
def report() -> dict:
    path = ARTIFACTS_DIR / "metrics.json"
    if not path.exists():
        raise HTTPException(404, "metrics.json missing — run scripts/train_model.py")
    return json.loads(path.read_text(encoding="utf-8"))
