# Project Map — AgriChain Sentinel

**ML-Driven Blockchain Framework for Detection of Fraudulent Supply-Chain Transactions (agriculture).**

This file is the technical map of the whole project: what it does, what it is built with, how the pieces fit, where each
thing lives, and the exact numbers behind it. For the design rationale and scope decisions, see `DESIGN.md`. For how to
run it, see `README.md`. For agent/coding rules, see `CLAUDE.md`.

---

## 1. What the project does (one paragraph)

Agricultural produce moves through a chain of hands: **Farmer → Cooperative → Processor → Distributor → Retailer**.
Every hand-over is a *transaction*. AgriChain Sentinel scores each transaction for fraud **before** it is written to a
blockchain-style ledger. A hybrid engine (Random Forest + Isolation Forest + 7 business rules) produces a 0–1 risk
score and an explanation. Low-risk transactions are sealed into blocks. Medium-risk ones are sealed *with a flag*.
High-risk ones are **quarantined** until a human auditor approves or rejects them, and that verdict is then sealed on the
chain too. A verifier recomputes every hash, so any later edit to a transaction, a verdict or a block is detected and
located. A React dashboard visualises all of it, and a built-in simulator streams realistic traffic and can inject six
kinds of agricultural fraud on demand.

---

## 2. Technology stack (exact versions in use)

### Backend — Python 3.11–3.13

| Library | Version | Used for |
|---|---|---|
| FastAPI | 0.162 | REST API, request validation, auto Swagger docs at `/docs` |
| Uvicorn | 0.54 | ASGI server |
| SQLModel / SQLAlchemy | 0.0.48 / 2.1 | ORM models and queries over SQLite |
| Pydantic | 2.14 | Request schemas (`app/schemas.py`) |
| SQLite (WAL mode) | built into Python | Single-file database `backend/data/app.db` |
| scikit-learn | 1.9.1 (pinned `>=1.9,<1.10`) | RandomForestClassifier, IsolationForest, LogisticRegression baseline, metrics |
| SHAP | 0.54 | TreeExplainer — per-transaction feature contributions |
| pandas / NumPy | 3.1 / 2.5 | Dataset building and vectorised scoring |
| joblib | 1.6 | Saving/loading the model bundle (`model.joblib`) |
| networkx | 3.7 | Cycle detection in the trade graph (circular trading) |
| python-dotenv | 1.2 | Loading `backend/.env` |
| hashlib (stdlib) | — | SHA-256 for transaction hashes, Merkle tree, proof-of-work |
| pytest / httpx / ruff | 9.1 / — / 0.17 | Tests, FastAPI TestClient, lint + format |

### Frontend — Node.js 20+

| Library | Version | Used for |
|---|---|---|
| React / React DOM | 19.3 | UI |
| TypeScript | 7.0 | Static typing (strict mode) |
| Vite | 8.3 | Dev server (port 5173, proxies `/api` → 8000) and production build |
| Tailwind CSS (+ `@tailwindcss/vite`) | 4.3 | Styling; design tokens in `src/index.css` `@theme` |
| Recharts | 3.10 | Area, line, bar, radar charts |
| TanStack Query | 5.105 | Server state, caching, refetch after every action |
| React Router | 7.18 | Page routing |
| lucide-react | 1.62 | Icons |
| Vitest + Testing Library + jsdom | 5.0 / 16.3 / 29.1 | Component and unit tests |
| Prettier | 3.9 | Formatting (`npm run lint`) |
| Web Crypto API (browser) | — | Re-computes the Merkle tree client-side on the Ledger page |
| Google Fonts | — | Manrope (UI), JetBrains Mono (hashes/IDs) |

### Not used, on purpose

No external blockchain node, no wallets/gas, no message queue, no WebSockets (the UI refetches after each action), no
user accounts, no deep learning, no LLM calls, no pretrained Hugging Face model. Reasons are in `DESIGN.md` §3.

---

## 3. Architecture

