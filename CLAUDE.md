# CLAUDE.md

## Project
AgriChain Sentinel — a web app that scores agricultural supply-chain transactions for fraud (ML + rules) and records them, with the verdict, in a Solidity smart contract on an Ethereum node (local Hardhat).
Core job: catch fraudulent agri supply-chain transactions before they are recorded, and keep an auditable, tamper-evident record of every decision.
Full design, scope and reasoning: see `DESIGN.md`. Technical overview: `Project-Map.md`. Read them before starting a milestone.

## Stack
- Backend: Python 3.11+, FastAPI, Uvicorn, SQLModel + SQLite (WAL mode)
- ML: scikit-learn (RandomForest multiclass + IsolationForest), pandas, numpy, shap, joblib. **Train on synthetic data we generate; do not add a pretrained Hugging Face model.**
- Blockchain: `blockchain/` Hardhat project — `contracts/AgriChainLedger.sol` (Solidity 0.8.28, OpenZeppelin AccessControl + EIP712 + ECDSA), local node `npm run node` (chain 31337, :8545). Backend client: `backend/app/chain/ethereum.py` (web3.py); EIP-712 signing in `app/chain/identity.py`. Tests use eth-tester (in-process EVM), never a running node.
- Frontend: React + TypeScript + Vite, Tailwind CSS, Recharts, React Router, TanStack Query (polling, no WebSockets)
- Tests/lint: Hardhat + chai (contract); pytest + ruff (backend); Vitest + Testing Library + Prettier (frontend; `npm run lint` = Prettier check)

## Commands
```bash
# blockchain (from blockchain/)
npm install
npm run node                # local Ethereum node; keep it running (the API needs it)
npm test                    # contract tests
npm run compile             # after editing the .sol: rebuilds deployments/AgriChainLedger.json (ABI + bytecode, committed)

# backend (from backend/)
python -m venv .venv && source .venv/bin/activate && pip install -e ".[dev]"
python scripts/generate_dataset.py --n 20000 --seed 42
python scripts/train_model.py            # writes artifacts/model.joblib + metrics.json
python scripts/seed_demo.py              # deploys a fresh contract + ~300 history tx recorded on-chain
uvicorn app.main:app --reload --port 8000   # Swagger UI at /docs
pytest -q
ruff check . && ruff format --check .

# everything at once (from repo root)
./run.sh                    # macOS / Linux menu launcher (macOS Finder: double-click run.command)
run.bat                     # Windows menu launcher (plain cmd; venv if allowed, else pip --user)

# frontend (from frontend/)
npm install
npm run dev          # http://localhost:5173
npm run test         # vitest run
npm run lint && npm run typecheck
npm run build
```
Env (`backend/.env`, copy from `.env.example`): `DEMO_MODE`, `DB_URL`, `FLAG_THRESHOLD=0.40`, `QUARANTINE_THRESHOLD=0.70`, `CHAIN_RPC_URL=http://127.0.0.1:8545`, optional `ADMIN_/ORACLE_/AUDITOR_PRIVATE_KEY` (defaults = Hardhat dev keys, local only). Frontend: `VITE_API_URL=http://localhost:8000`.

## Repository layout
```
backend/app/        main.py, config.py, db.py, models.py, schemas.py
backend/app/routers/  transactions, quarantine, chain, batches, stats, sim, model, dev
backend/app/chain/    ethereum.py (web3 client: deploy, record, resolve, reads, revert decoding), identity.py (accounts, dataHash, EIP-712)
backend/app/ml/       features.py, rules.py, scorer.py, explain.py, training.py (shared by script + retrain API), feedback.py
backend/app/sim/      generator.py (shared by dataset script and live simulator)
backend/scripts/      generate_dataset.py, train_model.py, seed_demo.py
backend/artifacts/    model.joblib, metrics.json (committed)
backend/tests/
blockchain/           contracts/AgriChainLedger.sol, test/, scripts/ (export-abi, deploy), deployments/AgriChainLedger.json
frontend/src/         api/, components/, pages/, hooks/, lib/
docs/ui-references/   UI references from the team — look here before building any UI
```

