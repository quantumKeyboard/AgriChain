"""Participant identities: Ed25519 key pairs and transaction signatures.

Every participant has an Ed25519 key pair. The seller signs the canonical JSON of the
transaction's immutable fields (the same fields the ledger hashes, without the verdict).
Anyone can verify the signature with the seller's public key, so:

* an invoice "from" a seller but signed by someone else is caught at ingest (identity spoofing);
* editing a sealed transaction breaks its signature even if an attacker recomputes every
  hash and re-mines the chain, because they cannot sign as the seller.

DEMO CUSTODY: private keys are derived deterministically on the server from KEY_SEED + id,
so the simulator can sign on each participant's behalf. In a real deployment each
participant would hold their own private key and only the public key would be registered.
"""

from __future__ import annotations

import hashlib
import json
from functools import lru_cache

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey

from app.config import settings

# Fields covered by the seller's signature (shared with the ledger hash).
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


def canon(value):
    """Canonical form of one field value (stable across DB round-trips)."""
    if hasattr(value, "isoformat"):
        return value.isoformat(timespec="seconds")
    if isinstance(value, float):
        return round(value, 4)
    return value


def _get(tx, field: str):
    return tx[field] if isinstance(tx, dict) else getattr(tx, field)


def signing_payload(tx) -> bytes:
    """Canonical bytes the seller signs. Accepts a dict or a Transaction row."""
    payload = {f: canon(_get(tx, f)) for f in SIGNED_FIELDS}
    return json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()


@lru_cache(maxsize=512)
def private_key(participant_id: str) -> Ed25519PrivateKey:
    seed = hashlib.sha256(f"{settings.key_seed}:{participant_id}".encode()).digest()
    return Ed25519PrivateKey.from_private_bytes(seed)


@lru_cache(maxsize=512)
def public_key_hex(participant_id: str) -> str:
    raw = (
        private_key(participant_id)
        .public_key()
        .public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)
    )
    return raw.hex()


def sign(tx, signer_id: str) -> str:
    """Sign as `signer_id` (normally the seller; another id simulates a forgery)."""
    return private_key(signer_id).sign(signing_payload(tx)).hex()


@lru_cache(maxsize=4096)
def _verify(public_hex: str, signature_hex: str, payload: bytes) -> bool:
    try:
        Ed25519PublicKey.from_public_bytes(bytes.fromhex(public_hex)).verify(
            bytes.fromhex(signature_hex), payload
        )
        return True
    except (InvalidSignature, ValueError):
        return False


def verify(tx, signature_hex: str | None, public_hex: str | None) -> bool:
    if not signature_hex or not public_hex:
        return False
    return _verify(public_hex, signature_hex, signing_payload(tx))