```
┌──────────────────────────── Browser (React SPA, :5173) ────────────────────────────┐
│ Dashboard · Check · Quarantine · Ledger · Trace · Network · Model                  │
│ Simulator toggle + "Inject fraud" menu (top bar) → POST /api/sim/step every 0.9–3.5 s│
└──────────────────────────────────────┬─────────────────────────────────────────────┘
                                       │ REST/JSON  (Vite proxy /api → :8000)
┌──────────────────────────────────────▼─────────────────────────────────────────────┐
│ FastAPI (:8000)  app/main.py — 9 routers                                            │
│                                                                                     │
│  raw transaction ──► services.assess()                                              │
│      │   history_records()  ← SQL: same-batch tx + seller's last-7-days tx          │
│      │   ml/features.py      history_from_records() + compute_features() → 21 feats │
│      │   ml/rules.py         7 named rules → max severity  (rule_score)             │
│      │   ml/scorer.py        RF → P(fraud), type probs · IF → anomaly_score         │
│      │   ml/explain.py       SHAP top-6 contributions                               │
│      ▼                                                                              │
│  risk = 0.60·P(fraud) + 0.25·rule_score + 0.15·anomaly_score                        │
│      ├─ risk < 0.40  → CLEAR        → mempool (status COMMITTED)                    │
│      ├─ 0.40–0.70    → FLAGGED      → mempool (status FLAGGED)                      │
│      └─ ≥ 0.70       → QUARANTINED  → waits for auditor → APPROVED / REJECTED       │
│                                                                                     │
│  chain/ledger.py: mempool ≥ 5 entries → block: Merkle root → PoW (3 hex zeros)      │
│                   verify_chain(): recompute tx hashes, Merkle roots, header hashes, │
│                   PoW and prev-hash links; report first broken block + reason       │
│                                                                                     │
│  sim/generator.py: participants, batches, transactions, 6 fraud injectors           │
└──────────────────────────────────────┬─────────────────────────────────────────────┘
                                       ▼
                        SQLite  backend/data/app.db  (7 tables)
```

**Offline pipeline (training):**
`scripts/generate_dataset.py` → simulator → `artifacts/data/*.csv` → `scripts/train_model.py` →
`artifacts/model.joblib` + `artifacts/metrics.json` (shown on the Model page).

---

## 4. The blockchain ledger (`backend/app/chain/ledger.py`)

| Concept | Implementation |
|---|---|
| Transaction hash | `SHA-256(canonical JSON)` of the 21 immutable transaction fields **plus its final ledger status** (`COMMITTED` / `FLAGGED` / `APPROVED` / `REJECTED`). Canonical = sorted keys, no whitespace, datetimes to seconds, floats rounded to 4 dp. Including the status means flipping a verdict breaks the hash. |
| Merkle root | Pairwise `SHA-256(left + right)` up the tree; an odd last node is duplicated. Empty block → `SHA-256("")`. `merkle_proof()` returns the sibling path for any leaf. |
| Block header hash | `SHA-256("index|timestamp|prev_hash|merkle_root|nonce|difficulty")` |
| Consensus | Proof-of-work: increment `nonce` until the hash starts with `POW_DIFFICULTY` hex zeros (default 3, about 4,096 tries on average, milliseconds). |
| Genesis | Block 0, `prev_hash = 64 × "0"`, no transactions. |
| Block size | `BLOCK_SIZE = 5` records. Auditor verdicts and `POST /api/chain/seal` force-seal a partial block so the result is visible immediately. |
| Mempool | `LedgerEntry` rows with `block_index = NULL`. |
| Verification | For every block, in order: recompute each tx hash from today's DB rows → Merkle root → header hash → PoW target → previous-hash link. Returns `valid`, `first_broken_index`, a reason, and the tampered tx IDs. |
| Tamper demo (`DEMO_MODE` only) | `POST /api/dev/tamper` with mode `quantity` (×10 a sealed quantity), `verdict` (flip a sealed REJECTED to COMMITTED) or `header` (edit a nonce). `POST /api/dev/reset` re-seeds. |

Scope note: this is a **single-node** chain. It is tamper-evident (hashing, Merkle trees, PoW, verification), but there
is no peer-to-peer network or multi-party consensus.

---

## 5. Machine learning

### 5.1 Data — synthetic simulator (`backend/app/sim/generator.py`)

