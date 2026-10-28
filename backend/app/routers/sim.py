import copy
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends
from sqlmodel import Session, select

from app.chain import identity
from app.chain.ethereum import get_chain
from app.db import get_session
from app.models import Batch, Participant
from app.schemas import SimStepIn
from app.services import ingest
from app.sim.generator import CROP_NAMES, CROPS, FRAUD_LABELS, REGIONS, STAGE_ROLES, STAGES
from app.sim.state import forger_for, get_sim

router = APIRouter(prefix="/api/sim", tags=["simulator"])


@router.post("/step")
def step(body: SimStepIn, session: Session = Depends(get_session)) -> dict:
    """Generate n live transactions (optionally one injected fraud) and push them through the pipeline."""
    sim = get_sim()
    now = datetime.now()
    results = []
    forged = body.inject == "forged_signature"
    model_inject = None if forged else body.inject
    txs = [sim.next_transaction(now=now + timedelta(milliseconds=i)) for i in range(body.n - 1)]
    txs += sim.warmup_for(model_inject, now=now + timedelta(milliseconds=body.n))
    last = sim.next_transaction(inject=model_inject, now=now + timedelta(milliseconds=body.n + 5))
    if forged:
        # A legitimate-looking invoice, but signed by someone other than the seller.
        last["sim_label"] = "forged_signature"
        last["signature"] = identity.sign_invoice(last, forger_for(last["seller_id"]), get_chain().domain())
    txs.append(last)
    for tx in txs:
        batch = sim.batches[tx["batch_id"]].as_dict()
        r = ingest(session, tx, batch=batch)
        results.append(
            {
                "tx_id": r["tx_id"],
                "decision": r["decision"],
                "risk": r["risk"],
                "pred_label": FRAUD_LABELS.get(r["pred_type"]),
                "injected": tx["sim_label"] != "none",
                "sim_label": FRAUD_LABELS.get(tx["sim_label"]),
                "on_chain": r["on_chain"],
                "crop": tx["crop"],
                "total_value": tx["total_value"],
            }
        )
    return {"results": results}


@router.get("/example")
def example(type: str = "none", session: Session = Depends(get_session)) -> dict:
    """A realistic transaction for the Check form — generated on a copy so live state is untouched."""
    sim = copy.deepcopy(get_sim())
    # Only build on batches whose history is actually in the DB.
    known = {b for b in session.exec(select(Batch.id)).all()}
    sim.active = [b for b in sim.active if b.id in known]
    forge = type == "forged_signature"
    inject = None if type in ("none", "forged_signature") else type
    for _ in range(30):
        tx = sim.next_transaction(inject=inject, now=datetime.now())
        if inject or tx["sim_label"] == "none":
            break
    batch = sim.batches[tx["batch_id"]].as_dict()
    tx.pop("total_value")
    label = "forged_signature" if forge else tx.pop("sim_label")
    tx.pop("sim_label", None)
    return {
        "transaction": {**tx, "batch": batch, "forge_signature": forge},
        "label": FRAUD_LABELS.get(label),
    }


@router.get("/meta")
def meta(session: Session = Depends(get_session)) -> dict:
    people = session.exec(select(Participant).order_by(Participant.id)).all()
    return {
        "crops": [{"name": c, **CROPS[c]} for c in CROP_NAMES],
        "stages": [
            {"name": s, "seller_role": STAGE_ROLES[s][0], "buyer_role": STAGE_ROLES[s][1]} for s in STAGES
        ],
        "regions": REGIONS,
        "fraud_types": [{"type": k, "label": v} for k, v in FRAUD_LABELS.items() if k != "none"],
        "participants": [{"id": p.id, "name": p.name, "role": p.role, "region": p.region} for p in people],
    }
