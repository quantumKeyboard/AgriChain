"""Blockchain explorer + verification for the AgriChainLedger contract on the Ethereum node."""

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from web3 import Web3
from web3.logs import DISCARD

from app.chain import identity
from app.chain.ethereum import STATUS_NAMES, get_chain, tx_input
from app.db import get_session
from app.models import AppMeta, LedgerEntry, Participant, Transaction
from app.views import load_views, signature_ok

router = APIRouter(prefix="/api/chain", tags=["chain"])

EVENT_NAMES = ("TransactionRecorded", "VerdictRecorded", "ParticipantRegistered")


def _meta(session: Session) -> dict[str, str]:
    return {m.key: m.value for m in session.exec(select(AppMeta)).all()}


def _hex(v) -> str:
    return v if isinstance(v, str) else Web3.to_hex(v)


def _decode_events(chain, receipt) -> list[dict]:
    out = []
    for name in EVENT_NAMES:
        for ev in chain.contract.events[name]().process_receipt(receipt, errors=DISCARD):
            args = {}
            for k, v in ev["args"].items():
                if isinstance(v, (bytes, bytearray)):
                    text = identity.from_bytes32(v) if k in ("txId", "batchId", "id") else None
                    args[k] = text if text else _hex(v)
                elif k == "status":
                    args[k] = STATUS_NAMES[v]
                else:
                    args[k] = v
            out.append({"event": name, "args": args})
    return out


def _tx_id(invoice) -> bytes:
    """Decoded Invoice struct: a dict (web3 8) or a tuple (older web3)."""
    return invoice["txId"] if isinstance(invoice, dict) else invoice[0]


def _tx_summary(chain, tx, receipt, labels: dict[str, str], full: bool) -> dict:
    fn, args = chain.decode_input(tx)
    tx_ids: list[str] = []
    if fn == "recordTransaction":
        tx_ids = [identity.from_bytes32(_tx_id(args["inv"]))]
    elif fn == "recordTransactions":
        tx_ids = [identity.from_bytes32(_tx_id(i)) for i in args["invs"]]
    elif fn == "resolve":
        tx_ids = [identity.from_bytes32(args["txId"])]
    out = {
        "hash": _hex(tx["hash"]),
        "from": tx["from"],
        "from_label": labels.get(tx["from"], "unknown account"),
        "to": tx.get("to"),
        "function": fn,
        "status": "success" if receipt["status"] == 1 else "reverted",
        "gas_used": receipt["gasUsed"],
        "tx_ids": tx_ids,
        "nonce": tx["nonce"],
    }
    if full:
        out["events"] = _decode_events(chain, receipt) if chain.contract else []
        data = tx_input(tx)
        out["input_size"] = (len(data) - 2) // 2 if isinstance(data, str) else len(data)
    return out


def _labels(chain, session: Session) -> dict[str, str]:
    labels = chain.labels()
    for p in session.exec(select(Participant)).all():
        labels[p.address] = f"{p.name} ({p.id})"
    return labels


@router.get("/info")
def info(session: Session = Depends(get_session)) -> dict:
    chain = get_chain()
    chain.require()
    meta = _meta(session)
    w3 = chain.w3
    accounts = [
        {
            "role": role,
            "address": acct.address,
            "balance_eth": float(Web3.from_wei(w3.eth.get_balance(acct.address), "ether")),
        }
        for role, acct in (
            ("Admin / registrar", chain.admin),
            ("ML oracle", chain.oracle),
            ("Auditor", chain.auditor),
        )
    ]
    return {
        "network": "Hardhat local node" if chain.chain_id == 31337 else f"chain {chain.chain_id}",
        "rpc_url": chain.rpc_url,
        "chain_id": chain.chain_id,
        "client": w3.client_version,
        "block_number": w3.eth.block_number,
        "contract_address": chain.contract.address if chain.contract else None,
        "deploy_tx": meta.get("deploy_tx"),
        "deploy_block": chain.deploy_block,
        "record_count": chain.record_count() if chain.contract else 0,
        "accounts": accounts,
        "solidity": "AgriChainLedger.sol (Solidity 0.8.28, OpenZeppelin AccessControl + EIP-712)",
    }


@router.get("/blocks")
def blocks(limit: int = 25, before: int | None = None, session: Session = Depends(get_session)) -> dict:
    """Latest Ethereum blocks, newest first, with their transactions decoded against the contract ABI."""
    chain = get_chain()
    chain.require()
    w3 = chain.w3
    head = w3.eth.block_number
    top = min(head, before - 1) if before is not None else head
    labels = _labels(chain, session)
    out = []
    for n in range(top, max(top - min(limit, 100), -1), -1):
        b = w3.eth.get_block(n, full_transactions=True)
        txs = [
            _tx_summary(chain, t, w3.eth.get_transaction_receipt(t["hash"]), labels, False)
            for t in b["transactions"]
        ]
        out.append(
            {
                "number": n,
                "hash": _hex(b["hash"]),
                "parent_hash": _hex(b["parentHash"]),
                "timestamp": b["timestamp"],
                "gas_used": b["gasUsed"],
                "tx_count": len(txs),
                "transactions": txs,
            }
        )
    return {"head": head, "blocks": out}