| Element | Details |
|---|---|
| Participants | 140, deterministic from seed 42: 80 farmers (1.5–12 acres), 12 cooperatives, 10 processors, 14 distributors, 24 retailers. Indian names; 6 regions (Maharashtra, Punjab, Uttar Pradesh, Karnataka, Madhya Pradesh, Gujarat). 3 recently registered "shell" entities. |
| Crops | wheat, rice, soybean (non-perishable); onion (≤30 °C), tomato (≤12 °C), mango (≤14 °C) (perishable). Each has a base price (₹/kg) and yield per acre. |
| Prices | Deterministic daily "mandi" reference price = base × stage mark-up (1.0 / 1.15 / 1.35 / 1.6) × seasonal sine wave. Legitimate prices ≈ reference ± 7 %. |
| Batches | A harvest lot that moves through the 4 stages; quantity shrinks 1–5 % per hop; ~18 % sold as organic (certified). ~25 batches in flight at a time. |
| Realism guards | ~4 % **legitimate outliers** (drought price spike +18–38 %, bumper harvest 90–110 % of capacity, honestly disclosed temperature breach, fast highway transit, cash payment); 0.4 % label noise; a **shifted test set** (`shift=1.0`) where fraud is subtler. |
| Dataset | 20,000 transactions (7 % fraud) + 5,000 shifted. Class counts: none 18,593 · duplicate 272 · phantom 257 · cold-chain 227 · organic 223 · price 217 · circular 211. |

### 5.2 The six fraud types

| Fraud type | How it is injected | Rule that catches it | Key features |
|---|---|---|---|
| Price manipulation | price 35–120 % above, or 32–65 % below, the reference; round totals; often cash | `PRICE_BAND` (deviation > 30 %) | `price_deviation`, `abs_price_deviation`, `round_total`, `payment_cash` |
| Phantom quantity | farm stage: 1.3–4 × what the acreage can grow; later stages: 1.6–5.5 × what the seller received | `YIELD_IMPOSSIBLE` (ratio > 1.25) | `qty_vs_capacity` |
| Organic label fraud | sold as organic with no valid certificate, +15–45 % price | `ORGANIC_UNCERTIFIED` | `organic_mismatch`, `organic_claimed` |
| Concealed cold-chain breach | perishable crop's max temperature 2.5–14 °C over its limit, yet declared "cold chain OK" | `COLD_CHAIN` | `temp_over_limit`, `cold_chain_concealed` |
| Circular trading | batch sold back to an earlier holder (A→B→C→A) | `CIRCULAR` | `buyer_in_trail`, plus `networkx` cycles on the Network page |
| Duplicate invoice | identical seller/buyer/batch/quantity/value resubmitted | `DUPLICATE` | `duplicate_seen` |

A seventh rule, `IMPOSSIBLE_TRANSIT` (implied speed > 90 km/h), adds supporting evidence.

### 5.3 Features — 21, computed in ONE place (`backend/app/ml/features.py`)

`crop_idx, perishable, stage_idx, log_quantity, price_deviation, abs_price_deviation, qty_vs_capacity,
organic_claimed, organic_mismatch, temp_over_limit, cold_chain_concealed, transit_speed_kmph, moisture_pct, grade_idx,
seller_tx_24h, pair_count_7d, buyer_in_trail, duplicate_seen, seller_age_days, payment_cash, round_total`

History features come from `history_from_records()`, which reads *prior records of the same batch + the seller's last
7 days*. Training feeds it in-memory records; the API feeds it rows from SQL (`services.history_records`). A test
(`test_feature_parity_between_db_and_in_memory_history`) asserts both paths give identical features, so there is no
train/serve skew.

### 5.4 Models (`backend/scripts/train_model.py` → `artifacts/model.joblib`)

| Model | Configuration | Role |
|---|---|---|
| Random Forest | 160 trees, max depth 14, min leaf 2, `class_weight="balanced_subsample"`, **7 classes** (none + 6 fraud types) | `P(fraud) = 1 − P(none)`; the fraud-type guess is the argmax over the fraud classes |
| Isolation Forest | 200 trees, trained on legitimate rows only | Anomaly score, normalised so the median legit row = 0 and the 99.5th percentile = 1 |
| Logistic Regression | standardised features, balanced, binary | Baseline for the ablation only |
| Rule engine | 7 rules, severity 0–1 | `rule_score = max severity` |
| **Hybrid** | `risk = 0.60·P(fraud) + 0.25·rule_score + 0.15·anomaly` | Final decision: flag ≥ 0.40, quarantine ≥ 0.70 |

