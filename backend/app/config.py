"""Runtime settings, read from environment (and backend/.env if present)."""

import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BACKEND_DIR / ".env", encoding="utf-8")

# Overridable so tests (and retraining experiments) never touch the committed model.
ARTIFACTS_DIR = Path(os.getenv("ARTIFACTS_DIR", str(BACKEND_DIR / "artifacts")))
DATA_DIR = BACKEND_DIR / "data"
# Hardhat project: contract ABI/bytecode (committed) and per-network deployment records.
DEPLOYMENTS_DIR = BACKEND_DIR.parent / "blockchain" / "deployments"

# Hardhat's published development accounts #0-#2 (funded on every local Hardhat node).
# NEVER use these on a real network — override with env vars for Sepolia etc.
_HARDHAT_KEYS = (
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
    "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
)


def _bool(name: str, default: bool) -> bool:
    return os.getenv(name, str(default)).strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Settings:
    demo_mode: bool = field(default_factory=lambda: _bool("DEMO_MODE", True))
    db_url: str = field(
        default_factory=lambda: os.getenv("DB_URL", f"sqlite:///{(DATA_DIR / 'app.db').as_posix()}")
    )
    flag_threshold: float = field(default_factory=lambda: float(os.getenv("FLAG_THRESHOLD", "0.40")))
    quarantine_threshold: float = field(
        default_factory=lambda: float(os.getenv("QUARANTINE_THRESHOLD", "0.70"))
    )
    cors_origins: list[str] = field(
        default_factory=lambda: os.getenv(
            "CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
        ).split(",")
    )
    # Seed for the participants' demo Ethereum keys (server-held custody keys, demo only).
    key_seed: str = field(default_factory=lambda: os.getenv("KEY_SEED", "agrichain-demo"))
    # Ethereum node (the local Hardhat node by default) and the accounts that act on the contract.
    chain_rpc_url: str = field(default_factory=lambda: os.getenv("CHAIN_RPC_URL", "http://127.0.0.1:8545"))
    admin_key: str = field(default_factory=lambda: os.getenv("ADMIN_PRIVATE_KEY", _HARDHAT_KEYS[0]))
    oracle_key: str = field(default_factory=lambda: os.getenv("ORACLE_PRIVATE_KEY", _HARDHAT_KEYS[1]))
    auditor_key: str = field(default_factory=lambda: os.getenv("AUDITOR_PRIVATE_KEY", _HARDHAT_KEYS[2]))
    # Risk blend weights: risk = w_ml * p_fraud + w_rules * rule_score + w_anomaly * anomaly_score
    w_ml: float = 0.60
    w_rules: float = 0.25
    w_anomaly: float = 0.15


settings = Settings()