@router.get("/blocks/{number}")
def block_detail(number: int, session: Session = Depends(get_session)) -> dict:
    chain = get_chain()
    chain.require()
    w3 = chain.w3
    if number < 0 or number > w3.eth.block_number:
        raise HTTPException(404, "Block not found")
    b = w3.eth.get_block(number, full_transactions=True)
    labels = _labels(chain, session)
    txs = [
        _tx_summary(chain, t, w3.eth.get_transaction_receipt(t["hash"]), labels, True)
        for t in b["transactions"]
    ]
    ids = sorted({i for t in txs for i in t["tx_ids"]})
    rows = list(session.exec(select(Transaction).where(Transaction.id.in_(ids))).all()) if ids else []
    return {
        "number": number,
        "hash": _hex(b["hash"]),
        "parent_hash": _hex(b["parentHash"]),
        "state_root": _hex(b["stateRoot"]),
        "transactions_root": _hex(b["transactionsRoot"]),
        "receipts_root": _hex(b["receiptsRoot"]),
        "timestamp": b["timestamp"],
        "gas_used": b["gasUsed"],
        "gas_limit": b["gasLimit"],
        "miner": b["miner"],
        "transactions": txs,
        "records": load_views(session, rows),
    }


@router.get("/records/{tx_id}")
def record(tx_id: str, session: Session = Depends(get_session)) -> dict:
    """The contract's record for one transaction, next to the off-chain copy."""
    chain = get_chain()
    chain.require()
    tx = session.get(Transaction, tx_id)
    rec = chain.get_records([tx_id])[tx_id]
    if rec["status"] == "NONE":
        rec = None
    return {
        "tx_id": tx_id,
        "on_chain": rec,
        "off_chain_data_hash": "0x" + identity.data_hash(tx).hex() if tx else None,
        "matches": bool(rec and tx and rec["data_hash"] == "0x" + identity.data_hash(tx).hex()),
    }


@router.get("/verify")
def verify(session: Session = Depends(get_session)) -> dict:
    """Re-read every record from the smart contract and compare it with the off-chain database.

    The chain is the source of truth: any edit to the database (invoice data, verdicts, deleted rows)
    shows up as a mismatch, and the seller's signature is re-checked against the stored data.
    """
    chain = get_chain()
    chain.require()
    txs = {t.id: t for t in session.exec(select(Transaction)).all()}
    entries = {e.tx_id: e for e in session.exec(select(LedgerEntry)).all()}
    chain_ids = chain.recorded_ids()
    records = chain.get_records(sorted(set(chain_ids) | set(entries)))
    issues = []

    def issue(tx_id: str, problem: str, detail: str, block: int | None) -> None:
        issues.append({"tx_id": tx_id, "problem": problem, "detail": detail, "block": block})

    for tx_id in chain_ids:
        rec = records[tx_id]
        tx, entry = txs.get(tx_id), entries.get(tx_id)
        if tx is None or entry is None:
            issue(
                tx_id,
                "MISSING_OFF_CHAIN",
                "Recorded on-chain but deleted from the database.",
                rec["recorded_block"],
            )
            continue
        if rec["data_hash"] != "0x" + identity.data_hash(tx).hex():
            issue(
                tx_id,
                "DATA_MISMATCH",
                "Invoice data in the database no longer hashes to the dataHash stored in the contract.",
                rec["recorded_block"],
            )
        if not signature_ok(tx):
            issue(
                tx_id,
                "BAD_SIGNATURE",
                "Seller's signature does not match the stored invoice data.",
                rec["recorded_block"],
            )
        if rec["status"] != entry.status:
            issue(
                tx_id,
                "STATUS_MISMATCH",
                f"Database says {entry.status}, the contract says {rec['status']}.",
                entry.verdict_block or rec["recorded_block"],
            )
    for tx_id in set(entries) - set(chain_ids):
        issue(
            tx_id,
            "NOT_ON_CHAIN",
            "Database claims an on-chain record that does not exist.",
            entries[tx_id].record_block,
        )
    off_chain = [t for t in txs if t not in entries]
    return {
        "valid": not issues,
        "checked": len(chain_ids),
        "off_chain_only": len(off_chain),
        "contract_address": chain.contract.address,
        "block_number": chain.w3.eth.block_number,
        "issues": sorted(issues, key=lambda i: -(i["block"] or 0)),
    }