## How to work
1. Build milestones in order from `DESIGN.md` §7. Current milestone: **none — M1–M8 + M9 (real Ethereum ledger) complete**; see `DESIGN.md` §7 Build status. New work = items from the Later list, only when the human asks. (Milestones: M1 Data & Model → M2 Scoring API + Ledger core → M3 Frontend shell, Check page, Dashboard (basic) → M4 Quarantine & Ledger Explorer → M5 Live simulator, charts, Batch Trace → M6 Model Insights, polish, report-ready → M7/M8 optional V1.)
2. Work in small vertical steps; after each step run the tests and the app.
3. A milestone is done only when its "Done when" criteria pass and tests, lint and typecheck are green.
4. Update the "Current milestone" line above and tick items in `DESIGN.md` when a milestone completes.
5. Each API route gets an integration test (FastAPI `TestClient`, temp SQLite, eth-tester chain); each rule, contract function and attack/tamper case gets a test.
6. UI must match `docs/ui-references/reference-dark-gold.png`. Colour tokens live in `frontend/src/index.css` (`@theme`) and `frontend/src/lib/tokens.ts`; keep them in sync and don't introduce new hues.

## Conventions
- **One feature function.** `compute_features(tx, seller, buyer, history)` in `ml/features.py` is the only place features are computed — used by training, the generator and the API. Never duplicate feature logic.
- Every rule in `ml/rules.py` returns `{id, severity 0–1, reason}` with a human-readable reason; the UI shows these verbatim.
- Risk = `0.60·p_fraud + 0.25·rule_score + 0.15·anomaly_score`; thresholds come from config, never hard-coded.
- On-chain `dataHash` = keccak256 of canonical JSON (sorted keys, no whitespace) of the immutable fields in `SIGNED_FIELDS` (`app/chain/identity.py`); the seller signs the EIP-712 `Invoice(txId, batchId, seller, buyer, dataHash)`. The Python typed-data definition must match the contract's `INVOICE_TYPEHASH` (a test compares the digests). Any change to hashing or the contract needs `npm run compile`, test updates and a `/chain/verify` re-check. Records are write-once: never add an update/delete function to the contract.
- Seeds: all generators/training take `--seed`; default 42. Results must be reproducible.
- Schema changes: bump `SCHEMA_VERSION` in `app/db.py` (old local DBs are then re-seeded automatically).
- Never let tests write the committed model: they run with `ARTIFACTS_DIR` pointing at a temp copy (see `tests/conftest.py`).
- Python: type hints on public functions, Pydantic schemas for every request/response. TS: strict mode, no `any`, API types in `src/api/types.ts`.
- Colours: green/amber/red are reserved for clear/flagged/quarantined. Every risk badge has an icon + label (not colour alone). Every chart has a title, units and an empty state.
- Secrets/config via env only; never commit `.env`; keep `.env.example` current. `/api/dev/*` routes exist only when `DEMO_MODE=true`.
- Cross-platform: the team develops on Windows. Use `pathlib` (never hard-coded `/` paths), pass `encoding="utf-8"` to file reads/writes, keep `run.bat` pure ASCII with CRLF endings, never upgrade pip in launchers, and keep `run.sh` and `run.bat` in sync (same menu numbers). Launchers start the Hardhat node before the API. `run.sh` must stay bash 3.2-compatible (macOS default): no `mapfile`, associative arrays or `${x,,}`. Python deps live in both `pyproject.toml` and `backend/requirements*.txt` — update both.
- Commits: small, imperative subject (`Add duplicate-invoice rule`).

## Scope guardrails — do not build
Deliberately cut (reasons in `DESIGN.md` §3). Do not add, even partially, without the human asking:
- Real auth / user accounts / login (on-chain roles are contract accounts, not app users)
- Public-network deployment in the demo, browser wallets/MetaMask, real gas; multi-node P2P; Kubernetes; microservices; Kafka/queues
- Deep learning, LSTM, graph neural networks, federated learning
- LLM chatbot or LLM-written explanations (explanations = rules + SHAP, deterministic)
- Real IoT hardware, payments/escrow/tokens, mobile app, WebSockets/SSE
Built since: trust score, network graph, signatures, retrain loop, real Ethereum smart-contract ledger (M9). Still Later (only when the human asks): public testnet deployment with wallets, multi-validator approval, real-dataset benchmark, HF/NLP add-on, map, i18n.
Also avoid: extra services, new dependencies without a one-line reason, premature caching.

## Ask before
- Changing the stack, DB schema shape, folder structure, or the ledger hashing format.
- Adding a paid service or a significant dependency.
- Changing the fraud-type list or risk formula after M1 results are reported.
- Deviating from milestone order, or starting V1/Later work.

## Definition of done (every task)
- [ ] Feature works end to end in the running app (backend + frontend)
- [ ] Tests added/updated and passing (`pytest -q`, `npm run test`)
- [ ] `ruff`, Prettier and `tsc --noEmit` clean
- [ ] No secrets, debug prints or commented-out code committed
- [ ] The affected step of the `DESIGN.md` §4 demo script still works
- [ ] `DESIGN.md` updated if behaviour or design changed
