"""Ethereum client for the AgriChainLedger smart contract.

The backend talks to a real Ethereum node (a local Hardhat node by default, any EVM JSON-RPC
endpoint via CHAIN_RPC_URL). Three accounts act on the contract:

* admin   — deploys the contract and registers participants (REGISTRAR_ROLE)
* oracle  — the ML engine; records each transaction with its assessment (ORACLE_ROLE)
* auditor — resolves quarantined transactions (AUDITOR_ROLE)

All transactions are signed locally with those keys and sent as raw transactions, so the same
code works against Hardhat or a public testnet.
"""

from __future__ import annotations

import ast
import json
import logging
import threading
from dataclasses import dataclass
from typing import Any

from eth_abi import decode as abi_decode
from eth_account import Account
from eth_utils import keccak
from web3 import Web3
from web3.exceptions import ContractCustomError, ContractLogicError

from app.chain import identity
from app.config import DEPLOYMENTS_DIR, settings

log = logging.getLogger("agrichain.chain")

STATUS_NAMES = ["NONE", "COMMITTED", "FLAGGED", "PENDING_REVIEW", "APPROVED", "REJECTED"]
DECISION_CODES = {"CLEAR": 0, "FLAGGED": 1, "QUARANTINED": 2}
RECORD_FIELDS = [
    "batch_id", "seller", "buyer", "data_hash", "risk_bps", "fraud_type", "status", "model_version",
    "recorded_at", "recorded_block", "auditor", "verdict_note_hash",
]  # fmt: skip


# Record struct as returned by getRecords (see AgriChainLedger.Record).
RECORD_ARRAY_TYPE = (
    "(bytes32,address,address,bytes32,uint16,uint8,uint8,bytes32,uint64,uint64,address,bytes32)[]"
)
TOPIC_RECORDED = (
    "0x"
    + keccak(text="TransactionRecorded(bytes32,bytes32,address,address,bytes32,uint16,uint8,uint8)").hex()
)

ROLE_NAMES = {keccak(text=name): name for name in ("REGISTRAR_ROLE", "ORACLE_ROLE", "AUDITOR_ROLE")} | {
    b"\0" * 32: "DEFAULT_ADMIN_ROLE"
}


class ChainUnavailable(RuntimeError):
    pass


class ChainRevert(RuntimeError):
    """A contract call was rejected by the EVM. `error` is the decoded Solidity error."""

    def __init__(self, error: str, args: dict, tx_hash: str | None = None, block: int | None = None):
        self.error, self.args_, self.tx_hash, self.block = error, args, tx_hash, block
        super().__init__(f"{error}({', '.join(f'{k}={v}' for k, v in args.items())})")

    def as_dict(self) -> dict:
        return {"error": self.error, "args": self.args_, "tx_hash": self.tx_hash, "block": self.block}


@dataclass
class Receipt:
    tx_hash: str
    block: int
    gas_used: int
    status: int


def _artifact() -> dict:
    return json.loads((DEPLOYMENTS_DIR / "AgriChainLedger.json").read_text(encoding="utf-8"))


def _hex(value: Any) -> Any:
    if isinstance(value, (bytes, bytearray)):
        return "0x" + bytes(value).hex()
    return value


