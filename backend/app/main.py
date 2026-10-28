"""FastAPI entry point."""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Session, select

from app.config import settings
from app.db import engine, init_db, schema_is_current
from app.ml.scorer import load_bundle
from app.models import Participant
from app.routers import batches, chain, export, model, network, quarantine, sim, stats, transactions

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("agrichain")


@asynccontextmanager
async def lifespan(_: FastAPI):
    current = schema_is_current()
    init_db()
    load_bundle()
    with Session(engine) as s:
        if not current or s.exec(select(Participant)).first() is None:
            from app.sim.state import seed_demo

            log.info("Empty or outdated database — seeding demo data")
            log.info("seeded: %s", seed_demo(s))
    yield


app = FastAPI(title="AgriChain Sentinel API", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware, allow_origins=settings.cors_origins, allow_methods=["*"], allow_headers=["*"]
)

for r in (transactions, quarantine, chain, batches, stats, sim, model, network, export):
    app.include_router(r.router)

if settings.demo_mode:
    from app.routers import dev

    app.include_router(dev.router)


@app.get("/api/health")
def health() -> dict:
    return {
        "status": "ok",
        "model_version": load_bundle()["version"],
        "demo_mode": settings.demo_mode,
        "thresholds": {"flag": settings.flag_threshold, "quarantine": settings.quarantine_threshold},
    }
