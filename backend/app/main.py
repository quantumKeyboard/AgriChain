"""FastAPI entry point."""

import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlmodel import Session

from app.chain.ethereum import ChainRevert, ChainUnavailable, get_chain
from app.config import settings
from app.db import engine, init_db, reset_db, schema_is_current
from app.ml.scorer import load_bundle
from app.routers import batches, chain, export, model, network, quarantine, sim, stats, transactions
from app.sim.state import ensure_chain

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("agrichain")


def wait_for_chain(seconds: float = 60) -> bool:
    """The launcher starts the Hardhat node just before the API; give it a moment."""
    chain = get_chain()
    deadline = time.monotonic() + seconds
    while not chain.connected():
        if time.monotonic() > deadline:
            return False
        time.sleep(1)
    return True


@asynccontextmanager
async def lifespan(_: FastAPI):
    if not schema_is_current():
        reset_db()
    init_db()
    load_bundle()
    if wait_for_chain():
        with Session(engine) as s:
            seeded = ensure_chain(s)
        chain = get_chain()
        log.info("AgriChainLedger contract %s on chain %s", chain.contract.address, chain.chain_id)
        if seeded:
            log.info("Deployed a fresh contract and seeded demo data: %s", seeded)
    else:
        log.error(
            "Ethereum node not reachable at %s — start it with `npm run node` in blockchain/",
            settings.chain_rpc_url,
        )
    yield


app = FastAPI(title="AgriChain Sentinel API", version="1.0.0", lifespan=lifespan)


@app.exception_handler(ChainUnavailable)
def _chain_down(_: Request, exc: ChainUnavailable) -> JSONResponse:
    return JSONResponse(status_code=503, content={"detail": str(exc)})


@app.exception_handler(ChainRevert)
def _chain_revert(_: Request, exc: ChainRevert) -> JSONResponse:
    return JSONResponse(
        status_code=409,
        content={"detail": f"Smart contract rejected the call: {exc}", "revert": exc.as_dict()},
    )


@app.middleware("http")
async def _attach_contract(request: Request, call_next):
    """Re-attach (or redeploy + re-seed) if the node was restarted while the API kept running."""
    if request.url.path.startswith("/api/") and request.url.path != "/api/health":
        chain = get_chain()
        if (
            chain.contract is None
            or not chain.connected()
            or len(chain.w3.eth.get_code(chain.contract.address)) == 0
        ):
            if not chain.connected():
                return JSONResponse(status_code=503, content={"detail": str(_unavailable())})
            with Session(engine) as s:
                await run_in_threadpool(ensure_chain, s)
    return await call_next(request)


def _unavailable() -> ChainUnavailable:
    try:
        get_chain().require()
    except ChainUnavailable as e:
        return e
    return ChainUnavailable("unknown")


# Added last so it is the outermost middleware: CORS headers also go on 503s from the one above.
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
        "chain_connected": get_chain().connected(),
    }
