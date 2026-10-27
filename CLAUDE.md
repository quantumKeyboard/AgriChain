# CLAUDE.md

## Project
AgriChain Sentinel — a web app that scores agricultural supply-chain transactions for fraud (ML + rules) before committing them to a tamper-evident hash-chained ledger.
Core job: catch fraudulent agri supply-chain transactions before they are recorded, and keep an auditable, tamper-evident record of every decision.
Full design, scope and reasoning: see `DESIGN.md`. Read it before starting a milestone.

## Stack
- Backend: Python 3.11+, FastAPI, Uvicorn, SQLModel + SQLite (WAL mode)
- ML: scikit-learn (RandomForest multiclass + IsolationForest), pandas, numpy, shap, joblib. **Train on synthetic data we generate; do not add a pretrained Hugging Face model.**
- Ledger: own module `backend/app/chain/ledger.py` (SHA-256, Merkle root, small PoW). No external blockchain in MVP.
- Frontend: React + TypeScript + Vite, Tailwind CSS, Recharts, React Router, TanStack Query (polling, no WebSockets)
- Tests/lint: pytest + ruff (backend); Vitest + Testing Library + Prettier (frontend; `npm run lint` = Prettier check)

## Commands
```bash
# backend (from backend/)
python -m venv .venv && source .venv/bin/activate && pip install -e ".[dev]"
python scripts/generate_dataset.py --n 20000 --seed 42
python scripts/train_model.py            # writes artifacts/model.joblib + metrics.json
python scripts/seed_demo.py              # ~300 history tx, ~60 blocks
uvicorn app.main:app --reload --port 8000   # Swagger UI at /docs
pytest -q
ruff check . && ruff format --check .

# everything at once (from repo root)
./run.sh                    # macOS / Linux
run.bat                     # Windows (wraps run.ps1); venv python is backend\.venv\Scripts\python.exe

# frontend (from frontend/)
npm install
npm run dev          # http://localhost:5173
npm run test         # vitest run
npm run lint && npm run typecheck
npm run build
```
Env (`backend/.env`, copy from `.env.example`): `DEMO_MODE`, `DB_URL`, `POW_DIFFICULTY=3`, `BLOCK_SIZE=5`, `FLAG_THRESHOLD=0.40`, `QUARANTINE_THRESHOLD=0.70`. Frontend: `VITE_API_URL=http://localhost:8000`.

## Repository layout
```
backend/app/        main.py, config.py, db.py, models.py, schemas.py
backend/app/routers/  transactions, quarantine, chain, batches, stats, sim, model, dev
backend/app/chain/    ledger.py (hash, Merkle, PoW, seal, verify)
backend/app/ml/       features.py, rules.py, scorer.py, explain.py
backend/app/sim/      generator.py (shared by dataset script and live simulator)
backend/scripts/      generate_dataset.py, train_model.py, seed_demo.py
backend/artifacts/    model.joblib, metrics.json (committed)
backend/tests/
frontend/src/         api/, components/, pages/, hooks/, lib/
docs/ui-references/   UI references from the team — look here before building any UI
```

## How to work
1. Build milestones in order from `DESIGN.md` §7. Current milestone: **M8 — Learning loop** (M1–M7 done; see `DESIGN.md` §7 Build status). (Milestones: M1 Data & Model → M2 Scoring API + Ledger core → M3 Frontend shell, Check page, Dashboard (basic) → M4 Quarantine & Ledger Explorer → M5 Live simulator, charts, Batch Trace → M6 Model Insights, polish, report-ready → M7/M8 optional V1.)
2. Work in small vertical steps; after each step run the tests and the app.
3. A milestone is done only when its "Done when" criteria pass and tests, lint and typecheck are green.
4. Update the "Current milestone" line above and tick items in `DESIGN.md` when a milestone completes.
5. Each API route gets an integration test (FastAPI `TestClient`, in-memory SQLite); each rule and ledger tamper case gets a unit test.
6. UI must match `docs/ui-references/reference-dark-gold.png`. Colour tokens live in `frontend/src/index.css` (`@theme`) and `frontend/src/lib/tokens.ts`; keep them in sync and don't introduce new hues.

## Conventions
- **One feature function.** `compute_features(tx, seller, buyer, history)` in `ml/features.py` is the only place features are computed — used by training, the generator and the API. Never duplicate feature logic.
- Every rule in `ml/rules.py` returns `{id, severity 0–1, reason}` with a human-readable reason; the UI shows these verbatim.
- Risk = `0.60·p_fraud + 0.25·rule_score + 0.15·anomaly_score`; thresholds come from config, never hard-coded.
- Ledger hashing uses canonical JSON (sorted keys, no whitespace) of immutable fields plus final ledger status. Any change to hashing needs a test update and a `/chain/verify` re-check.
- Seeds: all generators/training take `--seed`; default 42. Results must be reproducible.
- Python: type hints on public functions, Pydantic schemas for every request/response. TS: strict mode, no `any`, API types in `src/api/types.ts`.
- Colours: green/amber/red are reserved for clear/flagged/quarantined. Every risk badge has an icon + label (not colour alone). Every chart has a title, units and an empty state.
- Secrets/config via env only; never commit `.env`; keep `.env.example` current. `/api/dev/*` routes exist only when `DEMO_MODE=true`.
- Cross-platform: the team develops on Windows. Use `pathlib` (never hard-coded `/` paths), pass `encoding="utf-8"` to file reads/writes, keep `run.ps1` pure ASCII, and keep `run.sh` and `run.ps1`/`run.bat` in sync.
- Commits: small, imperative subject (`Add duplicate-invoice rule`).

## Scope guardrails — do not build
Deliberately cut (reasons in `DESIGN.md` §3). Do not add, even partially, without the human asking:
- Real auth / user accounts / roles (nav role switch is cosmetic at most)
- Public blockchain, wallets, gas, MetaMask; multi-node P2P; Kubernetes; microservices; Kafka/queues
- Deep learning, LSTM, graph neural networks, federated learning
- LLM chatbot or LLM-written explanations (explanations = rules + SHAP, deterministic)
- Real IoT hardware, payments/escrow/tokens, mobile app, WebSockets/SSE
Not yet — V1/Later items (trust score, network graph, signatures, retrain loop, Ethereum anchoring, Merkle proof visual, HF/NLP add-on, map, i18n) wait until M6 is complete **and** the human asks.
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
