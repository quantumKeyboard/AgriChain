# AgriChain Sentinel

**ML-Driven Blockchain Framework for Detection of Fraudulent Supply-Chain Transactions — agriculture edition.**

Every transaction in a farm → cooperative → processor → distributor → retailer chain is scored by a hybrid ML engine
*before* it can be written to a tamper-evident blockchain ledger. Clean transactions are sealed into blocks; suspicious
ones are quarantined for an auditor, whose verdict is then sealed permanently. Anyone can re-verify the whole chain and
see exactly where history was altered.

![UI style reference](docs/ui-references/reference-dark-gold.png)

## Run it

Requirements: **Python 3.11–3.13** and **Node.js 20+** (LTS).

### Windows

1. Install [Python 3.12](https://www.python.org/downloads/) (tick **"Add python.exe to PATH"**) and the [Node.js LTS](https://nodejs.org/).
2. Unzip the project, e.g. to `C:\dev\agrichain`.
3. **Double-click `run.bat`.** A menu opens:

```
   [1]  Start the app        (API + UI, opens browser)
   [2]  Setup / repair       (install everything)
   [3]  Open app in browser
   [4]  Stop the app
   [5]  Start API only       [6]  Start UI only
   [7]  Reset demo data      [8]  Retrain the ML model
   [9]  Run tests            [0]  Exit
```

Press **2** once (first time only, a few minutes), then **1** whenever you want to run it. The header shows which Python
it found and whether setup is complete. `run.bat` is plain `cmd`: it needs no PowerShell and never upgrades pip. If
virtual environments are blocked on your PC, it installs the packages into your user Python (`pip install --user`) instead.

Manual alternative (Command Prompt):

```bat
cd backend
py -3.12 -m pip install --user -r requirements-dev.txt
copy .env.example .env
py -3.12 -m uvicorn app.main:app --port 8000

rem second Command Prompt
cd frontend
npm install
npm run dev
```

### macOS / Linux

```bash
./run.sh            # first run installs everything; then UI → http://localhost:5173, API docs → http://localhost:8000/docs
```

Or manually:

```bash
# backend
cd backend
python -m venv .venv && source .venv/bin/activate && pip install -e ".[dev]"
cp .env.example .env
python scripts/generate_dataset.py      # 20k synthetic transactions + 5k shifted test set (~3 s)
python scripts/train_model.py           # trains RF + IsolationForest + LR baseline, writes artifacts/ (~5 s)
python scripts/seed_demo.py             # optional: re-seed demo history (the API also seeds an empty DB on start)
uvicorn app.main:app --reload --port 8000

# frontend (second terminal)
cd frontend && npm install && npm run dev
```

The trained model (`backend/artifacts/model.joblib`) and its metrics are committed, so the demo works without retraining.
If your scikit-learn differs and the model can't load, setup (`run.bat` → 2, or `run.sh`) retrains automatically (~10 s), or run
`python scripts/generate_dataset.py` then `python scripts/train_model.py` from `backend/`.

**Troubleshooting:** *port already in use* → `run.bat` → **4** (Stop the app).
*`npm` not recognised* → reopen the terminal after installing Node. *Blank page* → make sure the API window shows
`Application startup complete`.

## The 5-minute demo

1. **Dashboard**: flip the **Simulator** toggle in the top bar. Transactions stream in, blocks get mined, and the charts update live.
2. Click **Inject fraud → Phantom quantity** (or any of the 6 types). A red toast appears and the bell counter goes up.
3. **Quarantine**: the item shows a risk "sun" gauge, the rule that fired (*"Quantity is 2.2× what the seller actually received"*), SHAP bars and the fraud-type probabilities. Add a note and **Reject**. The verdict is mined into a block.
4. **Ledger**: **Verify chain** shows green. Then **Flip a REJECTED fraud verdict** (an insider attack). Verify turns red, names the exact block and transaction, and the in-browser Merkle tree turns red. **Reset demo data** restores everything.
5. **Trace**: pick a batch with a *Circular trading* flag. The journey shows goods returning to an earlier holder (↺).
6. **Network**: the red backward arc is the trading ring; `networkx` lists the detected cycles. Participant trust scores sit alongside.
7. **Model**: the ablation (rules vs RF vs hybrid), the threshold slider, ROC/PR curves, the confusion matrix and per-type recall on a shifted test set.

**Check** lets you load a realistic example of any fraud type, edit any field (price, temperature, organic certificate…),
re-score it instantly, and submit it to the pipeline.

## How it works

```
React UI ──REST──▶ FastAPI ──▶ features.py ─▶ rules.py (7 named rules)
                         │                 ├▶ Random Forest (type + P(fraud)) ─┐
                         │                 └▶ Isolation Forest (anomaly)  ─────┤ risk = .60·ML + .25·rules + .15·anomaly
                         │                                                     ▼
                         │                  CLEAR (<0.40) → mempool · FLAGGED (<0.70) → mempool with flag · QUARANTINED → auditor
                         └──▶ ledger.py: SHA-256 tx hashes → Merkle root → PoW block (difficulty 3) → SQLite
```

| Fraud type | What the simulator does | Main signal |
|---|---|---|
| Price manipulation | price 35–120% off the mandi reference | `PRICE_BAND`, price deviation |
| Phantom quantity | sells more than the farm can grow / seller received | `YIELD_IMPOSSIBLE`, qty vs capacity |
| Organic label fraud | sold as organic without a valid certificate | `ORGANIC_UNCERTIFIED` |
| Concealed cold-chain breach | perishable over its temperature limit but declared "cold chain OK" | `COLD_CHAIN` |
| Circular trading | batch sold back to an earlier holder (A→B→C→A) | `CIRCULAR`, graph cycles |
| Duplicate invoice | identical invoice resubmitted | `DUPLICATE` |

Model results (held-out / shifted test): PR-AUC 0.958 / 0.939, F1 0.964 / 0.907. The data is synthetic, so these are
optimistic. The simulator adds legitimate outliers, overlapping distributions and label noise, and the shifted set makes
fraud subtler. The Model page states this caveat.

## Viva FAQ

**Is this a real blockchain?** It implements the parts of a blockchain that make it tamper-evident: SHA-256 hashing of
each transaction record, a Merkle root per block, previous-hash links, proof-of-work, and full re-verification. It is
**single-node**: there is no peer-to-peer network or multi-party consensus. That was a deliberate scope decision for a
course project (see `DESIGN.md` §3). Anchoring block hashes on a local Ethereum (Hardhat) chain is listed as the next step.

**Why not a pretrained Hugging Face model?** No pretrained model exists for tabular agri-transaction fraud. Training on
our own simulator gives labelled examples of *each* fraud type, which powers both the type prediction and per-type evaluation.

**Why a hybrid?** Rules are precise and explainable for known patterns. The Random Forest generalises across noisy
combinations of features. The Isolation Forest flags transactions that are just *unusual*. The ablation chart shows each alone vs combined.

**Why does the verdict go on-chain and not just the transaction?** The transaction hash includes its final ledger status.
So "quietly un-rejecting" a fraud is just as detectable as editing the quantity.

**How are explanations produced?** Rule reasons are deterministic templates. Model reasons are SHAP TreeExplainer
contributions toward "fraud", computed per transaction in about 50 ms.

## Tests

```bash
cd backend && pytest -q && ruff check .        # 21 tests: ledger tamper cases, every rule, feature parity, API flows
cd frontend && npm test && npm run typecheck && npm run lint && npm run build
```

## Layout

See **`Project-Map.md`** (complete technical overview), `DESIGN.md` (design, scope and reasoning) and `CLAUDE.md` (agent instructions).
