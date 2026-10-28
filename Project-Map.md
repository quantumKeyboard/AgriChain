# Project Map — AgriChain Sentinel

**ML-Driven Blockchain Framework for Detection of Fraudulent Supply-Chain Transactions (agriculture).**

This file is the technical map of the whole project: what it does, what it is built with, how the pieces fit, where each
thing lives, and the exact numbers behind it. For the design rationale and scope decisions, see `DESIGN.md`. For how to
run it, see `README.md`. For agent/coding rules, see `CLAUDE.md`.

---

## 1. What the project does (one paragraph)

Agricultural produce moves through a chain of hands: **Farmer → Cooperative → Processor → Distributor → Retailer**.
Every hand-over is a *transaction*. AgriChain Sentinel scores each transaction for fraud and records it, with its
verdict, in an **Ethereum smart contract** (`AgriChainLedger.sol`, Solidity, running on a local Hardhat node). A hybrid
engine (Random Forest + Isolation Forest + 7 business rules) produces a 0–1 risk score and an explanation. Each seller
signs its invoice with its own Ethereum key (**EIP-712**); the ML oracle account submits it to the contract, which
verifies that signature, stores the keccak256 hash of the invoice plus the risk, fraud type and status, and never lets
a record be overwritten. Low-risk transactions are recorded as *Committed*, medium-risk ones as *Flagged*, high-risk
ones as *PendingReview* until the auditor account resolves them on-chain (exactly once). The full invoice data lives in
SQLite; **Verify** re-reads every record from the contract and pinpoints any database edit. Forged invoices never reach
the chain — the contract would revert them. Auditor verdicts feed a **learning loop** that retrains the model in place.
A React dashboard visualises all of it, and a built-in simulator streams realistic traffic and can inject six kinds of
agricultural fraud plus identity spoofing on demand.

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
| web3.py (+ eth-account, eth-abi) | 8.0 / 0.14 | JSON-RPC client for the Ethereum node: deploy, signed raw transactions, calls, event logs; EIP-712 signing and recovery (`app/chain/`) |
| eth-tester + py-evm (dev only) | 0.14 / 0.12 | In-process EVM so backend tests run the real contract bytecode without a node |
| pytest / httpx / ruff | 9.1 / — / 0.17 | Tests, FastAPI TestClient, lint + format |

### Blockchain — `blockchain/` (Node.js)

| Tool | Version | Used for |
|---|---|---|
| Solidity | 0.8.28 (optimizer 200 runs, EVM `cancun`) | `contracts/AgriChainLedger.sol` |
| Hardhat | 2.29 | Local Ethereum node (`npm run node`, chain id 31337, JSON-RPC on :8545, automine), compile, contract tests, deploy script |
| solc (npm, soljson) | 0.8.28 | Compiler used by Hardhat — bundled, so compiling works offline / on networks that block binaries.soliditylang.org |
| OpenZeppelin Contracts | 5.4 | `AccessControl` (roles), `EIP712` (typed-data domain), `ECDSA` (signature recovery) |
| ethers + hardhat-chai-matchers | 6.17 / 2.1 | Contract tests (`test/AgriChainLedger.test.js`) |

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
| Google Fonts | — | Manrope (UI), JetBrains Mono (hashes/IDs) |

### Not used, on purpose

