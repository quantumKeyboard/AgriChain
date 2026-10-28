"""CSV exports for reports and audits (open in Excel / Google Sheets)."""

import csv
import io
from datetime import datetime

from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlmodel import Session, col, select

from app.chain.ethereum import get_chain
from app.db import get_session
from app.models import LedgerEntry, Transaction
from app.views import load_views

router = APIRouter(prefix="/api/export", tags=["export"])


def _csv(rows: list[dict], columns: list[str], name: str) -> Response:
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=columns, extrasaction="ignore")
    writer.writeheader()
    writer.writerows(rows)
    stamp = datetime.now().strftime("%Y%m%d-%H%M")
    return Response(
        # BOM so Excel on Windows opens UTF-8 (₹, names) correctly.
        content="﻿" + buf.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="agrichain-{name}-{stamp}.csv"'},
    )


TX_COLUMNS = [
    "id", "timestamp", "batch_id", "crop", "stage", "seller_id", "seller_name", "buyer_id", "buyer_name",
    "quantity_kg", "unit_price", "ref_price", "total_value", "risk", "decision", "pred_label", "rule_ids",
    "ledger_status", "on_chain", "block_number", "eth_tx_hash", "data_hash", "signature_valid",
    "sim_label_display",
]  # fmt: skip


@router.get("/transactions.csv")
def transactions_csv(decision: str | None = None, session: Session = Depends(get_session)) -> Response:
    q = select(Transaction).order_by(col(Transaction.timestamp).desc())
    rows = load_views(session, list(session.exec(q).all()))
    if decision:
        rows = [r for r in rows if r.get("decision") == decision]
    for r in rows:
        r["rule_ids"] = " ".join(h["id"] for h in r.get("rule_hits") or [])
    return _csv(rows, TX_COLUMNS, "transactions")


@router.get("/audit.csv")
def audit_csv(session: Session = Depends(get_session)) -> Response:
    """Every quarantined transaction with the auditor's verdict — the compliance trail."""
    q = select(Transaction).order_by(col(Transaction.timestamp).desc())
    rows = [r for r in load_views(session, list(session.exec(q).all())) if r.get("decision") == "QUARANTINED"]
    for r in rows:
        rev = r.get("review") or {}
        r["verdict"] = rev.get("action", "PENDING_REVIEW")
        r["auditor_note"] = rev.get("note", "")
        r["reviewed_at"] = rev.get("reviewed_at", "")
        r["reasons"] = " | ".join(h["reason"] for h in r.get("rule_hits") or [])
    columns = [
        "id", "timestamp", "seller_name", "buyer_name", "crop", "total_value", "risk", "pred_label",
        "reasons", "verdict", "auditor_note", "reviewed_at", "verdict_block", "verdict_tx_hash",
    ]  # fmt: skip
    return _csv(rows, columns, "audit-trail")


@router.get("/chain.csv")
def chain_csv(session: Session = Depends(get_session)) -> Response:
    """Every on-chain record as the smart contract returns it (read live from the Ethereum node)."""
    chain = get_chain()
    chain.require()
    ids = chain.recorded_ids()
    entries = {e.tx_id: e for e in session.exec(select(LedgerEntry)).all()}
    rows = []
    for tx_id, rec in chain.get_records(ids).items():
        e = entries.get(tx_id)
        rows.append({"tx_id": tx_id, **rec, "record_tx_hash": e.record_tx_hash if e else ""})
    columns = [
        "tx_id", "batch_id", "seller", "buyer", "data_hash", "risk", "fraud_type", "status", "model_version",
        "recorded_block", "recorded_at", "record_tx_hash", "auditor", "verdict_note_hash",
    ]  # fmt: skip
    return _csv(rows, columns, "onchain-records")
