import os
import shutil
import tempfile
from pathlib import Path

import pytest

# Point the app at a throwaway database before anything imports app.config / app.db.
_TMP = Path(tempfile.mkdtemp()) / "test.db"
os.environ["DB_URL"] = f"sqlite:///{_TMP.as_posix()}"
os.environ["DEMO_MODE"] = "true"

# Work on a copy of the model artifacts so a test retrain never overwrites the committed model.
_ART = Path(tempfile.mkdtemp()) / "artifacts"
shutil.copytree(Path(__file__).resolve().parent.parent / "artifacts", _ART)
os.environ["ARTIFACTS_DIR"] = str(_ART)


@pytest.fixture(scope="session")
def chain():
    """The real AgriChainLedger bytecode, deployed on an in-process EVM (eth-tester / py-evm)."""
    from web3 import EthereumTesterProvider, Web3

    from app.chain.ethereum import Chain, set_chain

    c = Chain(w3=Web3(EthereumTesterProvider()))
    set_chain(c)
    return c


@pytest.fixture(scope="session")
def client(chain):
    from fastapi.testclient import TestClient
    from sqlmodel import Session

    from app.db import engine
    from app.main import app
    from app.sim.state import seed_demo

    with Session(engine) as s:
        seed_demo(s, n=80)
    with TestClient(app) as c:
        yield c


@pytest.fixture
def session(client):
    from sqlmodel import Session

    from app.db import engine

    with Session(engine) as s:
        yield s
