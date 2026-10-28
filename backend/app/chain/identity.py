"""Participant identities on Ethereum and EIP-712 invoice signatures.

Every participant (farmer, cooperative, ...) has an Ethereum account. For each transaction the
seller signs an EIP-712 `Invoice` — the same typed struct the AgriChainLedger contract verifies
with `ECDSA.tryRecover` — binding the transaction id, batch, seller, buyer and a keccak256 hash
of the full invoice data. The full data stays off-chain (SQLite); the hash goes on-chain.

DEMO CUSTODY: participant keys are derived on the server from KEY_SEED + participant id so the
simulator can sign on everyone's behalf. In a real deployment each participant keeps their own
key (e.g. in a wallet) and the platform only ever sees signatures.
"""

from __future__ import annotations

import json
from functools import lru_cache

from eth_account import Account
from eth_account.messages import encode_typed_data
from eth_utils import keccak

from app.config import settings

# Fields covered by the data hash (the full invoice; stays off-chain).
SIGNED_FIELDS = [
    "id",
    "batch_id",
    "crop",
    "stage",
    "seller_id",
    "buyer_id",
    "timestamp",
    "quantity_kg",
    "unit_price",
    "total_value",
    "ref_price",
    "quality_grade",
    "moisture_pct",
    "organic_claimed",
    "organic_cert_valid",
    "transit_km",
    "transit_hours",
    "temp_avg_c",
    "temp_max_c",
    "cold_chain_ok_claimed",
    "payment_mode",
]

INVOICE_TYPES = {
    "Invoice": [
        {"name": "txId", "type": "bytes32"},
        {"name": "batchId", "type": "bytes32"},
        {"name": "seller", "type": "address"},
        {"name": "buyer", "type": "address"},
        {"name": "dataHash", "type": "bytes32"},
    ]
}

ROLE_CODES = {"FARMER": 1, "COOP": 2, "PROCESSOR": 3, "DISTRIBUTOR": 4, "RETAILER": 5}


def canon(value):
    """Canonical form of one field value (stable across DB round-trips)."""
    if hasattr(value, "isoformat"):
        return value.isoformat(timespec="seconds")
    if isinstance(value, float):
        return round(value, 4)
    return value


def _get(tx, field: str):
    return tx[field] if isinstance(tx, dict) else getattr(tx, field)


def data_payload(tx) -> bytes:
    """Canonical JSON of the full invoice. Accepts a dict or a Transaction row."""
    payload = {f: canon(_get(tx, f)) for f in SIGNED_FIELDS}
    return json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()


def data_hash(tx) -> bytes:
    """keccak256 of the full invoice data — what gets anchored on-chain."""
    return keccak(data_payload(tx))


def to_bytes32(text: str) -> bytes:
    """Same encoding as ethers.encodeBytes32String: UTF-8, right-padded with zeros."""
    raw = text.encode()
    if len(raw) > 31:
        raise ValueError(f"{text!r} is too long for bytes32")
    return raw.ljust(32, b"\0")


def from_bytes32(raw: bytes) -> str:
    return bytes(raw).rstrip(b"\0").decode(errors="replace")


@lru_cache(maxsize=512)
def account(participant_id: str):
    return Account.from_key(keccak(text=f"{settings.key_seed}:{participant_id}"))


def address_of(participant_id: str) -> str:
    return account(participant_id).address


def invoice_message(tx) -> dict:
    return {
        "txId": to_bytes32(_get(tx, "id")),
        "batchId": to_bytes32(_get(tx, "batch_id")),
        "seller": address_of(_get(tx, "seller_id")),
        "buyer": address_of(_get(tx, "buyer_id")),
        "dataHash": data_hash(tx),
    }


def sign_invoice(tx, signer_id: str, domain: dict) -> str:
    """EIP-712 signature by `signer_id` (normally the seller; anyone else = a forgery)."""
    signed = Account.sign_typed_data(account(signer_id).key, domain, INVOICE_TYPES, invoice_message(tx))
    return "0x" + signed.signature.hex().removeprefix("0x")


def recover_signer(tx, signature: str | None, domain: dict) -> str | None:
    if not signature:
        return None
    m = invoice_message(tx)
    key = (m["txId"], m["batchId"], m["seller"], m["buyer"], m["dataHash"], signature)
    return _recover(key, tuple(sorted(domain.items())))


@lru_cache(maxsize=8192)
def _recover(key: tuple, domain: tuple) -> str | None:
    tx_id, batch_id, seller, buyer, dhash, signature = key
    msg = {"txId": tx_id, "batchId": batch_id, "seller": seller, "buyer": buyer, "dataHash": dhash}
    try:
        return Account.recover_message(
            encode_typed_data(dict(domain), INVOICE_TYPES, msg), signature=signature
        )
    except Exception:  # malformed signature
        return None


def verify_invoice(tx, signature: str | None, domain: dict) -> bool:
    return recover_signer(tx, signature, domain) == address_of(_get(tx, "seller_id"))
