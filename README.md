# AgriChain Sentinel

**ML-Driven Blockchain Framework for Detection of Fraudulent Supply-Chain Transactions — agriculture edition.**

Every transaction in a farm → cooperative → processor → distributor → retailer chain is scored by a hybrid ML engine
and then recorded by a **Solidity smart contract (`AgriChainLedger.sol`) on a real Ethereum node** (a local Hardhat
node, chain id 31337). Each seller signs its invoice with its own Ethereum key (EIP-712); the contract verifies that
signature, stores a keccak256 hash of the invoice, the ML risk score and the decision, and never lets a record be
overwritten. Suspicious transactions are recorded as *PendingReview*; an auditor account resolves them on-chain, exactly
once. The app re-reads every record from the contract to prove the off-chain database hasn't been altered.

![UI style reference](docs/ui-references/reference-dark-gold.png)

## Run it

Requirements: **Python 3.11–3.13** and **Node.js 20+** (LTS). Setup installs Hardhat and the Solidity compiler from
npm (no separate Ethereum install, no wallet, no real ETH: the local node funds its own test accounts).

### Windows

1. Install [Python 3.12](https://www.python.org/downloads/) (tick **"Add python.exe to PATH"**) and the [Node.js LTS](https://nodejs.org/).
2. Unzip the project, e.g. to `C:\dev\agrichain`.
3. **Double-click `run.bat`.** A menu opens:

```
   [1]  Start the app        (blockchain + API + UI)
   [2]  Setup / repair       (install everything)
   [3]  Open app in browser
   [4]  Stop the app
   [5]  Start blockchain + API   [6]  Start UI only
   [7]  Reset demo data      [8]  Retrain the ML model
   [9]  Run tests            [0]  Exit
```

Press **2** once (first time only, a few minutes), then **1** whenever you want to run it. Option 1 opens three windows:
**AgriChain Blockchain** (the Hardhat Ethereum node — you can watch every contract call being mined there),
**AgriChain API** and **AgriChain UI**. The header shows which Python
it found and whether setup is complete. `run.bat` is plain `cmd`: it needs no PowerShell and never upgrades pip. If
virtual environments are blocked on your PC, it installs the packages into your user Python (`pip install --user`) instead.

Manual alternative (Command Prompt):

```bat
cd blockchain
npm install
npm run node

rem second Command Prompt
cd backend
py -3.12 -m pip install --user -r requirements-dev.txt
copy .env.example .env
py -3.12 -m uvicorn app.main:app --port 8000

rem third Command Prompt
cd frontend
npm install
npm run dev
```

### macOS

1. Install [Python 3.12](https://www.python.org/downloads/macos/) (or `brew install python@3.12`) and the [Node.js LTS](https://nodejs.org/) (or `brew install node`).
2. Unzip the project.
3. **Double-click `run.command`** in Finder. The first time, macOS may say it's from an unidentified developer:
   right-click `run.command` → **Open** → **Open** (only needed once). If it says the file isn't executable,
   open Terminal in the folder and run `chmod +x run.sh run.command`.
4. The same menu as on Windows opens. Press **2** once for setup, then **1** to start. The browser opens http://localhost:5173.

The Ethereum node, API and UI run in the background, so closing the Terminal window doesn't stop them. Use **4** to
stop them and **L** to see their logs (`.run/chain.log`, `.run/api.log`, `.run/ui.log`).

### Linux (or macOS from Terminal)

```bash
./run.sh            # same menu; or: ./run.sh setup | ./run.sh start | ./run.sh stop
```

Or manually:

```bash
# Ethereum node (keep it running)
cd blockchain && npm install && npm run node      # http://127.0.0.1:8545, chain id 31337

# backend (second terminal)
cd backend
python -m venv .venv && source .venv/bin/activate && pip install -e ".[dev]"
cp .env.example .env
python scripts/generate_dataset.py      # 20k synthetic transactions + 5k shifted test set (~3 s)
python scripts/train_model.py           # trains RF + IsolationForest + LR baseline, writes artifacts/ (~5 s)
python scripts/seed_demo.py             # optional: deploy a fresh contract + re-seed (the API does this on start when needed)
uvicorn app.main:app --reload --port 8000

# frontend (third terminal)
cd frontend && npm install && npm run dev
```

The trained model (`backend/artifacts/model.joblib`) and its metrics are committed, so the demo works without retraining.
If your scikit-learn differs and the model can't load, setup (option **2** in `run.bat` / `run.command` / `run.sh`) retrains automatically (~10 s), or run
`python scripts/generate_dataset.py` then `python scripts/train_model.py` from `backend/`.

**Troubleshooting:** *`Read timed out` during setup* → slow/unstable internet; press **2** again (finished downloads are cached and it resumes), or try another network / hotspot. *port already in use* → launcher option **4** (Stop the app).
*`npm` not recognised* → reopen the terminal after installing Node. *Blank page* → make sure the API window shows
`Application startup complete`. *"Ethereum node not reachable"* → the Blockchain window/`npm run node` isn't running;
start it (option 1 or 5) — the API redeploys the contract and re-records the demo history automatically.

## The 5-minute demo

> Full presenter guide — setup checklist, what to click and say on every page, viva answers and troubleshooting: **[GUIDE.md](GUIDE.md)**.

1. **Dashboard**: flip the **Simulator** toggle in the top bar. Transactions stream in; every one is recorded on
   Ethereum by the ML oracle account (one block per transaction on the Hardhat node), and the charts update live.
2. Click **Inject fraud → Phantom quantity** (or any of the 6 types). A red toast appears and the bell counter goes up.
   Try **Forged signature** too: an invoice in a seller's name signed with someone else's key. The contract would reject
   it, so it never reaches the chain and waits in quarantine as evidence.
3. **Quarantine**: the item shows a risk "sun" gauge, the rule that fired (*"Quantity is 2.2× what the seller actually
   received"*), SHAP bars and the fraud-type probabilities. Add a note and **Reject**. The auditor account sends
   `resolve()` to the contract; the toast links to the Ethereum block.
4. **Ledger**: contract address, chain id, the three role accounts and their ETH balances, and a live block explorer
   (each block's hash, parent hash, state root, and the decoded contract calls and events). **Verify against chain**
   re-reads every record from the contract and compares it with the database.
   - *Off-chain attacks*: **Inflate a quantity** or **Flip a REJECTED verdict** in SQLite. The database accepts the edit;
     Verify turns red and names the transaction, because the contract still holds the original hash and status.
   - *On-chain attacks* (real transactions): **Overwrite a record** → `RecordExists`; **Seller approves their own fraud**
     → `AccessControlUnauthorizedAccount(…, AUDITOR_ROLE)`; **Change a final verdict** → `NotPendingReview`;
     **Record a forged invoice** → `InvalidSellerSignature`. Each failed transaction is mined (status 0) and shown red
     in the explorer — nothing changed. **Reset demo** deploys a fresh contract.
5. **Trace**: pick a batch with a *Circular trading* flag. The journey shows goods returning to an earlier holder (↺).
6. **Network**: the red backward arc is the trading ring; `networkx` lists the detected cycles. Participant trust scores sit alongside.
7. **Model**: the **learning loop** — press **Retrain with auditor feedback** and the auditors' verdicts become training labels; see before/after metrics and the version trend (live scoring switches to the new model). Then the ablation (rules vs RF vs hybrid), the threshold slider, ROC/PR curves, the confusion matrix and per-type recall on a shifted test set.
8. **Exports**: CSV of all transactions (Dashboard), the audit trail (Quarantine) and every on-chain record read live from the contract (Ledger) open directly in Excel.

**Check** lets you load a realistic example of any fraud type, edit any field (price, temperature, organic certificate…),
re-score it instantly, and submit it to the pipeline.

## How it works

```
React UI ──REST──▶ FastAPI ──▶ features.py ─▶ rules.py (7 named rules)
                     │                     ├▶ Random Forest (type + P(fraud)) ─┐
                     │                     └▶ Isolation Forest (anomaly)  ─────┤ risk = .60·ML + .25·rules + .15·anomaly
                     │                                                         ▼
                     │                     CLEAR (<0.40) · FLAGGED (<0.70) · QUARANTINED (≥0.70)
                     │
                     ├─ SQLite: full invoice data, ML explanations (off-chain)
                     └─ web3.py ──JSON-RPC──▶ Ethereum node (Hardhat, chain 31337)
                                               └─ AgriChainLedger.sol
                                                  recordTransaction(invoice, sellerSignature, assessment)  ← ML oracle
                                                  resolve(txId, approve, noteHash)                         ← auditor
                                                  verifies EIP-712 signature · write-once records · events
```

| On-chain (contract storage) | Off-chain (SQLite) |
|---|---|
| txId, batchId, seller & buyer addresses, **keccak256 dataHash** of the full invoice, risk (basis points), fraud type, status, model version, block/time, auditor, verdict-note hash | the full invoice (prices, quantities, temperatures…), features, SHAP explanation, notes, simulator labels |

Statuses: CLEAR → `Committed`, FLAGGED → `Flagged`, QUARANTINED → `PendingReview` → `Approved` / `Rejected` (once).
Roles (OpenZeppelin `AccessControl`): admin/registrar (deploys, registers participants), ML oracle (records), auditor (resolves).

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

**Is this a real blockchain?** Yes. `blockchain/contracts/AgriChainLedger.sol` is a Solidity 0.8.28 contract,
compiled and deployed to a real Ethereum node (Hardhat Network — the same EVM, JSON-RPC API and transaction format as
Ethereum mainnet). The backend signs raw transactions with the oracle/auditor keys and sends them through `web3.py`; you
can watch them being mined in the Blockchain window, and the explorer on the Ledger page reads blocks straight from the
node. The same contract deploys unchanged to a public testnet (`npm run deploy` with a Sepolia RPC URL and a funded key;
see `blockchain/hardhat.config.js`). It is a single local node for the demo: one validator, instant blocks, free gas.

**Why not put the whole invoice on-chain?** Storage on Ethereum is expensive and public. The contract stores a
keccak256 hash of the invoice plus the decision; the full data stays in the database. Any later edit to the database no
longer matches the on-chain hash, which is exactly what **Verify against chain** checks.

**What do the signatures add?** Each participant has its own Ethereum account. The seller signs an EIP-712 typed
`Invoice` (txId, batchId, seller, buyer, dataHash); the contract recovers the signer with `ECDSA` and reverts with
`InvalidSellerSignature` unless it is the seller. So not even the platform's oracle can record a transaction in a
farmer's name. (Demo custody: the server derives participants' keys from a seed so the simulator can sign for them; in
production each party signs in its own wallet and the platform only sees signatures.)

**Who pays gas?** The ML oracle account submits the seller-signed invoice (a meta-transaction / relayer pattern), so
farmers need no ETH. On the local node all accounts are pre-funded test accounts.

**How does the model improve over time?** The learning loop: approved quarantines are labelled as false alarms,
rejected ones as the suspected fraud type, and retraining adds them to the training data (never the test sets), so
before/after metrics are a fair comparison.

**Why not a pretrained Hugging Face model?** No pretrained model exists for tabular agri-transaction fraud. Training on
our own simulator gives labelled examples of *each* fraud type, which powers both the type prediction and per-type evaluation.

**Why a hybrid?** Rules are precise and explainable for known patterns. The Random Forest generalises across noisy
combinations of features. The Isolation Forest flags transactions that are just *unusual*. The ablation chart shows each alone vs combined.

**Why does the verdict go on-chain and not just the transaction?** So that "quietly un-rejecting" a fraud is impossible
on-chain (the contract allows exactly one verdict, only from the auditor role) and detectable off-chain (the database
status no longer matches the contract).

**How are explanations produced?** Rule reasons are deterministic templates. Model reasons are SHAP TreeExplainer
contributions toward "fraud", computed per transaction in about 50 ms.

## Tests

```bash
cd blockchain && npm test                      # 10 Solidity contract tests (Hardhat + ethers): signatures, roles, write-once, verdicts
cd backend && pytest -q && ruff check .        # 35 tests: the real contract bytecode on an in-process EVM, tamper + attack cases, every rule, learning loop, API flows
cd frontend && npm test && npm run typecheck && npm run lint && npm run build
```

## Layout

See **`Project-Map.md`** (complete technical overview), `DESIGN.md` (design, scope and reasoning) and `CLAUDE.md` (agent instructions).
