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
| Open the launcher → **1** (*Start the app*) | Starts the API (port 8000) and the UI (port 5173) |
| In the app: **Ledger** → **Reset demo data** (or launcher option **7**) | Fresh history: ~300 transactions, ~60 blocks, 4 items waiting in Quarantine, chain verified green |
| Make sure the **Simulator** toggle (top bar) is **off** | You'll switch it on live for effect |
| Zoom the browser to 90–100 %, close other tabs | Charts fit the projector |
| Keep `docs/screenshots/` open in a folder | Backup if anything fails ([Part 7](#part-7--troubleshooting-during-the-demo)) |

### 1.3 The 30-second introduction (say this first)

> "Agricultural produce changes hands many times — farmer, cooperative, processor, distributor, retailer — and
> every hand-over is a chance for fraud: inflated quantities, fake organic labels, hidden cold-chain failures,
> goods traded in circles. **AgriChain Sentinel checks every transaction with machine learning *before* it is
> written to a blockchain ledger.** Clean ones are sealed into blocks, suspicious ones are held for a human
> auditor, and the ledger makes any later tampering detectable — even by someone with full database access."

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
| Toasts (top-right pop-ups) | Live alerts: quarantined fraud, mined blocks, verdicts |

**Colour language** (same everywhere): 🟢 green = **Clear**, 🟠 amber = **Flagged**, 🔴 red = **Quarantined / Rejected**.
Gold is the brand colour for charts. Every coloured badge also has an icon and a text label.

**The pipeline in one line** (draw this on the board if you can):

```
Transaction → 21 features → [Random Forest + Isolation Forest + 7 rules] → risk 0–1
   risk < 0.40  → CLEAR      → sealed into the next block
   0.40 – 0.70 → FLAGGED    → sealed, with a flag
   ≥ 0.70      → QUARANTINED → waits for an auditor → APPROVED / REJECTED → sealed
Block = 5 records → Merkle root → proof-of-work → linked to the previous block
```

---

## Part 3 — The 5-minute demo

Each step: **Do** (what to click) → **See** (what appears) → **Say** (the point to make).

### Step 1 — Live traffic (≈ 45 s) · *Dashboard*

- **Do:** Switch the **Simulator** toggle **on** (top bar). Leave it running for ~15 s.
- **See:** "Live stream" with a pulsing gold dot; the *Transaction history* list fills; the gold *Live risk stream*
  line moves; green toasts **"Block #N mined — Proof-of-work found"** appear every few seconds.
- **Say:** *"Every one of these is being scored by the ML engine in ~70 ms, then sealed into a block with
  proof-of-work. The big number is the total value screened; the bar shows the decision mix."*

### Step 2 — Catch a fraud (≈ 45 s) · *any page*

- **Do:** **Inject fraud** → **Phantom quantity**. Then switch the **Simulator off** (keeps the screen calm).
- **See:** A red toast **"Quarantined: Phantom quantity"** with a risk around 80 %; the bell number goes up.
- **Say:** *"I just sent an invoice claiming more produce than the farm could physically grow. It was stopped
  before reaching the ledger."*

### Step 3 — Explain and decide (≈ 1 min) · *Quarantine*

- **Do:** Click the toast (or the bell). The highest-risk item is already open.
- **See:** The **risk sun** gauge (rays light up with risk), the **rule** that fired — e.g. *YIELD_IMPOSSIBLE:
  "Quantity 30,758 kg is 2.2× the quantity the seller actually received for this batch."* — the **SHAP bars**
  (which features pushed toward fraud), the **Hybrid score** breakdown, and **Fraud-type probabilities**.
- **Do:** Type a note (e.g. *"Weighbridge slip doesn't match"*) → **Reject**.
- **See:** Toast: *"…rejected · Sealed into block #N · saved as a training label"*.
- **Say:** *"The system never just says 'fraud' — it says why, in words and in model terms. The auditor's
  verdict is written permanently to the chain, and it also becomes training data."*

### Step 4 — Prove the ledger is tamper-evident (≈ 1 min 30 s) · *Ledger*

- **Do:** **Verify chain**.
- **See:** Green banner **"Chain intact — all N blocks verified."**
- **Do:** In *Attack simulation*, click **Flip a REJECTED fraud verdict**.
- **See:** Red banner **"Tampering detected in block #N"** naming the exact transaction; that block turns red with
  a skull icon; in the block detail the record shows **recomputed … ✗ MISMATCH** and the in-browser Merkle tree
  root turns red.
- **Say:** *"This is a corrupt insider quietly changing 'rejected' to 'committed' in the database. Because the
  verdict is part of the record's hash, the Merkle root no longer matches, and we know exactly where."*
- **Do:** **Rewrite history and re-mine**.
- **See:** Again **"Tampering detected"** — this time the reason is **"Seller signature invalid… Hashes were
  recomputed to hide the edit, but signatures cannot be."** The record shows *recomputed ✓ matches* but
  *signature ✗ INVALID*.
- **Say:** *"This attacker is smarter: they edited a record, recomputed every hash and redid all the
  proof-of-work, so every hash and link looks valid. It's still caught, because each invoice is digitally signed
  by its seller, and only the seller has that key."* ⭐ **This is the strongest moment of the demo.**
- **Do:** **Reset demo data** → **Verify chain** → green again.

### Step 5 — Close with the model (≈ 45 s) · *Model*

- **See:** Headline metrics (PR-AUC ≈ 0.96, F1 ≈ 0.96) and the **shifted set** numbers under each.
- **Point at:** *Ablation: is the hybrid worth it?* → switch **Held-out** to **Shifted**.
- **Say:** *"On a harder test set where fraud is subtler, rules alone drop to F1 0.87 while the hybrid holds
  0.91. The data is synthetic, so these scores are optimistic — we say that openly on this page."*

**Close:** *"So: ML decides before anything is recorded, a human decides the hard cases, and the blockchain
plus signatures make the record trustworthy afterwards."*

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
| **Ledger** card | **Verify entire chain** | One-click integrity check without leaving the dashboard |
| **Transaction history** | Click any row | Opens the full detail drawer (see 4.2) |
| **Where in the chain** | — | Which hand-over stage gets flagged most |
| **Export CSV** | Top right | Downloads every transaction for Excel |

### 4.2 Transaction detail drawer (click any transaction anywhere)

Shows risk gauge, crop and quantity, seller → buyer, price vs. market reference, transit, temperature, organic
status, the rule reasons, SHAP bars, the hybrid score, and the **On-chain record**: block number, record hash,
**seller signature status** (*"Seller signature valid (Ed25519)"*), the auditor's note, and **Trace this batch**.
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
5. **Submit to the blockchain pipeline** records it for real (a clean one gets sealed; a risky one goes to Quarantine).

Every field is editable: quantity, unit price, transit time, temperatures, organic flags, seller/buyer, stage.

### 4.4 Quarantine (`/quarantine`)

| Feature | Talking point |
|---|---|
| Queue sorted by risk | Auditor sees the most dangerous first |
| Full explanation + **Fraud-type probabilities** | The model's confidence for each of the 6 fraud types |
| **Approve / Reject** with note | Either verdict is sealed on-chain; **Approve** = the model raised a false alarm |
| **Recently reviewed** table | Audit history with block links |
| **Export audit trail (CSV)** | Compliance report: verdict, reasons, auditor note, block, hash |

### 4.5 Ledger (`/ledger`) ⭐

| Feature | How to show it | Talking point |
|---|---|---|
| Chain strip | Scroll; click any block | Each block shows its hash prefix and one coloured bar per record |
| **Verify chain** | Click | Recomputes every record hash, Merkle root, header hash, proof-of-work, link **and signature** |
| Block detail | Click a block | Block hash, previous hash, Merkle root, nonce, difficulty (hash starts with `000`) |
| Transaction records | — | *stored* vs *recomputed* hash, and the signature check, per record |
| **Prove** ⭐ | Click **Prove** on a record | Highlights the Merkle inclusion proof: gold path + dashed sibling hashes. *"To prove one record is in a block you need only 3 hashes, not all 5 records — that's how light clients verify."* |
| **Inflate a sealed quantity ×10** | Attack 1 | Data edit → Merkle mismatch |
| **Flip a REJECTED fraud verdict** | Attack 2 | Verdict edit → caught because the verdict is hashed |
| **Edit a block header (nonce)** | Attack 3 | Header edit → hash / proof-of-work no longer valid |
| **Rewrite history and re-mine** | Attack 4 | Everything recomputed → caught only by the seller's signature |
| **Reset demo data** | After any attack | Fresh, valid chain |
| **CSV** | Next to Verify | All block headers |

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
| Run the test suites (32 backend + 11 frontend) | Launcher option **9** |
| Code entry points | `backend/app/chain/ledger.py`, `backend/app/chain/identity.py`, `backend/app/ml/` |
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
| **Forged signature** | A legitimate-looking invoice signed with someone else's key | Cryptography — hard gate | "The signature does not match seller …'s registered public key…" |

---

## Part 6 — Viva questions and answers

**Is this a real blockchain?**
It implements what makes a blockchain tamper-evident: SHA-256 hashing of every record, a Merkle root per block,
previous-hash links, proof-of-work, digital signatures and full re-verification. It is **single-node** — no
peer-to-peer network or multi-party consensus. That was a deliberate scope choice for a course project; anchoring
block hashes on Ethereum is listed as future work.

**Why ML *and* blockchain?**
ML decides *before* a record is written (prevention); the blockchain guarantees the record and the verdict
can't be changed *afterwards* (integrity). Blockchain alone would faithfully store fraudulent data.

**What do the signatures add if you already have hashes?**
Whoever controls the database could edit a record and recompute every hash and the proof-of-work (demo attack 4).
Only the seller holds their private key, so the edited record can't be re-signed — verification still fails.
Signatures also stop invoices sent in someone else's name.

**Who holds the keys?**
In this demo the server derives every participant's key from a seed so the simulator can sign for them. In
production each participant keeps their own private key and only public keys are registered.

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

**What's the Merkle proof for?**
Proving one record is inside a block using only log₂(n) sibling hashes, without revealing or downloading the other
records — how lightweight clients verify membership.

**What would you add next?**
Ethereum anchoring of block hashes, multi-auditor approval, validation on a real dataset, and a mobile view for
farmers. (See `DESIGN.md` → Later.)

---

## Part 7 — Troubleshooting during the demo

| Problem | Fix |
|---|---|
| Page is blank or shows *"Cannot reach the API"* | The API isn't running. Launcher → **4** (Stop) → **1** (Start). Wait for the API window to say *Application startup complete* |
| *Port already in use* | Launcher → **4**, then **1** |
| Charts look empty | **Ledger → Reset demo data**, or switch the Simulator on for 20 s |
| **Flip a REJECTED fraud verdict** says no verdict found | Reject one item in Quarantine first (or Reset demo data) |
| Quarantine is empty | **Inject fraud** → any type |
| A tamper demo left the chain red | **Reset demo data** |
| Retrain button is greyed out | No usable labels yet — Approve/Reject a few items in Quarantine |
| Setup failed with *Read timed out* | Slow internet — press **2** again (it resumes), or use another network |
| Something else on stage | Switch to the screenshots in `docs/screenshots/` and narrate Part 3 from them |

---

## Part 8 — Quick reference card

```
Launcher:  1 Start   2 Setup   3 Open   4 Stop   5 API only   6 UI only
           7 Reset demo   8 Retrain   9 Tests   (L Logs — Mac/Linux)   0 Exit
App:       http://localhost:5173        API docs: http://localhost:8000/docs

Demo order:  Simulator ON → Inject Phantom quantity → Quarantine: Reject
             → Ledger: Verify → Flip verdict → Rewrite & re-mine → Reset
             → Model: Shifted ablation (→ Retrain if time)

Thresholds:  < 0.40 Clear · 0.40–0.70 Flagged · ≥ 0.70 Quarantined
Risk      =  0.60 × Random Forest + 0.25 × Rules + 0.15 × Isolation Forest
Block     =  5 records · SHA-256 · Merkle root · proof-of-work (3 hex zeros) · Ed25519 signatures
```
