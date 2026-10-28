# Demonstration Guide — AgriChain Sentinel

How to start the project, what to click, what the audience sees, and what to say about every feature.
Button and page names below are written exactly as they appear on screen.

| If you have… | Follow |
|---|---|
| **5 minutes** | [Part 3 — The 5-minute demo](#part-3--the-5-minute-demo) |
| **10–15 minutes** | Part 3, then the extra stops in [Part 4](#part-4--feature-by-feature-walkthrough) marked ⭐ |
| **A viva / Q&A** | [Part 6](#part-6--viva-questions-and-answers) |
| **Something broke** | [Part 7](#part-7--troubleshooting-during-the-demo) |

---

## Part 1 — Before the presentation

### 1.1 One-time setup (do this the day before, on the laptop you will present from)

1. Install **Python 3.12** (tick *"Add python.exe to PATH"*) and the **Node.js LTS**.
2. Get the code: `git clone https://github.com/quantumKeyboard/AgriChain.git` (or unzip the project).
3. Start the launcher:
   - **Windows:** double-click `run.bat`
   - **macOS:** double-click `run.command` (first time: right-click → **Open** → **Open**)
   - **Linux / Terminal:** `./run.sh`
4. Press **2** (*Setup / repair*). It installs everything — a few minutes on a good connection.
   If it stops with *"Read timed out"*, just press **2** again; finished downloads are kept.
5. Press **1** (*Start the app*). The browser opens **http://localhost:5173**.
6. Rehearse [Part 3](#part-3--the-5-minute-demo) once, end to end.

> Setup needs internet. **The demo itself does not** — everything runs on your laptop.

### 1.2 Ten minutes before you present

| Step | Why |
|---|---|
| Open the launcher → **1** (*Start the app*) | Starts the Ethereum node (Hardhat, port 8545), the API (port 8000) and the UI (port 5173). On Windows you get three windows: **AgriChain Blockchain**, **AgriChain API**, **AgriChain UI** |
| In the app: **Ledger** → **Reset demo (redeploy contract)** (or launcher option **7**) | Fresh contract and history: ~300 transactions recorded on-chain, 4 items waiting in Quarantine, Verify green |
| Put the **AgriChain Blockchain** window where the audience can see it (or `.run/chain.log` on Mac/Linux: `tail -f .run/chain.log`) | Every contract call scrolls by live — `eth_sendRawTransaction`, *Contract call: AgriChainLedger#recordTransaction*, gas used, block number |
| Make sure the **Simulator** toggle (top bar) is **off** | You'll switch it on live for effect |
| Zoom the browser to 90–100 %, close other tabs | Charts fit the projector |
| Keep `docs/screenshots/` open in a folder | Backup if anything fails ([Part 7](#part-7--troubleshooting-during-the-demo)) |

### 1.3 The 30-second introduction (say this first)

> "Agricultural produce changes hands many times — farmer, cooperative, processor, distributor, retailer — and
> every hand-over is a chance for fraud: inflated quantities, fake organic labels, hidden cold-chain failures,
> goods traded in circles. **AgriChain Sentinel checks every transaction with machine learning and records it,
> with the model's verdict, in an Ethereum smart contract.** Each seller signs its own invoice; the contract
> refuses anything that isn't signed by the real seller and never lets a record be changed. Suspicious ones wait
> for a human auditor, whose verdict also goes on-chain — so the history can't be rewritten, even by us."

---

## Part 2 — Orientation: what's on screen

**Top bar (always visible)**

| Element | What it does |
|---|---|
| Sun logo + **AgriChain SENTINEL** | Home (Dashboard) |
| Pill navigation: **Dashboard · Check · Quarantine · Ledger · Trace · Network · Model** | The 7 pages. The active one is gold and shows its name |
| **Simulator** toggle + speed (**Slow / Normal / Fast**) | Streams realistic live transactions through the whole pipeline |
| **Inject fraud** (gold button) | Sends one fraudulent transaction of the type you pick |
| Bell with a red number | Transactions waiting for an auditor — click to open Quarantine |
| Toasts (top-right pop-ups) | Live alerts: quarantined fraud, verdicts recorded on-chain, attack results |

**Colour language** (same everywhere): 🟢 green = **Clear**, 🟠 amber = **Flagged**, 🔴 red = **Quarantined / Rejected**.
Gold is the brand colour for charts. Every coloured badge also has an icon and a text label.

**The pipeline in one line** (draw this on the board if you can):

```
Seller signs invoice (EIP-712, own Ethereum key)
  → 21 features → [Random Forest + Isolation Forest + 7 rules] → risk 0–1
  → ML oracle calls AgriChainLedger.recordTransaction(invoice, signature, assessment) on Ethereum
       risk < 0.40  → Committed
       0.40 – 0.70 → Flagged
       ≥ 0.70      → PendingReview → auditor calls resolve() → Approved / Rejected (exactly once)
  The contract checks the seller's signature; records are write-once; full invoice stays off-chain, its hash on-chain.
```

---

## Part 3 — The 5-minute demo

Each step: **Do** (what to click) → **See** (what appears) → **Say** (the point to make).

### Step 1 — Live traffic (≈ 45 s) · *Dashboard*

- **Do:** Switch the **Simulator** toggle **on** (top bar). Leave it running for ~15 s.
- **See:** "Live stream" with a pulsing gold dot; the *Transaction history* list fills; the gold *Live risk stream*
  line moves. In the **Blockchain** window, a `recordTransaction` call is mined for every transaction.
- **Say:** *"Every one of these is scored by the ML engine in ~70 ms and then recorded by our smart contract on
  Ethereum — you can see each transaction being mined in this window. The big number is the total value screened."*

### Step 2 — Catch a fraud (≈ 45 s) · *any page*

- **Do:** **Inject fraud** → **Phantom quantity**. Then switch the **Simulator off** (keeps the screen calm).
- **See:** A red toast **"Quarantined: Phantom quantity"** with a risk around 80 %; the bell number goes up.
- **Say:** *"I just sent an invoice claiming more produce than the farm could physically grow. It's recorded
  on-chain as PendingReview — it cannot be treated as a completed sale until an auditor decides."*

### Step 3 — Explain and decide (≈ 1 min) · *Quarantine*

- **Do:** Click the toast (or the bell). The highest-risk item is already open.
- **See:** The **risk sun** gauge (rays light up with risk), the **rule** that fired — e.g. *YIELD_IMPOSSIBLE:
  "Quantity 30,758 kg is 2.2× the quantity the seller actually received for this batch."* — the **SHAP bars**
  (which features pushed toward fraud), the **Hybrid score** breakdown, and **Fraud-type probabilities**.
- **Do:** Type a note (e.g. *"Weighbridge slip doesn't match"*) → **Reject**.
- **See:** Toast: *"…rejected · Verdict recorded on Ethereum in block #N · saved as a training label"*. A
  `resolve` call appears in the Blockchain window.
- **Say:** *"The system never just says 'fraud' — it says why, in words and in model terms. The auditor's
  verdict is an Ethereum transaction from the auditor account — permanent, and it also becomes training data."*

### Step 4 — Prove the blockchain can't be rewritten (≈ 1 min 30 s) · *Ledger*

- **See first:** the **AgriChainLedger contract** card — contract address, chain id 31337, the admin / ML oracle /
  auditor accounts with their ETH balances — and the **Ethereum blocks** strip with the decoded contract calls.
- **Do:** **Verify against chain**.
- **See:** Green banner **"Database matches the blockchain — all N on-chain records verified."**
- **Do:** In *Attack simulation → Off-chain*, click **Flip a REJECTED verdict to APPROVED**.
- **See:** The database accepts it; Verify turns red: **"Verdict / status edited — Database says APPROVED, the
  contract says REJECTED"**, naming the transaction.
- **Say:** *"An insider can always edit our database — but the smart contract still has the real verdict, so we
  catch it and know exactly which record."*
- **Do:** *On-chain* → **Seller approves their own fraud**.
- **See:** Green result **"Transaction reverted: AccessControlUnauthorizedAccount"** with `neededRole: AUDITOR_ROLE`;
  the explorer jumps to a block whose `resolve()` call is red **Reverted**.
- **Say:** *"Now the attack goes to the blockchain itself: the fraudster sends a real transaction from their own
  wallet to approve their rejected invoice. The EVM rejects it — only the auditor role may decide. The failed
  attempt is even recorded in the block."* ⭐ **This is the strongest moment of the demo.**
- **Optional:** **Overwrite an on-chain record** → `RecordExists`; **Change a final verdict** → `NotPendingReview`;
  **Record a forged invoice** → `InvalidSellerSignature`.
- **Do:** **Reset demo (redeploy contract)** → **Verify against chain** → green again.

### Step 5 — Close with the model (≈ 45 s) · *Model*

- **See:** Headline metrics (PR-AUC ≈ 0.96, F1 ≈ 0.96) and the **shifted set** numbers under each.
- **Point at:** *Ablation: is the hybrid worth it?* → switch **Held-out** to **Shifted**.
- **Say:** *"On a harder test set where fraud is subtler, rules alone drop to F1 0.87 while the hybrid holds
  0.91. The data is synthetic, so these scores are optimistic — we say that openly on this page."*

**Close:** *"So: ML decides as each transaction arrives, a human decides the hard cases, and the smart contract —
with every seller's signature — makes the record impossible to rewrite afterwards."*

---

## Part 4 — Feature-by-feature walkthrough

Use these for a longer demo or when someone asks *"can you show…"*. ⭐ = recommended extra stops.

### 4.1 Dashboard (`/`)

| Feature | How to show it | Talking point |
|---|---|---|
| **Value screened** (₹ Cr) + decision mix bar | Point at the hero card | Scale of what's been checked; green/amber/red split |
| **Fraud value stopped** | KPI tile | ₹ value of rejected + held transactions |
| **Injected fraud caught** / **False quarantines** | KPI tiles | Ground truth from the simulator: e.g. *"25/25 caught, 0 false quarantines"* |
| **Transactions over time** | Toggle **2 h / 48 h** | Stacked area of clear/flagged/quarantined; hover for exact counts |
| **Live risk stream** | Hover a red or amber dot, click it | Last 60 risk scores against the 40 % and 70 % threshold lines; a click opens that transaction |
| **Suspected fraud by type** | — | Which fraud patterns the model sees most |
| **Risk by region × crop** ⭐ | Hover a bright cell | Heatmap of average risk; ⚑ = flagged count. *"Fraud hot-spots by state and crop"* |
| **Ledger** card | **Verify database against chain** | Latest Ethereum blocks + one-click integrity check without leaving the dashboard |
| **Transaction history** | Click any row | Opens the full detail drawer (see 4.2) |
| **Where in the chain** | — | Which hand-over stage gets flagged most |
| **Export CSV** | Top right | Downloads every transaction for Excel |

### 4.2 Transaction detail drawer (click any transaction anywhere)

Shows risk gauge, crop and quantity, seller → buyer, price vs. market reference, transit, temperature, organic
status, the rule reasons, SHAP bars, the hybrid score, and the **On-chain record**: the Ethereum block and
transaction hash that recorded it, the verdict's block, the invoice's keccak256 `dataHash`, **seller signature
status** (*"Seller's EIP-712 signature valid"*), the auditor's note, and **Trace this batch**.
Press **Esc** to close.

### 4.3 Check a transaction (`/check`) ⭐

The "what-if" lab — great for questions like *"what if the price was lower?"*

1. Click **✓ Legitimate** under *Load example* → **Assessment** shows a low, green risk.
2. Click **Concealed cold-chain breach** → red, with a reason like *"Sensor max … °C exceeds the 12 °C limit for
   tomato, yet the shipment is declared 'cold chain OK'."* (numbers vary per example)
3. Now **untick** *Declared 'cold chain OK'* → **Analyze** → the risk falls.
   **Say:** *"An honestly reported breach is not fraud — hiding it is. The model learned that difference."*
4. Click **Forged signature** (or tick **Forge signature (signed by someone else)**) → **Analyze** → quarantined by
   rule **SIGNATURE_INVALID**, regardless of the ML score.
5. **Submit to the blockchain pipeline** records it for real: the result names the Ethereum block it was recorded
   in. A forged one is *not* sent — the contract would reject it — and waits in Quarantine instead.

Every field is editable: quantity, unit price, transit time, temperatures, organic flags, seller/buyer, stage.

### 4.4 Quarantine (`/quarantine`)

| Feature | Talking point |
|---|---|
| Queue sorted by risk | Auditor sees the most dangerous first |
| Full explanation + **Fraud-type probabilities** | The model's confidence for each of the 6 fraud types |
| **Approve / Reject** with note | Either verdict is an on-chain `resolve()` call by the auditor account; **Approve** = the model raised a false alarm. Approving a forged invoice fails: the contract reports `InvalidSellerSignature` |
| **Recently reviewed** table | Audit history with links to the verdict's Ethereum block |
| **Export audit trail (CSV)** | Compliance report: verdict, reasons, auditor note, verdict block and transaction hash |

### 4.5 Ledger (`/ledger`) ⭐

| Feature | How to show it | Talking point |
|---|---|---|
| **AgriChainLedger contract** card | — | Contract address, network (Hardhat, chain 31337), node client, block height, number of records, the deploy transaction, and the three role accounts with ETH balances |
| **Verify against chain** | Click | Reads every record back from the contract and checks the database copy: data hash, status, seller signature, missing rows |
| **Ethereum blocks** strip | Click any block | Real blocks from the node: number, hash, the contract function called; red = a reverted transaction |
| Block detail | — | Block hash, parent hash, state / transactions / receipts roots, gas used and limit |
| **Transactions in this block** | — | Decoded with the ABI: `recordTransaction`, `recordTransactions` (bulk), `resolve`, `registerParticipants`; who sent it (ML oracle, auditor, a participant); events such as `TransactionRecorded(txId, status, riskBps)` |
| **Inflate a recorded quantity ×10** | Off-chain attack | Database edit → Verify: *Invoice data edited* + *Seller signature broken* |
| **Flip a REJECTED verdict to APPROVED** | Off-chain attack | Database edit → Verify: *Verdict / status edited* |
| **Overwrite an on-chain record** | On-chain attack | Reverted with `RecordExists` — records are write-once, even for the oracle |
| **Seller approves their own fraud** ⭐ | On-chain attack | Reverted with `AccessControlUnauthorizedAccount(…, AUDITOR_ROLE)` |
| **Change a final verdict** | On-chain attack | Reverted with `NotPendingReview` — exactly one verdict per record |
| **Record a forged invoice** | On-chain attack | Reverted with `InvalidSellerSignature(expectedSeller, recoveredSigner)` |
| **Reset demo (redeploy contract)** | After any attack | Deploys a fresh contract and re-records the history |
| **CSV** | Next to Verify | Every on-chain record, read live from the contract |

### 4.6 Batch trace (`/trace`)

1. Keep **With flags** selected; pick a batch tagged *Circular trading*.
2. **See:** the journey Farmer → Cooperative → Processor → … with a **↺** where goods return to an earlier holder;
   the timeline with the rule reason on the flagged hop; *Quantity along the chain* bars (a jump up = phantom
   quantity).
3. **Say:** *"This is farm-to-shelf traceability — a consumer or regulator can see every hand-over and which one
   looked wrong."*

### 4.7 Trade network (`/network`)

- **Flow graph:** 5 columns (Farmer → Retailer). Legitimate trade flows left → right; a **red arc going backwards**
  is a circular trade. Hover a node for its trust score; click to select it.
- **Detected cycles:** loops found with graph analysis (`networkx`), e.g. `F-067 → C-004 → P-001 → D-014 → F-067`.
- **Participant trust:** radar (clean history, verdicts upheld, account age, activity) and the lowest-trust list.
- **Say:** *"Fraud rings are invisible one transaction at a time but obvious as a graph."*
- **Live trick:** **Inject fraud → Circular trading**, then reload this page — a new red arc and cycle appear.

### 4.8 Model insights (`/model`) ⭐

| Section | How to show it | Talking point |
|---|---|---|
| Headline metrics | — | Held-out vs **shifted** (harder) test set |
| **Learning loop** ⭐ | **Retrain with auditor feedback** (~10 s) | Verdicts become labels → model retrains → new version goes live. Shows a **Before → after** table and a **Model versions** trend. *"The system improves from its own auditors."* Be honest: with ~20 labels the change is small |
| **Ablation** | Switch **Held-out / Shifted** and **F1 / PR-AUC / …** | Why a hybrid: each component alone vs combined |
| **Threshold explorer** ⭐ | Drag the slider | Precision vs recall trade-off live: lower threshold = fewer missed frauds, more false alarms |
| **ROC / PR** curves | Toggle | Standard evaluation curves |
| **Recall by fraud type** | — | Per-type detection on both test sets |
| **Confusion matrix** | Hover cells | Mostly diagonal = the type guess is usually right |
| **What the Random Forest relies on** | — | Top features: quantity vs capacity, buyer already in trail, price deviation |
| **Dataset** + caveat | — | 20,000 synthetic transactions, 7 % fraud; honest limitation note |

### 4.9 For a technical audience

| Show | Where |
|---|---|
| Interactive API (every endpoint, try it live) | **http://localhost:8000/docs** |
| The smart contract | `blockchain/contracts/AgriChainLedger.sol` |
| Watch the node | The **AgriChain Blockchain** window (Mac/Linux: `tail -f .run/chain.log`) |
| Run the test suites (10 contract + 35 backend + 11 frontend) | Launcher option **9** |
| Code entry points | `blockchain/contracts/`, `backend/app/chain/ethereum.py` (web3 client), `backend/app/chain/identity.py` (EIP-712), `backend/app/ml/` |
| Full technical overview | `Project-Map.md` |

---

## Part 5 — The six fraud types (+ identity spoofing)

Use **Inject fraud** (top bar) or the **Check** page's example buttons.

| Pick | What the simulator does | What catches it | Typical on-screen reason |
|---|---|---|---|
| **Price manipulation** | Price 35–120 % above (or 32–65 % below) the mandi reference | Rule `PRICE_BAND` + model | "Unit price ₹45/kg is +80% vs. the market reference…" |
| **Phantom quantity** | Sells more than the farm can grow / the seller received | `YIELD_IMPOSSIBLE` | "Quantity … is 2.2× the quantity the seller actually received…" |
| **Organic label fraud** | Sold as organic without a valid certificate | `ORGANIC_UNCERTIFIED` | "Batch is sold as organic but has no valid organic certificate." |
| **Concealed cold-chain breach** | Perishable over its temperature limit but declared "cold chain OK" | `COLD_CHAIN` | "Sensor max … exceeds the … limit…, yet the shipment is declared 'cold chain OK'." |
| **Circular trading** | Goods sold back to an earlier holder (A→B→C→A) | `CIRCULAR` + graph cycles | "Buyer already handled this batch earlier — goods are moving in a circle." |
| **Duplicate invoice** | The same invoice submitted twice | `DUPLICATE` | "An identical invoice … was already submitted." |
| **Forged signature** | A legitimate-looking invoice signed with someone else's key | Cryptography — hard gate; the contract would revert it, so it stays off-chain | "The signature does not match seller …'s registered key…" |

---

## Part 6 — Viva questions and answers

**Is this a real blockchain?**
Yes. `AgriChainLedger.sol` is a Solidity smart contract, compiled and deployed to an Ethereum node (Hardhat Network:
the same EVM, JSON-RPC API, transaction and block format as Ethereum). The backend sends signed raw transactions with
`web3.py`; the Ledger page reads blocks straight from the node. For the demo the node runs locally with one validator
and free test ETH; the same contract deploys unchanged to the Sepolia testnet (`npm run deploy` with an RPC URL and a
funded key).

**What exactly is stored on-chain?**
Per transaction: its id and batch, seller and buyer addresses, the keccak256 hash of the full invoice, the risk score,
predicted fraud type, status, model version, block and time, and later the auditor and a hash of the note. The full
invoice stays in the database because on-chain storage is public and expensive; the hash proves it was not changed.

**Why ML *and* blockchain?**
ML decides *before* a record is written (prevention); the blockchain guarantees the record and the verdict
can't be changed *afterwards* (integrity). Blockchain alone would faithfully store fraudulent data.

**What do the signatures add?**
The contract only records an invoice if `ECDSA.recover` on its EIP-712 signature returns the seller's address. So
even the platform's own oracle cannot record a transaction in a farmer's name (demo: *Record a forged invoice* →
`InvalidSellerSignature`), and a database edit also breaks the signature.

**Who holds the keys? Who pays gas?**
Each participant has its own Ethereum account. In this demo the server derives those keys from a seed so the
simulator can sign for everyone; in production each participant signs in its own wallet. The ML oracle submits the
signed invoices and pays the gas (a relayer / meta-transaction pattern), so farmers need no ETH.

**Why can't the admin just change a record?**
There is no function that edits or deletes a record. `recordTransaction` reverts with `RecordExists` for an existing
id, and `resolve` works once, only from the auditor role. Changing that would need a new contract at a new address.

**Where does the data come from? Isn't the accuracy too high?**
A simulator we wrote generates 20,000 agricultural transactions with six injected fraud types, realistic noise,
legitimate outliers (drought price spikes, bumper harvests, honestly reported breaches) and 0.4 % label noise.
Because it's synthetic, scores are optimistic; we report a second, harder *shifted* test set and say so on the
Model page.

**Why not a pretrained Hugging Face model?**
No pretrained model exists for tabular agricultural-transaction fraud. Training our own gives labels for each
fraud type, which drives the type prediction and the per-type evaluation.

**Why a hybrid of three models?**
Rules are precise and explainable for known patterns; the Random Forest handles noisy combinations; the Isolation
Forest flags anything just *unusual*. The ablation chart shows each alone vs combined — the hybrid is the most
robust on the shifted set.

**How are explanations generated?**
Rule reasons are fixed templates filled with the transaction's numbers. Model reasons are SHAP values (TreeExplainer)
— each feature's contribution toward "fraud" for that specific transaction.

**How does the model improve?**
The learning loop: Approved → labelled legitimate (false alarm), Rejected → the suspected fraud type. Retraining
adds these to the training data only, so before/after metrics on the same test sets are a fair comparison.

**What would you add next?**
Deployment to a public testnet with participants signing in their own wallets (MetaMask), multi-auditor approval
in the contract, validation on a real dataset, and a mobile view for farmers. (See `DESIGN.md` → Later.)

---

## Part 7 — Troubleshooting during the demo

| Problem | Fix |
|---|---|
| Page is blank or shows *"Cannot reach the API"* | The API isn't running. Launcher → **4** (Stop) → **1** (Start). Wait for the API window to say *Application startup complete* |
| *"Ethereum node not reachable"* | The Blockchain window was closed. Launcher → **1** (starts it again); the API redeploys the contract and re-records the history by itself (~10 s) |
| *Port already in use* | Launcher → **4**, then **1** |
| Charts look empty | **Ledger → Reset demo (redeploy contract)**, or switch the Simulator on for 20 s |
| A verdict attack says no REJECTED verdict found | Reject one item in Quarantine first (or reset the demo) |
| Quarantine is empty | **Inject fraud** → any type |
| An off-chain attack left Verify red | **Reset demo (redeploy contract)** |
| Retrain button is greyed out | No usable labels yet — Approve/Reject a few items in Quarantine |
| Setup failed with *Read timed out* | Slow internet — press **2** again (it resumes), or use another network |
| Something else on stage | Switch to the screenshots in `docs/screenshots/` and narrate Part 3 from them |

---

## Part 8 — Quick reference card

```
Launcher:  1 Start   2 Setup   3 Open   4 Stop   5 Blockchain + API   6 UI only
           7 Reset demo   8 Retrain   9 Tests   (L Logs — Mac/Linux)   0 Exit
App:       http://localhost:5173        API docs: http://localhost:8000/docs
Ethereum:  http://127.0.0.1:8545 (Hardhat, chain id 31337)

Demo order:  Simulator ON → Inject Phantom quantity → Quarantine: Reject
             → Ledger: Verify → Flip verdict (off-chain) → Seller approves own fraud (on-chain, reverted) → Reset
             → Model: Shifted ablation (→ Retrain if time)

Thresholds:  < 0.40 Clear · 0.40–0.70 Flagged · ≥ 0.70 Quarantined
Risk      =  0.60 × Random Forest + 0.25 × Rules + 0.15 × Isolation Forest
On-chain  =  AgriChainLedger.sol · EIP-712 seller signatures · roles: admin, ML oracle, auditor · write-once
```