Split: stratified 75/25, seed 42. Training takes about 5 s. Scoring takes ~50–75 ms per transaction including SHAP.

### 5.5 Results (model `rf-20261027-0753`, from `artifacts/metrics.json`)

| Metric | Held-out test (5,000) | Shifted test (5,000) |
|---|---|---|
| PR-AUC | **0.958** | 0.939 |
| ROC-AUC | 0.972 | 0.975 |
| Precision @ 0.40 | 0.980 | 0.886 |
| Recall @ 0.40 | 0.949 | 0.929 |
| F1 @ 0.40 | **0.964** | 0.907 |

Ablation (F1, held-out): Rules only 0.949 · Isolation Forest only 0.356 · Logistic Regression 0.943 ·
Random Forest only 0.968 · **Hybrid 0.964**. On the shifted set the hybrid beats rules-only (0.907 vs 0.870): rules
are brittle when fraud gets subtler.

Per-type recall (held-out / shifted): price 94 % / 81 % · phantom 98 % / 95 % · organic 95 % / 95 % ·
cold-chain 95 % / 96 % · circular 92 % / 97 % · duplicate 94 % / 94 %.

> The data is synthetic, so these scores are optimistic. The Model page and README say this explicitly.

### 5.6 Explainability

- **Rules:** each hit carries a human sentence, e.g. *"Quantity 30,758 kg is 2.2× the quantity the seller actually received for this batch."*
- **SHAP:** `TreeExplainer` on the Random Forest. Contribution toward fraud = −(SHAP value of the `none` class). The top 6 features are shown as diverging bars.
- **Score breakdown:** the three hybrid components and their weights.
- **Type probabilities:** the RF probability for each of the six fraud types (Quarantine page).

---

## 6. Database (SQLite, `backend/app/models.py`)

| Table | Key columns |
|---|---|
| `participant` | id (`F-001`…), name, role, region, registered_on, land_acres, capacity_tons |
| `batch` | id (`B-XXXXXXXX`), crop, origin_farmer_id, harvest_date, organic_claimed, organic_cert_valid, region |
| `transaction` | id (`TX-XXXXXXXX`), batch_id, crop, stage, seller_id, buyer_id, timestamp, quantity_kg, unit_price, total_value, ref_price, quality_grade, moisture_pct, organic flags, transit_km/hours, temp_avg/max_c, cold_chain_ok_claimed, payment_mode, sim_label (ground truth, never used for scoring) |
| `assessment` | tx_id, risk, p_fraud, rule_score, anomaly_score, pred_type, decision, rule_hits (JSON), type_probs (JSON), shap_top (JSON), features (JSON), model_version |
| `review` | tx_id, action (APPROVED/REJECTED), note, reviewed_at |
| `block` | index, timestamp, prev_hash, merkle_root, nonce, difficulty, hash, tx_count |
| `ledgerentry` | tx_id, status, block_index (NULL = mempool), position, tx_hash, queued_at |

On first start with an empty DB, the API seeds 300 transactions over the last ~45 hours (8 % fraud) and ~60 mined
blocks. All but 4 quarantined items are already reviewed, so the queue has something to show.

---

## 7. REST API (all under `/api`; interactive docs at `http://localhost:8000/docs`)