No public-network deployment (the contract runs on a local node; Sepolia is optional), no browser wallet / MetaMask,
no message queue, no WebSockets (the UI refetches after each action), no user accounts, no deep learning, no LLM
calls, no pretrained Hugging Face model. Reasons are in `DESIGN.md` §3.

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
│      ├─ risk < 0.40  → CLEAR        → on-chain status Committed                     │
│      ├─ 0.40–0.70    → FLAGGED      → on-chain status Flagged                       │
│      └─ ≥ 0.70       → QUARANTINED  → PendingReview → auditor resolve() →           │
│                                       Approved / Rejected                           │
│                                                                                     │
│  chain/identity.py  participant Ethereum accounts, EIP-712 invoice sign / recover    │
│  chain/ethereum.py  web3 client: deploy, recordTransaction(s), resolve, reads,       │
│                     custom-error decoding, explorer helpers                         │
│  routers/chain.py   /verify re-reads every record from the contract vs. SQLite       │
│  sim/generator.py   participants, batches, transactions, 6 fraud injectors          │
└───────────────┬───────────────────────────────────────────────┬────────────────────┘
                ▼                                               ▼ JSON-RPC (:8545)
   SQLite backend/data/app.db (7 tables)        Ethereum node — Hardhat, chain id 31337
   full invoice data, explanations,             AgriChainLedger.sol (write-once records,
   off-chain mirror of on-chain status          roles, EIP-712 signature check, events)