class Chain:
    def __init__(self, w3: Web3 | None = None, rpc_url: str | None = None):
        self.rpc_url = rpc_url or settings.chain_rpc_url
        self.w3 = w3 or Web3(Web3.HTTPProvider(self.rpc_url, request_kwargs={"timeout": 30}))
        self.admin = Account.from_key(settings.admin_key)
        self.oracle = Account.from_key(settings.oracle_key)
        self.auditor = Account.from_key(settings.auditor_key)
        art = _artifact()
        self.abi, self.bytecode = art["abi"], art["bytecode"]
        self.contract = None
        self.deploy_block = 0
        self._chain_id: int | None = None
        self._lock = threading.Lock()
        self._errors = self._error_selectors()

    # ------------------------------------------------------------------ connection & deployment
    def connected(self) -> bool:
        try:
            return self.w3.is_connected() and self.w3.eth.chain_id > 0
        except Exception:
            return False

    def require(self) -> None:
        if not self.connected():
            raise ChainUnavailable(
                f"Ethereum node not reachable at {self.rpc_url}. Start it with `npm run node` in the "
                "blockchain/ folder (the launcher does this automatically)."
            )

    @property
    def chain_id(self) -> int:
        # Fixed for a given node; cached because every signature check needs it (EIP-712 domain).
        if self._chain_id is None:
            self._chain_id = self.w3.eth.chain_id
        return self._chain_id

    def attach(self, address: str | None, deploy_block: int = 0) -> bool:
        """Attach to an already-deployed contract if it still exists on this chain."""
        if not address or len(self.w3.eth.get_code(address)) == 0:
            return False  # e.g. the Hardhat node was restarted: its chain state is gone
        self.contract = self.w3.eth.contract(address=address, abi=self.abi)
        self.deploy_block = deploy_block
        return True

    def deploy(self) -> dict:
        """Deploy a fresh AgriChainLedger. Returns its address, deploy tx and block."""
        self.require()
        self._fund_accounts()
        factory = self.w3.eth.contract(abi=self.abi, bytecode=self.bytecode)
        rcpt = self._send(
            factory.constructor(self.admin.address, self.oracle.address, self.auditor.address), self.admin
        )
        address = self.w3.eth.get_transaction_receipt(rcpt.tx_hash)["contractAddress"]
        self.contract = self.w3.eth.contract(address=address, abi=self.abi)
        self.deploy_block = rcpt.block
        log.info("AgriChainLedger deployed at %s (block %s)", address, rcpt.block)
        return {"address": address, "deploy_tx": rcpt.tx_hash, "deploy_block": rcpt.block}

    def _fund_accounts(self) -> None:
        """On dev chains whose funded accounts differ from ours (e.g. eth-tester), top ours up."""
        accounts = self.w3.eth.accounts
        if not accounts:
            return
        for acct in (self.admin, self.oracle, self.auditor):
            if self.w3.eth.get_balance(acct.address) < Web3.to_wei(1, "ether"):
                h = self.w3.eth.send_transaction(
                    {"from": accounts[0], "to": acct.address, "value": Web3.to_wei(100, "ether")}
                )
                self.w3.eth.wait_for_transaction_receipt(h)

    def domain(self) -> dict:
        return {
            "name": "AgriChainLedger",
            "version": "1",
            "chainId": self.chain_id,
            "verifyingContract": self.contract.address,
        }

    # ------------------------------------------------------------------ transactions
    def _send(self, fn, account, gas: int | None = None, expect_revert: bool = False) -> Receipt:
        with self._lock:
            params = {
                "from": account.address,
                "nonce": self.w3.eth.get_transaction_count(account.address, "pending"),
                "chainId": self.chain_id,
            }
            if gas:
                params["gas"] = gas
            try:
                tx = fn.build_transaction(params)
            except Exception as exc:
                if not _is_revert(exc):
                    raise
                raise self._decode(exc) from exc
            signed = account.sign_transaction(tx)
            try:
                h = self.w3.eth.send_raw_transaction(signed.raw_transaction)
            except Exception:
                # Hardhat mines a failing transaction but also reports the failure as an RPC error.
                if not expect_revert:
                    raise
                h = signed.hash
            r = self.w3.eth.wait_for_transaction_receipt(h, timeout=60)
        return Receipt(_hex(r["transactionHash"]), r["blockNumber"], r["gasUsed"], r["status"])

    def transfer(self, to: str, wei: int) -> Receipt:
        """Plain ETH transfer from the admin account (e.g. gas money for a demo attacker)."""
        with self._lock:
            tx = {
                "to": to,
                "value": wei,
                "gas": 21_000,
                "gasPrice": self.w3.eth.gas_price,
                "nonce": self.w3.eth.get_transaction_count(self.admin.address, "pending"),
                "chainId": self.chain_id,
            }
            h = self.w3.eth.send_raw_transaction(self.admin.sign_transaction(tx).raw_transaction)
            r = self.w3.eth.wait_for_transaction_receipt(h, timeout=60)
        return Receipt(_hex(r["transactionHash"]), r["blockNumber"], r["gasUsed"], r["status"])

    def send_expecting_revert(self, fn, account) -> ChainRevert:
        """Submit a transaction the contract will reject, so the failed attempt is mined on-chain.

        The revert reason is read with eth_call first; then the transaction is sent with a fixed gas
        limit (skipping estimation) and mined with status 0 — visible in the block like any other.
        """
        try:
            fn.call({"from": account.address})
        except Exception as exc:
            if not _is_revert(exc):
                raise
            revert = self._decode(exc)
        else:
            raise RuntimeError("Expected the contract to reject this call, but it succeeded.")
        rcpt = self._send(fn, account, gas=600_000, expect_revert=True)
        revert.tx_hash, revert.block = rcpt.tx_hash, rcpt.block
        return revert

    def register_participants(self, rows: list[tuple[str, str]]) -> list[Receipt]:
        """rows = [(participant_id, role)]; addresses are derived from the ids."""
        receipts = []
        for i in range(0, len(rows), 60):
            chunk = rows[i : i + 60]
            fn = self.contract.functions.registerParticipants(
                [identity.address_of(pid) for pid, _ in chunk],
                [identity.to_bytes32(pid) for pid, _ in chunk],
                [identity.ROLE_CODES[role] for _, role in chunk],
            )
            receipts.append(self._send(fn, self.admin))
        return receipts

    @staticmethod
    def invoice_tuple(tx) -> tuple:
        m = identity.invoice_message(tx)
        return (m["txId"], m["batchId"], m["seller"], m["buyer"], m["dataHash"])

    @staticmethod
    def assessment_tuple(a: dict, fraud_code: int) -> tuple:
        return (
            int(round(a["risk"] * 10_000)),
            DECISION_CODES[a["decision"]],
            fraud_code,
            identity.to_bytes32(a["model_version"][:31]),
        )

    def record(self, tx, signature: str, assessment: dict, fraud_code: int) -> Receipt:
        fn = self.contract.functions.recordTransaction(
            self.invoice_tuple(tx), signature, self.assessment_tuple(assessment, fraud_code)
        )
        return self._send(fn, self.oracle)

    def record_many(self, items: list[tuple[Any, str, dict, int]]) -> Receipt:
        fn = self.contract.functions.recordTransactions(
            [self.invoice_tuple(t) for t, _, _, _ in items],
            [s for _, s, _, _ in items],
            [self.assessment_tuple(a, c) for _, _, a, c in items],
        )
        return self._send(fn, self.oracle)

    def resolve(self, tx_id: str, approve: bool, note: str) -> Receipt:
        fn = self.contract.functions.resolve(identity.to_bytes32(tx_id), approve, keccak(text=note))
        return self._send(fn, self.auditor)

    # ------------------------------------------------------------------ reads
    def get_records(self, tx_ids: list[str]) -> dict[str, dict]:
        """Records from contract storage (raw eth_call + eth_abi: much faster than web3's decoder)."""
        out: dict[str, dict] = {}
        for i in range(0, len(tx_ids), 150):
            chunk = tx_ids[i : i + 150]
            fn = self.contract.functions.getRecords([identity.to_bytes32(t) for t in chunk])
            raw = self.w3.eth.call({"to": self.contract.address, "data": fn._encode_transaction_data()})
            (rows,) = abi_decode([RECORD_ARRAY_TYPE], raw)
            for tx_id, row in zip(chunk, rows, strict=True):
                rec = dict(zip(RECORD_FIELDS, row, strict=True))
                rec["status"] = STATUS_NAMES[rec["status"]]
                rec["batch_id"] = identity.from_bytes32(rec["batch_id"])
                rec["model_version"] = identity.from_bytes32(rec["model_version"])
                rec["risk"] = rec["risk_bps"] / 10_000
                for k in ("seller", "buyer", "auditor"):
                    rec[k] = Web3.to_checksum_address(rec[k])
                for k in ("data_hash", "verdict_note_hash"):
                    rec[k] = _hex(rec[k])
                out[tx_id] = rec
        return out

    def record_count(self) -> int:
        return self.contract.functions.recordCount().call()

    def recorded_ids(self) -> list[str]:
        """Ids of every TransactionRecorded event (txId is indexed: topic 1, no ABI decoding needed)."""
        logs = self.w3.eth.get_logs(
            {
                "address": self.contract.address,
                "fromBlock": self.deploy_block,
                "toBlock": "latest",
                "topics": [TOPIC_RECORDED],
            }
        )
        return [identity.from_bytes32(bytes(e["topics"][1])) for e in logs]

    # ------------------------------------------------------------------ errors
    def _error_selectors(self) -> dict[bytes, tuple[str, list[str], list[str]]]:
        out = {}
        for item in self.abi:
            if item.get("type") == "error":
                types = [i["type"] for i in item["inputs"]]
                sig = f"{item['name']}({','.join(types)})"
                out[keccak(text=sig)[:4]] = (item["name"], [i["name"] for i in item["inputs"]], types)
        return out

    def _decode(self, exc: Exception) -> ChainRevert:
        raw = _revert_bytes(exc)
        if raw and len(raw) >= 4:
            if raw[:4] in self._errors:
                name, names, types = self._errors[raw[:4]]
                values = abi_decode(types, raw[4:])
                args = {}
                for n, t, v in zip(names, types, values, strict=True):
                    if n == "neededRole":
                        args[n] = ROLE_NAMES.get(bytes(v), _hex(v))
                    elif t == "bytes32":
                        text = identity.from_bytes32(v)
                        args[n] = text if text.isprintable() and text else _hex(v)
                    elif t == "uint8" and n == "status":
                        args[n] = STATUS_NAMES[v]
                    elif t == "address":
                        args[n] = Web3.to_checksum_address(v)
                    else:
                        args[n] = _hex(v)
                return ChainRevert(name, args)
        return ChainRevert("Reverted", {"message": str(getattr(exc, "message", exc))})

    # ------------------------------------------------------------------ explorer helpers
    def labels(self) -> dict[str, str]:
        return {
            self.admin.address: "admin / registrar",
            self.oracle.address: "ML oracle",
            self.auditor.address: "auditor",
        }

    def decode_input(self, tx) -> tuple[str, dict]:
        if self.contract is None or not tx.get("to") or tx["to"] != self.contract.address:
            return ("contract deployment" if not tx.get("to") else "transfer", {})
        try:
            fn, args = self.contract.decode_function_input(tx_input(tx))
            return fn.fn_name, args
        except Exception:
            return ("unknown", {})


