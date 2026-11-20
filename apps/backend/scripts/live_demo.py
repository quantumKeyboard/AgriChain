"""Narrated live demo of AgriChain Sentinel, run against the running API.

Start the app first (run.bat / run.sh option 1 or 5), then from backend/:

    python scripts/live_demo.py                 # pauses after each step: press Enter to continue
    python scripts/live_demo.py --yes           # run straight through
    python scripts/live_demo.py --benchmark 10  # also inject every fraud type 10x (~2 s each) and tabulate
    python scripts/live_demo.py --no-attacks    # skip the ledger-attack section

What it shows, in order:
  1. Connect   - model version, thresholds, chain height, chain verification.
  2. Story     - hand-written transactions (app/sim/scenarios.py): an honest batch journey, then each of
                 the six fraud types plus a forged signature, with the risk score and its explanation.
  3. Ledger    - the honest records sealed into a proof-of-work block (hash, previous hash, Merkle root).
  4. Auditor   - the phantom-quantity invoice is rejected; the verdict is mined into a block.
  5. Benchmark - optional: detection rate per fraud type through the live pipeline.
  6. Attacks   - DEMO_MODE only: four insider attacks on the database, each caught by chain verification.
                 The database is re-seeded after each attack, then the story is replayed so the UI shows it.

Uses only the Python standard library for HTTP, so it also runs outside the project's virtualenv as long
as the `app` package is importable (it is, when run from backend/).
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.sim.generator import FRAUD_LABELS, INJECTABLE_TYPES  # noqa: E402
from app.sim.scenarios import Scenario, build_scenarios  # noqa: E402

# ----------------------------------------------------------------------------- terminal output
if os.name == "nt":
    os.system("")  # enables ANSI colour codes in the classic Windows console
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # ₹, °C, ✓ on Windows code pages
except AttributeError:  # pragma: no cover - non-standard stdout
    pass

_COLOUR = sys.stdout.isatty() and not os.getenv("NO_COLOR")


def _c(code: str, text: str) -> str:
    return f"\033[{code}m{text}\033[0m" if _COLOUR else text


def gold(t: str) -> str:
    return _c("33;1", t)


def green(t: str) -> str:
    return _c("32;1", t)


def amber(t: str) -> str:
    return _c("33", t)


def red(t: str) -> str:
    return _c("31;1", t)


def dim(t: str) -> str:
    return _c("2", t)


def bold(t: str) -> str:
    return _c("1", t)


BADGE = {
    "CLEAR": lambda: green("✓ CLEAR"),
    "FLAGGED": lambda: amber("⚠ FLAGGED"),
    "QUARANTINED": lambda: red("⛔ QUARANTINED"),
}


class DemoError(RuntimeError):
    pass


class Demo:
    def __init__(self, api: str, interactive: bool):
        self.api = api.rstrip("/")
        self.interactive = interactive
        self.step_no = 0

    # ------------------------------------------------------------------------- plumbing
    def call(self, method: str, path: str, body: dict | None = None) -> dict:
        data = json.dumps(body).encode("utf-8") if body is not None else None
        req = urllib.request.Request(
            f"{self.api}/api{path}", data=data, method=method, headers={"Content-Type": "application/json"}
        )
        try:
            with urllib.request.urlopen(req, timeout=180) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            detail = e.read().decode("utf-8", errors="replace")
            raise DemoError(f"{method} {path} -> HTTP {e.code}: {detail}") from e
        except urllib.error.URLError as e:
            raise DemoError(
                f"Cannot reach the API at {self.api}. Start it first (launcher option 1 or 5)."
            ) from e

    def heading(self, title: str) -> None:
        self.step_no += 1
        print()
        print(gold(f"━━━ {self.step_no}. {title} " + "━" * max(0, 66 - len(title))))

    def pause(self, prompt: str = "press Enter to continue") -> None:
        if self.interactive:
            input(dim(f"   … {prompt} "))

    def confirm(self, question: str) -> bool:
        if not self.interactive:
            return True
        return input(f"   {question} [Y/n] ").strip().lower() in ("", "y", "yes")

    @staticmethod
    def kv(key: str, value: str) -> None:
        print(f"   {dim(key.ljust(18))} {value}")

    @staticmethod
    def risk_bar(risk: float, width: int = 24) -> str:
        filled = round(risk * width)
        bar = "█" * filled + "░" * (width - filled)
        colour = red if risk >= 0.70 else amber if risk >= 0.40 else green
        return f"{colour(bar)} {risk:.2f}"

    # ------------------------------------------------------------------------- sections
    def connect(self) -> dict:
        self.heading("Connect to the running system")
        h = self.call("GET", "/health")
        s = self.call("GET", "/stats/summary")
        v = self.call("GET", "/chain/verify")
        self.kv("API", self.api)
        self.kv("Model version", h["model_version"])
        self.kv(
            "Thresholds",
            f"flag ≥ {h['thresholds']['flag']:.2f}   quarantine ≥ {h['thresholds']['quarantine']:.2f}",
        )
        self.kv("Demo mode", "on (attack buttons enabled)" if h["demo_mode"] else "off")
        self.kv("Transactions", f"{s['transactions']:,} screened, ₹{s['value_screened']:,.0f} total")
        self.kv("Chain", f"{s['chain_height']} blocks, {s['pending_pool']} records waiting in the mempool")
        self.kv(
            "Chain verification",
            green(f"✓ valid — {v['blocks_checked']} blocks recomputed")
            if v["valid"]
            else red(f"✗ broken at block {v['first_broken_index']}: {v['reason']}"),
        )
        self.pause()
        return h

    def show_result(self, s: Scenario, r: dict) -> None:
        print()
        print(f"   {bold(s.title)}")
        print(f"   {dim(s.story)}")
        self.kv("Decision", BADGE[r["decision"]]())
        self.kv("Risk", self.risk_bar(r["risk"]))
        self.kv(
            "  = 0.60 × ML",
            f"{r['p_fraud']:.2f}   + 0.25 × rules {r['rule_score']:.2f}"
            f"   + 0.15 × anomaly {r['anomaly_score']:.2f}",
        )
        if r["decision"] != "CLEAR":
            self.kv("Suspected type", r["pred_label"])
        for h in r["rule_hits"]:
            print(f"   {red('▸ ' + h['id']):<30} {h['reason']}")
        if r["pred_type"] == "forged_signature":
            self.kv("ML view", "a normal invoice — only the cryptographic signature check catches this")
        elif r["decision"] != "CLEAR":
            shap = [x for x in (r.get("shap_top") or []) if x["contribution"] >= 0.01][:3]
            parts = [f"{x['label']} (+{x['contribution']:.2f})" for x in shap]
            self.kv("SHAP: toward fraud", "; ".join(parts) or "—")
        sig = "✓ valid" if r.get("signature_valid") else red("✗ does NOT match the seller's public key")
        self.kv("Seller signature", f"Ed25519 {r['signature'][:16]}…  {sig}")
        self.kv("Transaction id", r["tx_id"])

    def story(self, tag: str, quiet: bool = False) -> dict[str, str]:
        if not quiet:
            self.heading("Fraud screening — every transaction is scored BEFORE it reaches the ledger")
            print(
                "   Each invoice: 21 features → 7 named rules + Random Forest + Isolation Forest\n"
                "   → one risk score. Below 0.40 it joins the mempool, 0.40–0.70 joins with a flag,\n"
                "   0.70 and above is quarantined for a human auditor."
            )
        ids: dict[str, str] = {}
        for s in build_scenarios(tag):
            r = self.call("POST", "/transactions", s.body)
            ids[s.key] = r["tx_id"]
            if not quiet:
                self.show_result(s, r)
                self.pause()
        return ids

    def show_block(self, index: int, highlight_tx: str | None = None) -> None:
        b = self.call("GET", f"/chain/blocks/{index}")
        zeros = len(b["hash"]) - len(b["hash"].lstrip("0"))
        self.kv("Block", f"#{b['index']}   sealed {b['timestamp']}")
        self.kv("Hash", gold(b["hash"][:zeros]) + b["hash"][zeros:])
        self.kv("Previous hash", b["prev_hash"])
        self.kv("Merkle root", b["merkle_root"])
        self.kv("Proof-of-work", f"nonce {b['nonce']:,} → hash starts with {b['difficulty']} zeros")
        for e in b["entries"]:
            mark = gold("◀") if highlight_tx and e["tx"] and e["tx"]["id"] == highlight_tx else " "
            name = e["tx"]["id"] if e["tx"] else "?"
            print(f"     {dim(str(e['position']))} {name:<14} {e['status']:<10} {e['tx_hash'][:24]}… {mark}")

    def ledger(self, ids: dict[str, str]) -> None:
        self.heading("The ledger — honest records sealed into a proof-of-work block")
        sealed = self.call("POST", "/chain/seal")["sealed_blocks"]
        tx = self.call("GET", f"/transactions/{ids['honest_farm']}")
        if tx["block_index"] is None:
            print(f"   (nothing to seal: {sealed})")
            return
        print(
            "   Each record's hash = SHA-256 of its 21 fields + the seller's signature + its ledger status.\n"
            "   The block stores the Merkle root of those hashes and the previous block's hash, and\n"
            "   is mined until its own hash starts with the difficulty's number of zeros."
        )
        self.show_block(tx["block_index"], ids["honest_farm"])
        self.pause()

    def auditor(self, ids: dict[str, str]) -> None:
        self.heading("Auditor review — the verdict itself goes on-chain")
        q = self.call("GET", "/quarantine")
        self.kv("Open in quarantine", f"{len(q['open'])} transactions waiting for a human decision")
        target = ids["phantom_quantity"]
        note = "Live demo: land records show the farm cannot produce this quantity."
        d = self.call("POST", f"/quarantine/{target}/decision", {"action": "reject", "note": note})
        self.kv("Rejected", f"{target} — “{note}”")
        self.kv("Mined into", f"block(s) {d['sealed_blocks']}")
        if d["sealed_blocks"]:
            self.show_block(d["sealed_blocks"][-1], target)
        print(
            "   The REJECTED status is part of that record's hash: quietly 'un-rejecting' it later\n"
            "   breaks the Merkle root. The verdict also becomes a training label for the learning loop."
        )
        v = self.call("GET", "/chain/verify")
        self.kv("Chain verification", green("✓ valid") if v["valid"] else red("✗ " + str(v["reason"])))
        self.pause()

    def benchmark(self, n: int) -> None:
        self.heading(f"Detection benchmark — {n} live injections per fraud type")
        print("   Each injection is generated by the simulator and goes through the real pipeline.\n")
        print(f"   {'Type':<30}{'caught':>8}{'quarantined':>13}{'avg risk':>10}")
        for t in [None, *INJECTABLE_TYPES]:
            decisions, risks = [], []
            while len(decisions) < n:
                res = self.call("POST", "/sim/step", {"n": 1, "inject": t})["results"][-1]
                if t is None and res["injected"]:
                    continue  # the live simulator also injects random fraud; skip it for the legit row
                decisions.append(res["decision"])
                risks.append(res["risk"])
            caught = sum(d != "CLEAR" for d in decisions)
            quar = sum(d == "QUARANTINED" for d in decisions)
            label = "Legitimate (false alarms)" if t is None else FRAUD_LABELS[t]
            colour = (lambda x: x) if t is None else (green if caught == n else amber)
            print(f"   {label:<30}{colour(f'{caught}/{n}'):>8}{f'{quar}/{n}':>13}{sum(risks) / n:>10.2f}")
        self.pause()

    def attack(self, mode: str, title: str, attacker: str, block: int | None = None) -> None:
        print()
        print(f"   {bold(title)}")
        print(f"   {dim(attacker)}")
        body: dict = {"mode": mode}
        if block is not None:
            body["block_index"] = block
        t = self.call("POST", "/dev/tamper", body)
        self.kv("Attacker did", f"block #{t['block_index']}: {t['change']}")
        v = self.call("GET", "/chain/verify")
        if v["valid"]:
            self.kv("Verification", red("✗ NOT detected"))
        else:
            ok = sum(b["ok"] for b in v["blocks"])
            self.kv("Verification", red(f"✗ chain broken at block #{v['first_broken_index']}"))
            self.kv("Reason", v["reason"])
            self.kv("Other blocks", f"{ok} of {v['blocks_checked']} still verify")
        self.pause("press Enter to undo (re-seeds the demo database, ~10 s)")
        self.call("POST", "/dev/reset")

    def attacks(self, honest_block: int | None) -> None:
        self.heading("Insider attacks on the database — can history be rewritten?")
        print(
            "   An attacker with write access to the database edits sealed records directly.\n"
            "   After each attack the demo database is re-seeded, so every attack starts from a valid chain."
        )
        if not self.confirm("Run the four attacks? (the database is re-seeded afterwards)"):
            return
        self.attack(
            "quantity",
            "Attack 1 — edit a sealed transaction",
            "The quantity of a record in the honest-journey block is multiplied by 10 after sealing.",
            honest_block,
        )
        self.attack(
            "verdict",
            "Attack 2 — un-reject a fraud verdict",
            "A sealed REJECTED verdict is flipped to COMMITTED, as if the fraud had been approved.",
        )
        self.attack(
            "header",
            "Attack 3 — edit a block header",
            "A block's nonce is changed, so its stored hash no longer matches its contents.",
        )
        self.attack(
            "rewrite",
            "Attack 4 — rewrite history and re-mine",
            "A quantity is edited, then every record hash and Merkle root is recomputed and that block and\n"
            "   all later blocks are re-mined, so every hash and link is valid again.",
        )
        v = self.call("GET", "/chain/verify")
        self.kv("After reset", green("✓ chain valid again") if v["valid"] else red("✗ " + str(v["reason"])))

    def outro(self) -> None:
        self.heading("Now show it in the browser — http://localhost:5173")
        for page, what in [
            ("Quarantine", "the open demo frauds with risk gauge, rule reasons, SHAP bars"),
            ("Ledger", "Verify chain, the four attack buttons, click-to-prove Merkle proofs"),
            ("Trace", "the B-DEMO tomato batch: farmer → coop → processor → back to coop (↺)"),
            ("Network", "the circular trade as a red backward arc, detected by networkx"),
            ("Model", "ablation, per-type recall, threshold slider, Retrain with auditor feedback"),
        ]:
            print(f"   {gold(page.ljust(11))} {what}")
        print()


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--api", default=os.getenv("AGRICHAIN_API", "http://localhost:8000"))
    ap.add_argument("--yes", action="store_true", help="no pauses")
    ap.add_argument("--benchmark", type=int, default=0, metavar="N", help="inject each fraud type N times")
    ap.add_argument("--no-attacks", action="store_true", help="skip the ledger attack section")
    args = ap.parse_args()

    demo = Demo(args.api, interactive=not args.yes and sys.stdin.isatty())
    print(gold("\n  AgriChain Sentinel — live demo"))
    print(dim("  ML fraud screening in front of a tamper-evident, signed, proof-of-work ledger"))
    try:
        health = demo.connect()
        tag = time.strftime("%H%M%S")
        ids = demo.story(tag)
        demo.ledger(ids)
        tx = demo.call("GET", f"/transactions/{ids['honest_farm']}")
        demo.auditor(ids)
        if args.benchmark > 0:
            demo.benchmark(args.benchmark)
        if health["demo_mode"] and not args.no_attacks:
            demo.attacks(tx["block_index"])
            print(dim("\n   Replaying the demo story so the browser shows it…"))
            ids = demo.story(time.strftime("%H%M%S") + "R", quiet=True)
            note = "Live demo: land records show the farm cannot produce this quantity."
            demo.call(
                "POST",
                f"/quarantine/{ids['phantom_quantity']}/decision",
                {"action": "reject", "note": note},
            )
        demo.outro()
    except DemoError as e:
        print(red(f"\n   {e}"))
        return 1
    except KeyboardInterrupt:
        print(dim("\n   stopped"))
        return 130
    return 0


if __name__ == "__main__":
    sys.exit(main())