| Method & path | Purpose |
|---|---|
| `GET /health` | Status, model version, thresholds, demo mode |
| `POST /transactions/score` | Dry run: score without saving |
| `POST /transactions` | Score + route (mempool or quarantine) + seal if the block is full |
| `GET /transactions` | List; filters `decision`, `pred_type`, `batch_id`, `ledger_status`, `limit` |
| `GET /transactions/{id}` | Full detail incl. SHAP, rules, ledger status, block |
| `GET /quarantine` | Open items (with explanations) + recently reviewed |
| `POST /quarantine/{id}/decision` | `{action: approve\|reject, note}`; seals the verdict |
| `GET /chain/blocks`, `GET /chain/blocks/{i}` | Blocks; block detail with stored vs recomputed hashes and Merkle proofs |
| `POST /chain/seal` | Seal the mempool now |
| `GET /chain/verify` | Full chain verification |
| `GET /batches`, `GET /batches/{id}/trail` | Batch list (`flagged_only`); farm-to-retail hop list |
| `GET /stats/summary`, `/stats/timeseries`, `/stats/fraud-by-type`, `/stats/risk-heatmap`, `/stats/stages` | Dashboard data |
| `GET /participants`, `GET /participants/{id}` | Trust scores and radar dimensions |
| `GET /network` | Trade graph nodes/edges + `networkx` cycles (length ≤ 5) |
| `GET /model/report` | `metrics.json` |
| `POST /sim/step` | `{n, inject?}`: generate and process live transactions |
| `GET /sim/example?type=` | A realistic example for the Check form (generated on a copy; live state untouched) |
| `GET /sim/meta` | Crops, stages, regions, fraud types, participants |
| `POST /dev/tamper`, `POST /dev/reset` | Demo only (`DEMO_MODE=true`) |

---

## 8. Frontend pages (`frontend/src/pages`)

| Route | Page | What it shows |
|---|---|---|
| `/` | Dashboard | Value screened (₹ Cr), decision mix, 4 KPI tiles (incl. caught/injected ground truth), transactions-over-time stacked area (2 h / 48 h), live risk stream with threshold lines, fraud-by-type bars, region × crop risk heatmap, ledger mini-chain + Verify, transaction history, stage breakdown |
| `/check` | Check a transaction | Example loaders for legit + 6 fraud types, editable form, risk "sun" gauge, rule reasons, SHAP bars, score breakdown, Submit to pipeline |
| `/quarantine` | Quarantine | Open queue sorted by risk, full explanation, type probabilities, Approve/Reject with note, reviewed history with block links |
| `/ledger` | Ledger | Scrollable block chain (per-record status bars), Verify banner, attack simulation (3 tamper modes + reset), block detail with stored vs recomputed hashes and an in-browser Merkle tree |
| `/trace` | Batch trace | Batch list (flagged / all), journey graphic Farmer→Retailer with ↺ for loops, timeline of hops with reasons, quantity-per-hop bars |
| `/network` | Trade network | Layered flow graph (5 role columns; backward red arcs = circular trades), trust colouring, detected cycles, participant trust radar + list |
| `/model` | Model insights | Headline metrics (held-out vs shifted), ablation, threshold explorer (precision/recall + score histograms), ROC/PR, per-type recall, confusion matrix, feature importance, dataset + caveat |

Shared pieces: `Layout` (pill navigation, simulator toggle, speed, Inject fraud menu, quarantine bell, toasts),
`TxDrawer` (slide-over detail), `RiskSun` (sunburst gauge), `Explain` (rules, SHAP, breakdown), `charts`
(tooltip, legend, heatmap), `state/AppState` (simulator loop + toasts).

**Visual design:** matches `docs/ui-references/reference-dark-gold.png`, with near-black surfaces, 28 px rounded cards,
and gold `#E8C15A`. Status colours `#27936A` clear / `#C08716` flagged / `#C43B44` quarantined were validated for
colour-blind separation on the dark surface. Every badge pairs colour with an icon and a label.

---

## 9. Repository layout