def tx_input(tx) -> bytes | str:
    """Calldata of a transaction (`input` on JSON-RPC nodes, `data` on eth-tester)."""
    return tx.get("input", tx.get("data", b""))


def _is_revert(exc: Exception) -> bool:
    return (
        isinstance(exc, (ContractCustomError, ContractLogicError))
        or "TransactionFailed" in type(exc).__name__
    )


def _revert_bytes(exc: Exception) -> bytes | None:
    """Revert data from web3 (hex string in .data) or eth-tester (bytes in the message)."""
    data = getattr(exc, "data", None)
    if isinstance(data, dict):
        data = data.get("data")
    if isinstance(data, str) and data.startswith("0x"):
        return bytes.fromhex(data[2:])
    for arg in getattr(exc, "args", ()):
        if isinstance(arg, (bytes, bytearray)):
            return bytes(arg)
        if isinstance(arg, str) and "b'" in arg:
            try:
                return ast.literal_eval(arg[arg.index("b'") :])
            except (ValueError, SyntaxError):
                pass
        if isinstance(arg, str) and arg.startswith("0x"):
            try:
                return bytes.fromhex(arg[2:])
            except ValueError:
                pass
    return None


_chain: Chain | None = None


def get_chain() -> Chain:
    global _chain
    if _chain is None:
        _chain = Chain()
    return _chain


def set_chain(chain: Chain | None) -> None:
    global _chain
    _chain = chain