```

**Offline pipeline (training):**
`scripts/generate_dataset.py` → simulator → `artifacts/data/*.csv` → `scripts/train_model.py` →
`artifacts/model.joblib` + `artifacts/metrics.json` (shown on the Model page).

---

## 4. The blockchain layer (`blockchain/` + `backend/app/chain/`)

### 4.1 The smart contract — `blockchain/contracts/AgriChainLedger.sol`

| Concept | Implementation |
|---|---|
| Roles (OpenZeppelin `AccessControl`) | `DEFAULT_ADMIN_ROLE` + `REGISTRAR_ROLE` → admin (deploys, registers participants) · `ORACLE_ROLE` → the ML engine (records transactions) · `AUDITOR_ROLE` → the auditor (resolves reviews). Any other caller reverts with `AccessControlUnauthorizedAccount(account, neededRole)`. |
| Participants | `registerParticipants(address[], bytes32[] ids, Role[])` — Farmer, Cooperative, Processor, Distributor, Retailer. Unknown seller/buyer → `UnknownParticipant`. |
| Invoice (EIP-712) | `Invoice(bytes32 txId, bytes32 batchId, address seller, address buyer, bytes32 dataHash)` in domain `AgriChainLedger` v1, chainId, contract address. `dataHash` = keccak256 of the canonical JSON of the 21 invoice fields (`SIGNED_FIELDS`). |
| Recording | `recordTransaction(invoice, sellerSignature, Assessment{riskBps, decision, fraudType, modelVersion})` (oracle only); `recordTransactions(...)` for bulk import (seeding records 25 per Ethereum transaction). The contract recovers the signer with `ECDSA.tryRecover` → `InvalidSellerSignature(expectedSeller, recoveredSigner)` unless it is the seller. |
| Statuses | Decision → status: Clear → `Committed`, Flagged → `Flagged`, Quarantined → `PendingReview`; then `Approved` / `Rejected`. |
| Write-once | An existing txId → `RecordExists`. There is no update or delete function. |
| Verdicts | `resolve(txId, approve, noteHash)` (auditor only), once, only from `PendingReview` → otherwise `NotPendingReview(txId, status)` / `RecordNotFound`. Stores auditor address + keccak256 of the note. |
| Stored per record | batchId, seller, buyer, dataHash, riskBps (0–10000), fraudType (0 none, 1–6 = `FRAUD_TYPES` order), status, modelVersion, recordedAt, recordedBlock, auditor, verdictNoteHash |
| Events | `ParticipantRegistered`, `TransactionRecorded(txId, batchId, seller, buyer, dataHash, riskBps, status, fraudType)`, `VerdictRecorded(txId, status, auditor, noteHash)` |
| Views | `getRecord`, `getRecords(bytes32[])`, `recordCount`, `recordIdAt`, `batchTrail(batchId)` (provenance order), `verifyRecord(txId, dataHash)`, `invoiceDigest(invoice)` |
| Tests | `blockchain/test/AgriChainLedger.test.js` — 10 tests (Hardhat + ethers + chai matchers) |
| ABI | `npm run compile` writes `blockchain/deployments/AgriChainLedger.json` (ABI + bytecode, committed); the backend deploys from it, so Python needs no Node toolchain at runtime. |

### 4.2 The backend side

| Piece | Implementation |
|---|---|
| Node | `CHAIN_RPC_URL` (default `http://127.0.0.1:8545`, the Hardhat node started by the launcher with `npm run node`). |
| Accounts | Admin / oracle / auditor keys from env (`ADMIN_PRIVATE_KEY`, `ORACLE_PRIVATE_KEY`, `AUDITOR_PRIVATE_KEY`); defaults are Hardhat's public dev accounts #0–#2 (local only). Transactions are built, signed locally and sent raw, so the same code works on a testnet. |
| Participant keys | `identity.account(id)` = key derived from `KEY_SEED` + participant id (*demo custody*, so the simulator can sign for everyone; in production each participant signs in its own wallet). |
| Deploy + seed | On startup the API attaches to the contract stored in `appmeta` (`contract_address`, `deploy_block`, `chain_id`). If it is missing (fresh DB, or the Hardhat node was restarted and its state is gone) it deploys a new contract, registers the 42 participants and records the demo history. A middleware re-checks this per request, so restarting the node while the API runs recovers automatically. |
| Ingest | `services.ingest` → assess → `chain.record(...)` (oracle) → store the DB rows + `LedgerEntry` (status, record tx hash, block). An invalid seller signature is never sent; the transaction is hard-quarantined off-chain (rule `SIGNATURE_INVALID`). Approving such a forgery tries the contract and fails with `InvalidSellerSignature` (HTTP 409). |
| Verdicts | `services.review` → `chain.resolve(...)` (auditor) → `LedgerEntry` status + verdict tx hash/block. |
| Verify | `GET /api/chain/verify` reads every `TransactionRecorded` log and record from the contract and compares with SQLite: `DATA_MISMATCH` (invoice edited → hash differs), `BAD_SIGNATURE`, `STATUS_MISMATCH` (verdict edited), `MISSING_OFF_CHAIN` (row deleted), `NOT_ON_CHAIN` (fake mirror row). |
| Explorer | `GET /api/chain/info`, `/chain/blocks`, `/chain/blocks/{n}` read blocks and receipts from the node and decode calls/events with the ABI. |
| Errors | Reverts are decoded into the contract's custom errors (`ChainRevert` → HTTP 409); node down → HTTP 503 with a hint. |
| Attack demo (`DEMO_MODE` only) | `POST /api/dev/attack {kind}`: `db_quantity`, `db_verdict` (edit SQLite → Verify detects) and `chain_overwrite` → `RecordExists`, `chain_unauthorized` (a seller resolves its own rejected invoice) → `AccessControlUnauthorizedAccount`, `chain_reverdict` → `NotPendingReview`, `chain_forged` → `InvalidSellerSignature`. On-chain attacks are really sent and mined with status 0. `POST /api/dev/reset` deploys a fresh contract and re-seeds. |

Scope note: one local node with one validator (Hardhat automine: one block per transaction, free test ETH). The
contract and backend are network-agnostic: `npm run deploy` with `SEPOLIA_RPC_URL` + `DEPLOYER_PRIVATE_KEY`, then point
`CHAIN_RPC_URL` and the three keys at it.

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

### 5.6 Learning loop (`app/ml/feedback.py`, `app/ml/training.py`, `POST /api/model/retrain`)

| Step | What happens |
|---|---|
| Label | Every auditor verdict becomes a label: **Approved → `none`** (a false alarm), **Rejected → the fraud type the model suspected**. Forged-signature rejections are skipped (cryptography catches those, not the model). |
| Train | Labels are added to the **training split only**, weight ×5, using the stored 21-feature vector from `assessment.features`. Test and shifted sets are unchanged, so before/after metrics are comparable. |
| Swap | The new `model.joblib` / `metrics.json` are written, the model and SHAP caches are cleared, and live scoring uses the new version immediately. Past assessments keep the `model_version` that made them. |
| Track | Every version is appended to `artifacts/history.json` (PR-AUC, F1, shifted F1, labels used) and charted on the Model page. |

Retraining takes ~6–10 s. With ~20 labels next to 15,000 synthetic rows the metrics move only slightly — the UI says so.

### 5.7 Explainability

- **Rules:** each hit carries a human sentence, e.g. *"Quantity 30,758 kg is 2.2× the quantity the seller actually received for this batch."*
- **SHAP:** `TreeExplainer` on the Random Forest. Contribution toward fraud = −(SHAP value of the `none` class). The top 6 features are shown as diverging bars.
- **Score breakdown:** the three hybrid components and their weights.
- **Type probabilities:** the RF probability for each of the six fraud types (Quarantine page).

---

## 6. Database (SQLite, `backend/app/models.py`, 7 tables — the off-chain side)

| Table | Key columns |
|---|---|
| `participant` | id (`F-001`…), name, role, region, registered_on, land_acres, capacity_tons, address (Ethereum, registered in the contract) |
| `batch` | id (`B-XXXXXXXX`), crop, origin_farmer_id, harvest_date, organic_claimed, organic_cert_valid, region |
| `transaction` | id (`TX-XXXXXXXX`), batch_id, crop, stage, seller_id, buyer_id, timestamp, quantity_kg, unit_price, total_value, ref_price, quality_grade, moisture_pct, organic flags, transit_km/hours, temp_avg/max_c, cold_chain_ok_claimed, payment_mode, signature (seller's EIP-712 signature, 0x-hex), sim_label (ground truth, never used for scoring) |
| `assessment` | tx_id, risk, p_fraud, rule_score, anomaly_score, pred_type, decision, rule_hits (JSON), type_probs (JSON), shap_top (JSON), features (JSON), model_version |
| `review` | tx_id, action (APPROVED/REJECTED), note, reviewed_at |
| `ledgerentry` | Off-chain mirror of the on-chain record: tx_id, status, record_tx_hash, record_block, verdict_tx_hash, verdict_block |
| `appmeta` | key/value — `schema_version` ("3"), `contract_address`, `deploy_tx`, `deploy_block`, `chain_id`. An older local DB is detected at startup and re-seeded instead of crashing. |

On first start (or when the contract is gone), the API deploys the contract and seeds 300 transactions over the last
~45 hours (8 % fraud): 298 recorded on-chain in 12 bulk transactions, plus 2 identity-spoofing attempts kept off-chain;
reviewed verdicts are sent with `resolve()` (~35 Ethereum blocks, ~7 s on a Hardhat node). All but 4 quarantined items are already reviewed, so the queue has
something to show and the learning loop has labels to use.

---

## 7. REST API (all under `/api`; interactive docs at `http://localhost:8000/docs`)

| Method & path | Purpose |
|---|---|
| `GET /health` | Status, model version, thresholds, demo mode |
| `POST /transactions/score` | Dry run: score without saving (`forge_signature: true` signs as someone else) |
| `POST /transactions` | Score + record on-chain (`on_chain: {tx_hash, block, gas_used}`; `null` for a forged signature) |
| `GET /transactions` | List; filters `decision`, `pred_type`, `batch_id`, `ledger_status`, `limit` |
| `GET /transactions/{id}` | Full detail incl. SHAP, rules, ledger status, Ethereum block + tx hash, dataHash, signature check |
| `GET /quarantine` | Open items (with explanations) + recently reviewed |
| `POST /quarantine/{id}/decision` | `{action: approve\|reject, note}`; sends `resolve()` on-chain |
| `GET /chain/info` | Network, chain id, node client, contract address, deploy tx, record count, role accounts + balances |
| `GET /chain/blocks`, `GET /chain/blocks/{n}` | Ethereum blocks from the node; detail with roots, gas, decoded calls/events, and the supply-chain records touched |
| `GET /chain/records/{tx_id}` | The contract's record next to the off-chain hash |
| `GET /chain/verify` | Every on-chain record vs. the database (see §4.2) |
| `GET /batches`, `GET /batches/{id}/trail` | Batch list (`flagged_only`); farm-to-retail hop list |
| `GET /stats/summary`, `/stats/timeseries`, `/stats/fraud-by-type`, `/stats/risk-heatmap`, `/stats/stages` | Dashboard data |
| `GET /participants`, `GET /participants/{id}` | Trust scores and radar dimensions |
| `GET /network` | Trade graph nodes/edges + `networkx` cycles (length ≤ 5) |
| `GET /model/report` | `metrics.json` |
| `GET /model/feedback` | Auditor verdicts available as training labels |
| `POST /model/retrain` | Learning loop: retrain with feedback, hot-swap the model, return before/after metrics |
| `GET /model/history` | All model versions with their metrics |
| `GET /export/transactions.csv`, `/export/audit.csv`, `/export/chain.csv` | CSV downloads (UTF-8 with BOM for Excel); `chain.csv` = every on-chain record, read live from the contract |
| `POST /sim/step` | `{n, inject?}`: generate and process live transactions; `inject` = any of the 6 fraud types or `forged_signature` |
| `GET /sim/example?type=` | A realistic example for the Check form (generated on a copy; live state untouched) |
| `GET /sim/meta` | Crops, stages, regions, fraud types, participants |
| `POST /dev/attack`, `POST /dev/reset` | Demo only (`DEMO_MODE=true`) |

---

## 8. Frontend pages (`frontend/src/pages`)

| Route | Page | What it shows |
|---|---|---|
| `/` | Dashboard | Value screened (₹ Cr), decision mix, 4 KPI tiles (incl. caught/injected ground truth), transactions-over-time stacked area (2 h / 48 h), live risk stream with threshold lines, fraud-by-type bars, region × crop risk heatmap, latest Ethereum blocks + Verify, transaction history, stage breakdown, **Export CSV** |
| `/check` | Check a transaction | Example loaders for legit + 6 fraud types + forged signature, editable form (incl. "Forge signature"), risk "sun" gauge, rule reasons, SHAP bars, score breakdown, Submit to pipeline |
| `/quarantine` | Quarantine | Open queue sorted by risk, full explanation incl. signature status, type probabilities, Approve/Reject with note (an on-chain `resolve()`; also saved as a training label), reviewed history with links to the verdict's Ethereum block, **Export audit trail (CSV)** |
| `/ledger` | Ledger | Contract card (address, chain id, client, height, records, role accounts + ETH), **Verify against chain** banner listing each mismatch, Ethereum block strip (red = reverted tx), block detail (hash, parent, state/tx/receipt roots, gas), decoded contract calls + events, records touched, attack simulation (2 off-chain + 4 on-chain attacks with the decoded revert reason) + reset (redeploy), CSV export |
| `/trace` | Batch trace | Batch list (flagged / all), journey graphic Farmer→Retailer with ↺ for loops, timeline of hops with reasons, quantity-per-hop bars |
| `/network` | Trade network | Layered flow graph (5 role columns; backward red arcs = circular trades), trust colouring, detected cycles, participant trust radar + list |
| `/model` | Model insights | Headline metrics (held-out vs shifted), **learning loop** (labels available, Retrain, before/after table, version trend), ablation, threshold explorer (precision/recall + score histograms), ROC/PR, per-type recall, confusion matrix, feature importance, dataset + caveat |

Shared pieces: `Layout` (pill navigation, simulator toggle, speed, Inject fraud menu, quarantine bell, toasts),
`TxDrawer` (slide-over detail incl. Ethereum block/tx, dataHash and signature status), `LearningLoop`, `RiskSun` (sunburst gauge), `Explain` (rules, SHAP, breakdown), `charts`
(tooltip, legend, heatmap), `state/AppState` (simulator loop + toasts).

**Visual design:** matches `docs/ui-references/reference-dark-gold.png`, with near-black surfaces, 28 px rounded cards,
and gold `#E8C15A`. Status colours `#27936A` clear / `#C08716` flagged / `#C43B44` quarantined were validated for
colour-blind separation on the dark surface. Every badge pairs colour with an icon and a label.

---

## 9. Repository layout

```
agrichain/
├── run.bat                  Windows launcher (menu: start, setup, stop, reset, retrain, tests)
├── run.sh                   macOS/Linux launcher (same menu; node/API/UI in background, logs in .run/)
├── run.command              macOS: double-click in Finder → runs run.sh
├── README.md                How to run + demo script + viva FAQ
├── Project-Map.md           This file
├── DESIGN.md                Design, scope (MVP/V1/Later/Cut), milestones, risks
├── CLAUDE.md                Rules for AI coding agents
├── docs/
│   ├── ui-references/       UI style reference image
│   └── screenshots/         Dashboard, Check, Ledger (on-chain attack, database tamper), Model
├── blockchain/              Hardhat project
│   ├── contracts/AgriChainLedger.sol   The smart contract
│   ├── test/AgriChainLedger.test.js    10 contract tests
│   ├── scripts/             export-abi.js (ABI → deployments/), deploy.js (manual / Sepolia deploy)
│   ├── deployments/         AgriChainLedger.json (ABI + bytecode, committed; used by the backend)
│   └── hardhat.config.js    Solidity 0.8.28 via bundled solc; networks: hardhat, localhost, optional sepolia
├── backend/
│   ├── requirements.txt     Runtime deps (pip install -r)
│   ├── requirements-dev.txt + pytest, httpx, ruff, eth-tester[py-evm]
│   ├── pyproject.toml       Package metadata, ruff + pytest config
│   ├── .env.example         DEMO_MODE, thresholds, CORS, CHAIN_RPC_URL, optional account keys
│   ├── app/
│   │   ├── main.py          FastAPI app, CORS, routers, startup: connect node → attach or deploy + seed
│   │   ├── config.py        Settings from env (paths are Windows-safe)
│   │   ├── db.py            Engine (SQLite WAL), init/reset
│   │   ├── models.py        7 SQLModel tables
│   │   ├── schemas.py       Request bodies
│   │   ├── services.py      assess → ingest (record on-chain) → review (resolve on-chain)
│   │   ├── views.py         Response shaping
│   │   ├── chain/ethereum.py web3 client for AgriChainLedger (deploy, record, resolve, reads, errors)
│   │   ├── chain/identity.py participant accounts, keccak dataHash, EIP-712 sign / recover
│   │   ├── ml/              features.py, rules.py, scorer.py, explain.py, dataset.py,
│   │   │                    training.py (shared training pipeline), feedback.py (verdicts → labels)
│   │   ├── sim/             generator.py (simulator), state.py (live sim + demo seeding)
│   │   └── routers/         transactions, quarantine, chain, batches, stats, sim, model, network, export, dev
│   ├── scripts/             generate_dataset.py, train_model.py, seed_demo.py
│   ├── artifacts/           model.joblib (2.8 MB), metrics.json ← committed; history.json after a retrain
│   └── tests/               test_chain.py, test_ml.py, test_api.py, test_identity_and_loop.py (35 tests)
└── frontend/
    ├── package.json, vite.config.ts, tsconfig.json, index.html
    └── src/
        ├── main.tsx, App.tsx, index.css (theme tokens)
        ├── api/             client.ts, hooks.ts, types.ts
        ├── components/      Layout, TxDrawer, RiskSun, Explain, LearningLoop, charts, ui
        ├── pages/           Dashboard, Check, Quarantine, Ledger, Trace, Network, Model
        ├── state/           AppState.tsx (simulator + toasts)
        ├── lib/             format.ts, tokens.ts
        └── test/            components.test.tsx (11 tests)
```

---

## 10. Configuration (`backend/.env`)

| Variable | Default | Meaning |
|---|---|---|
| `DEMO_MODE` | `true` | Enables `/api/dev/attack` and `/api/dev/reset` |
| `DB_URL` | `sqlite:///<backend>/data/app.db` | Database location |
| `FLAG_THRESHOLD` | `0.40` | Risk at which a transaction is flagged |
| `QUARANTINE_THRESHOLD` | `0.70` | Risk at which a transaction is held for review |
| `CORS_ORIGINS` | `http://localhost:5173,…` | Allowed browser origins |
| `KEY_SEED` | `agrichain-demo` | Seed for the participants' demo Ethereum keys (change it and re-seed for different keys) |
| `CHAIN_RPC_URL` | `http://127.0.0.1:8545` | Ethereum JSON-RPC endpoint (the local Hardhat node) |
| `ADMIN_PRIVATE_KEY` / `ORACLE_PRIVATE_KEY` / `AUDITOR_PRIVATE_KEY` | Hardhat dev accounts #0 / #1 / #2 | Accounts acting on the contract — set real, funded keys for a testnet; never use the defaults outside a local node |
| `ARTIFACTS_DIR` | `backend/artifacts` | Where the model, metrics and version history live (tests point it at a temp copy) |

---

## 11. Quality

| Area | What exists |
|---|---|
| Contract tests (10) | Records a seller-signed transaction; decision → status mapping; forged signer and altered data rejected (`InvalidSellerSignature`); no overwrite (`RecordExists`); only oracle records / only auditor resolves; exactly one verdict; resolve only from PendingReview; unregistered participants refused; batch recording keeps provenance order |
| Backend tests (35) | Run the **real contract bytecode on an in-process EVM** (eth-tester): seeded history verifies; contract storage matches the DB; data edit → `DATA_MISMATCH` + `BAD_SIGNATURE`; verdict edit → `STATUS_MISMATCH`; deleted row → `MISSING_OFF_CHAIN`; the 4 on-chain attacks revert with the right custom error and are mined with status 0; explorer decodes calls; Python EIP-712 digest == the contract's `invoiceDigest`; participants registered on-chain; forged invoice stays off-chain and can't be approved; live traffic recorded on-chain; reset deploys a new contract; CSV exports; retrain hot-swap; schema upgrade; every rule; simulator determinism; feature parity; API flows |
| Frontend tests (11) | Risk gauge labels and thresholds, status badge text, rule ordering, SHAP signs, signature status, ₹/kg/hash formatters, decision mapping |
| Static checks | ruff (lint + format), TypeScript strict, Prettier |
| End-to-end | Launcher start (Hardhat node + API + UI) → contract deployed and history recorded → Ledger: verify green → off-chain verdict flip detected → on-chain attacks reverted with their custom errors → node restart recovers automatically. Zero console errors. |
| Performance | ~70–120 ms per transaction incl. SHAP, signature check and the on-chain `recordTransaction` (~250k gas); deploy + seed 300 tx ≈ 7 s; verify (300 records read from the contract + signature checks) ≈ 0.2 s; retrain ≈ 6–10 s |

---

## 12. Glossary

| Term | Meaning here |
|---|---|
| Smart contract | `AgriChainLedger.sol`: code deployed at an Ethereum address; its records can only change through its functions |
| ML oracle | The backend account with `ORACLE_ROLE` that writes the model's assessment on-chain |
| Quarantine | Recorded on-chain as `PendingReview` because risk ≥ 0.70; needs an auditor decision |
| Verdict | The auditor's `resolve()` — APPROVED or REJECTED, once, from the auditor account |
| dataHash | keccak256 of the full invoice (canonical JSON); stored on-chain, the data itself stays off-chain |
| EIP-712 signature | The seller's signature over a typed `Invoice` struct; the contract recovers the signer and requires it to be the seller |
| Revert | The EVM rejecting a transaction (custom error such as `RecordExists`); it is still mined, with status 0, and changes nothing |
| Reference price | Simulated daily mandi price for a crop at a stage |
| Shifted test set | Second test set where fraud is subtler and distributions wider — measures robustness |
| Ground truth | `sim_label` — what the simulator actually injected (shown as "caught X / Y injected") |
| Learning loop | Auditor verdicts → training labels → retrain → hot-swapped model, tracked as model versions |
