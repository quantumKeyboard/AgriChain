"""Demo-only endpoints. Mounted only when DEMO_MODE=true.

Attacks against the system, each run for real:

* db_*    — an insider edits the off-chain database. Nothing stops the edit; `/api/chain/verify`
            detects it because the smart contract still holds the original dataHash / status.
* chain_* — someone tries to change history on the blockchain itself. The transaction is signed,
            sent and mined, and the EVM reverts it with the contract's custom error.
"""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, col, select
from web3 import Web3

from app.chain import identity
from app.chain.ethereum import get_chain
from app.db import get_session
from app.models import Assessment, LedgerEntry, Participant, Transaction
from app.schemas import AttackIn
from app.services import fraud_code
from app.sim.state import forger_for, seed_demo

router = APIRouter(prefix="/api/dev", tags=["demo"])


def _latest(session: Session, status: str | None = None) -> tuple[LedgerEntry, Transaction]:
    q = select(LedgerEntry)
    if status:
        q = q.where(LedgerEntry.status == status)
    entry = session.exec(q.order_by(col(LedgerEntry.record_block).desc())).first()
    if not entry:
        raise HTTPException(
            404,
            "No REJECTED verdict on-chain yet — reject a quarantined transaction first."
            if status
            else "Nothing recorded on-chain yet.",
        )
    return entry, session.get(Transaction, entry.tx_id)


def _assessment(tx: Transaction, session: Session) -> dict:
    a = session.get(Assessment, tx.id)
    return {
        "risk": 0.05,
        "decision": "CLEAR",
        "model_version": a.model_version if a else "v1",
        "pred_type": "none",
    }


@router.post("/attack")
def attack(body: AttackIn, session: Session = Depends(get_session)) -> dict:
    chain = get_chain()
    chain.require()
    k = body.kind

    if k == "db_quantity":
        entry, tx = _latest(session)
        before = tx.quantity_kg
        tx.quantity_kg = round(tx.quantity_kg * 10, 1)
        tx.total_value = round(tx.quantity_kg * tx.unit_price, 2)
        session.commit()
        return {
            "kind": k,
            "layer": "database",
            "tx_id": tx.id,
            "result": "edited",
            "change": f"Quantity of {tx.id} edited in SQLite: {before:,.0f} kg → {tx.quantity_kg:,.0f} kg",
            "explain": "The database accepted the edit. Run Verify: the contract still stores the original "
            "dataHash, so the change is detected.",
        }

    if k == "db_verdict":
        entry, tx = _latest(session, "REJECTED")
        entry.status = "APPROVED"
        session.commit()
        return {
            "kind": k,
            "layer": "database",
            "tx_id": tx.id,
            "result": "edited",
            "change": f"Rejected fraud verdict for {tx.id} silently flipped to APPROVED in SQLite",
            "explain": "The database accepted the edit. Run Verify: the contract still says REJECTED.",
        }

    if k == "chain_overwrite":
        # The oracle re-submits an existing record with a 10x quantity — even correctly signed by the seller.
        entry, tx = _latest(session)
        data = tx.model_dump()
        data["quantity_kg"] = round(tx.quantity_kg * 10, 1)
        data["total_value"] = round(data["quantity_kg"] * tx.unit_price, 2)
        sig = identity.sign_invoice(data, tx.seller_id, chain.domain())
        fn = chain.contract.functions.recordTransaction(
            chain.invoice_tuple(data),
            sig,
            chain.assessment_tuple(_assessment(tx, session), fraud_code("none")),
        )
        revert = chain.send_expecting_revert(fn, chain.oracle)
        change = f"ML oracle tried to overwrite on-chain record {tx.id} with quantity ×10"

    elif k == "chain_unauthorized":
        # The seller of a rejected invoice tries to approve it themselves.
        entry, tx = _latest(session, "REJECTED")
        seller = identity.account(tx.seller_id)
        _fund(chain, seller.address)
        fn = chain.contract.functions.resolve(identity.to_bytes32(tx.id), True, b"\0" * 32)
        revert = chain.send_expecting_revert(fn, seller)
        name = session.get(Participant, tx.seller_id).name
        change = f"{name} (the seller) tried to approve their own rejected transaction {tx.id}"

    elif k == "chain_reverdict":
        entry, tx = _latest(session, "REJECTED")
        fn = chain.contract.functions.resolve(identity.to_bytes32(tx.id), True, b"\0" * 32)
        revert = chain.send_expecting_revert(fn, chain.auditor)
        change = f"Auditor tried to change the final REJECTED verdict of {tx.id} to APPROVED"

    elif k == "chain_forged":
        # A new invoice in a farmer's name, signed with someone else's key, pushed straight to the contract.
        entry, tx = _latest(session)
        data = tx.model_dump()
        data["id"] = f"TX-FORGE-{datetime.now():%H%M%S}"
        sig = identity.sign_invoice(data, forger_for(tx.seller_id), chain.domain())
        fn = chain.contract.functions.recordTransaction(
            chain.invoice_tuple(data), sig, chain.assessment_tuple(_assessment(tx, session), 0)
        )
        revert = chain.send_expecting_revert(fn, chain.oracle)
        change = (
            f"Invoice {data['id']} in {tx.seller_id}'s name, signed with {forger_for(tx.seller_id)}'s key"
        )

    else:  # pragma: no cover - guarded by the schema
        raise HTTPException(422, "Unknown attack")

    return {
        "kind": k,
        "layer": "blockchain",
        "tx_id": tx.id,
        "result": "reverted",
        "change": change,
        "revert": revert.as_dict(),
        "explain": f"The EVM rejected it with {revert.error}. The failed transaction is mined in block "
        f"#{revert.block} — nothing changed.",
    }


def _fund(chain, address: str) -> None:
    """Give an outside account gas money so it can attempt a transaction."""
    if chain.w3.eth.get_balance(address) < Web3.to_wei(0.1, "ether"):
        chain.transfer(address, Web3.to_wei(1, "ether"))


@router.post("/reset")
def reset(session: Session = Depends(get_session)) -> dict:
    return seed_demo(session)
