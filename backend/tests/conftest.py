import os
import tempfile
from pathlib import Path

import pytest

# Point the app at a throwaway database before anything imports app.config / app.db.
_TMP = Path(tempfile.mkdtemp()) / "test.db"
os.environ["DB_URL"] = f"sqlite:///{_TMP.as_posix()}"
os.environ["DEMO_MODE"] = "true"


@pytest.fixture(scope="session")
def client():
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
