"""Runtime settings, read from environment (and backend/.env if present)."""

import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent
ARTIFACTS_DIR = BACKEND_DIR / "artifacts"
DATA_DIR = BACKEND_DIR / "data"

load_dotenv(BACKEND_DIR / ".env", encoding="utf-8")


def _bool(name: str, default: bool) -> bool:
    return os.getenv(name, str(default)).strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Settings:
    demo_mode: bool = field(default_factory=lambda: _bool("DEMO_MODE", True))
    db_url: str = field(
        default_factory=lambda: os.getenv("DB_URL", f"sqlite:///{(DATA_DIR / 'app.db').as_posix()}")
    )
    pow_difficulty: int = field(default_factory=lambda: int(os.getenv("POW_DIFFICULTY", "3")))
    block_size: int = field(default_factory=lambda: int(os.getenv("BLOCK_SIZE", "5")))
    flag_threshold: float = field(default_factory=lambda: float(os.getenv("FLAG_THRESHOLD", "0.40")))
    quarantine_threshold: float = field(
        default_factory=lambda: float(os.getenv("QUARANTINE_THRESHOLD", "0.70"))
    )
    cors_origins: list[str] = field(
        default_factory=lambda: os.getenv(
            "CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
        ).split(",")
    )
    # Risk blend weights: risk = w_ml * p_fraud + w_rules * rule_score + w_anomaly * anomaly_score
    w_ml: float = 0.60
    w_rules: float = 0.25
    w_anomaly: float = 0.15


settings = Settings()