```
agrichain/
├── run.bat                  Windows launcher (menu: start, setup, stop, reset, retrain, tests)
├── run.sh                   macOS/Linux launcher
├── README.md                How to run + demo script + viva FAQ
├── Project-Map.md           This file
├── DESIGN.md                Design, scope (MVP/V1/Later/Cut), milestones, risks
├── CLAUDE.md                Rules for AI coding agents
├── docs/
│   ├── ui-references/       UI style reference image
│   └── screenshots/         Dashboard, Check, Ledger-tamper screenshots
├── backend/
│   ├── requirements.txt     Runtime deps (pip install -r)
│   ├── requirements-dev.txt + pytest, httpx, ruff
│   ├── pyproject.toml       Package metadata, ruff + pytest config
│   ├── .env.example         DEMO_MODE, POW_DIFFICULTY, BLOCK_SIZE, thresholds, CORS
│   ├── app/
│   │   ├── main.py          FastAPI app, CORS, routers, startup seeding
│   │   ├── config.py        Settings from env (paths are Windows-safe)
│   │   ├── db.py            Engine (SQLite WAL), init/reset
│   │   ├── models.py        7 SQLModel tables
│   │   ├── schemas.py       Request bodies
│   │   ├── services.py      assess → ingest → review pipeline
│   │   ├── views.py         Response shaping
│   │   ├── chain/ledger.py  Hashing, Merkle, PoW, seal, verify
│   │   ├── ml/              features.py, rules.py, scorer.py, explain.py, dataset.py
│   │   ├── sim/             generator.py (simulator), state.py (live sim + demo seeding)
│   │   └── routers/         transactions, quarantine, chain, batches, stats, sim, model, network, dev
│   ├── scripts/             generate_dataset.py, train_model.py, seed_demo.py
│   ├── artifacts/           model.joblib (2.8 MB), metrics.json   ← committed
│   └── tests/               test_ledger.py, test_ml.py, test_api.py (21 tests)
└── frontend/
    ├── package.json, vite.config.ts, tsconfig.json, index.html
    └── src/
        ├── main.tsx, App.tsx, index.css (theme tokens)
        ├── api/             client.ts, hooks.ts, types.ts
        ├── components/      Layout, TxDrawer, RiskSun, Explain, charts, ui
        ├── pages/           Dashboard, Check, Quarantine, Ledger, Trace, Network, Model
        ├── state/           AppState.tsx (simulator + toasts)
        ├── lib/             format.ts, tokens.ts
        └── test/            components.test.tsx (9 tests)
```

---

## 10. Configuration (`backend/.env`)

| Variable | Default | Meaning |
|---|---|---|
| `DEMO_MODE` | `true` | Enables `/api/dev/tamper` and `/api/dev/reset` |
| `DB_URL` | `sqlite:///<backend>/data/app.db` | Database location |
| `POW_DIFFICULTY` | `3` | Leading hex zeros required in block hashes |
| `BLOCK_SIZE` | `5` | Records per block |
| `FLAG_THRESHOLD` | `0.40` | Risk at which a transaction is flagged |
| `QUARANTINE_THRESHOLD` | `0.70` | Risk at which a transaction is held for review |
| `CORS_ORIGINS` | `http://localhost:5173,…` | Allowed browser origins |

---

## 11. Quality

| Area | What exists |
|---|---|
| Backend tests (21) | Merkle root/proof, PoW, tamper detection for data / verdict / header, every rule, honest-disclosure negative case, simulator determinism, injected-fraud detection, **feature parity DB vs in-memory**, API flows (dry run doesn't persist, 422 validation, quarantine → reject → sealed → 409 on re-review, blocks fill, every dashboard endpoint, batch trail, tamper → reset) |
| Frontend tests (9) | Risk gauge labels and thresholds, status badge text, rule ordering, SHAP signs, ₹/kg/hash formatters, decision mapping |
| Static checks | ruff (lint + format), TypeScript strict, Prettier |
| End-to-end | The README demo script run in a headless browser: Check → simulator + injection → Quarantine reject → Ledger verify → tamper → verify fails → reset → verify passes |
| Performance | ~50–75 ms per scored transaction incl. SHAP; seeding 300 tx + 60 blocks ≈ 5 s; full chain verify ≪ 1 s |

---

## 12. Glossary

| Term | Meaning here |
|---|---|
| Mempool | Transactions accepted but not yet sealed into a block |
| Seal / mine | Build a block from mempool entries and find a nonce meeting the PoW target |
| Quarantine | Held off-chain because risk ≥ 0.70; needs an auditor decision |
| Verdict | The auditor's APPROVED/REJECTED decision; part of the on-chain hash |
| Reference price | Simulated daily mandi price for a crop at a stage |
| Shifted test set | Second test set where fraud is subtler and distributions wider — measures robustness |
| Ground truth | `sim_label` — what the simulator actually injected (shown as "caught X / Y injected") |
