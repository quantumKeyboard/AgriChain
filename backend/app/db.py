"""Engine and session helpers."""

from collections.abc import Iterator

from sqlalchemy import event, inspect
from sqlmodel import Session, SQLModel, create_engine

from app.config import DATA_DIR, settings

DATA_DIR.mkdir(parents=True, exist_ok=True)

engine = create_engine(settings.db_url, connect_args={"check_same_thread": False})


@event.listens_for(engine, "connect")
def _sqlite_pragmas(dbapi_conn, _record) -> None:  # pragma: no cover - trivial
    cur = dbapi_conn.cursor()
    cur.execute("PRAGMA journal_mode=WAL")
    cur.execute("PRAGMA synchronous=NORMAL")
    cur.close()


# Bump when tables change shape; an older local database is then wiped and re-seeded.
SCHEMA_VERSION = "2"


def schema_is_current() -> bool:
    insp = inspect(engine)
    if not insp.has_table("appmeta") or not insp.has_table("transaction"):
        return False
    with engine.connect() as conn:
        row = conn.exec_driver_sql("SELECT value FROM appmeta WHERE key = 'schema_version'").first()
    return bool(row) and row[0] == SCHEMA_VERSION


def init_db() -> None:
    from app import models  # noqa: F401  (register tables)

    SQLModel.metadata.create_all(engine)


def reset_db() -> None:
    from app import models  # noqa: F401

    SQLModel.metadata.drop_all(engine)
    SQLModel.metadata.create_all(engine)


def get_session() -> Iterator[Session]:
    with Session(engine) as session:
        yield session
