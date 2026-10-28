"""Reset the database, deploy a fresh AgriChainLedger contract and seed a demo history on it.

Needs the Ethereum node running (`npm run node` in blockchain/)."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlmodel import Session  # noqa: E402

from app.db import engine  # noqa: E402
from app.sim.state import seed_demo  # noqa: E402

if __name__ == "__main__":
    with Session(engine) as s:
        print(seed_demo(s))
