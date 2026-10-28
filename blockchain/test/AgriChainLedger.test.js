const { expect } = require("chai");
const { ethers } = require("hardhat");

const b32 = (s) => ethers.encodeBytes32String(s);
const Status = { None: 0n, Committed: 1n, Flagged: 2n, PendingReview: 3n, Approved: 4n, Rejected: 5n };
const Decision = { Clear: 0, Flagged: 1, Quarantined: 2 };
const Role = { Farmer: 1, Cooperative: 2 };

describe("AgriChainLedger", function () {
  let ledger, admin, oracle, auditor, farmer, coop, stranger, domain;

  const types = {
    Invoice: [
      { name: "txId", type: "bytes32" },
      { name: "batchId", type: "bytes32" },
      { name: "seller", type: "address" },
      { name: "buyer", type: "address" },
      { name: "dataHash", type: "bytes32" },
    ],
  };

  const invoice = (txId, over = {}) => ({
    txId: b32(txId),
    batchId: b32("B-0001"),
    seller: farmer.address,
    buyer: coop.address,
    dataHash: ethers.keccak256(ethers.toUtf8Bytes(`data-${txId}`)),
    ...over,
  });
  const assessment = (decision = Decision.Clear, riskBps = 1200) => ({
    riskBps,
    decision,
    fraudType: decision === Decision.Clear ? 0 : 2,
    modelVersion: b32("rf-test"),
  });
  const sign = (signer, inv) => signer.signTypedData(domain, types, inv);

  beforeEach(async function () {
    [admin, oracle, auditor, farmer, coop, stranger] = await ethers.getSigners();
    const F = await ethers.getContractFactory("AgriChainLedger");
    ledger = await F.deploy(admin.address, oracle.address, auditor.address);
    domain = {
      name: "AgriChainLedger",
      version: "1",
      chainId: (await ethers.provider.getNetwork()).chainId,
      verifyingContract: await ledger.getAddress(),
    };
    await ledger
      .connect(admin)
      .registerParticipants([farmer.address, coop.address], [b32("F-001"), b32("C-001")], [Role.Farmer, Role.Cooperative]);
  });

  it("records a seller-signed transaction and exposes it", async function () {
    const inv = invoice("TX-1");
    await expect(ledger.connect(oracle).recordTransaction(inv, await sign(farmer, inv), assessment()))
      .to.emit(ledger, "TransactionRecorded")
      .withArgs(inv.txId, inv.batchId, farmer.address, coop.address, inv.dataHash, 1200, Status.Committed, 0);
    const r = await ledger.getRecord(inv.txId);
    expect(r.status).to.equal(Status.Committed);
    expect(r.dataHash).to.equal(inv.dataHash);
    expect(await ledger.recordCount()).to.equal(1n);
    expect(await ledger.batchTrail(inv.batchId)).to.deep.equal([inv.txId]);
    const [matches] = await ledger.verifyRecord(inv.txId, inv.dataHash);
    expect(matches).to.equal(true);
  });

  it("maps ML decisions to on-chain statuses", async function () {
    const a = invoice("TX-F"), b = invoice("TX-Q");
    await ledger.connect(oracle).recordTransaction(a, await sign(farmer, a), assessment(Decision.Flagged, 5000));
    await ledger.connect(oracle).recordTransaction(b, await sign(farmer, b), assessment(Decision.Quarantined, 9100));
    expect((await ledger.getRecord(a.txId)).status).to.equal(Status.Flagged);
    expect((await ledger.getRecord(b.txId)).status).to.equal(Status.PendingReview);
  });

  it("rejects an invoice signed by someone other than the seller", async function () {
    const inv = invoice("TX-FORGED");
    await expect(ledger.connect(oracle).recordTransaction(inv, await sign(stranger, inv), assessment()))
      .to.be.revertedWithCustomError(ledger, "InvalidSellerSignature")
      .withArgs(farmer.address, stranger.address);
  });

  it("rejects a signature whose invoice data was altered", async function () {
    const inv = invoice("TX-2");
    const sig = await sign(farmer, inv);
    const altered = { ...inv, dataHash: ethers.keccak256(ethers.toUtf8Bytes("tampered")) };
    await expect(ledger.connect(oracle).recordTransaction(altered, sig, assessment())).to.be.revertedWithCustomError(
      ledger,
      "InvalidSellerSignature",
    );
  });

  it("never lets a record be overwritten", async function () {
    const inv = invoice("TX-3");
    await ledger.connect(oracle).recordTransaction(inv, await sign(farmer, inv), assessment());
    const again = { ...inv, dataHash: ethers.keccak256(ethers.toUtf8Bytes("new")) };
    await expect(ledger.connect(oracle).recordTransaction(again, await sign(farmer, again), assessment()))
      .to.be.revertedWithCustomError(ledger, "RecordExists")
      .withArgs(inv.txId);
  });

  it("only the oracle can record and only the auditor can resolve", async function () {
    const inv = invoice("TX-4");
    const sig = await sign(farmer, inv);
    await expect(ledger.connect(stranger).recordTransaction(inv, sig, assessment())).to.be.revertedWithCustomError(
      ledger,
      "AccessControlUnauthorizedAccount",
    );
    await ledger.connect(oracle).recordTransaction(inv, sig, assessment(Decision.Quarantined, 9000));
    await expect(ledger.connect(oracle).resolve(inv.txId, false, b32("note"))).to.be.revertedWithCustomError(
      ledger,
      "AccessControlUnauthorizedAccount",
    );
  });

  it("auditor resolves a pending record exactly once", async function () {
    const inv = invoice("TX-5");
    await ledger.connect(oracle).recordTransaction(inv, await sign(farmer, inv), assessment(Decision.Quarantined, 9000));
    await expect(ledger.connect(auditor).resolve(inv.txId, false, b32("fake weighbridge slip")))
      .to.emit(ledger, "VerdictRecorded")
      .withArgs(inv.txId, Status.Rejected, auditor.address, b32("fake weighbridge slip"));
    expect((await ledger.getRecord(inv.txId)).auditor).to.equal(auditor.address);
    await expect(ledger.connect(auditor).resolve(inv.txId, true, b32("changed my mind")))
      .to.be.revertedWithCustomError(ledger, "NotPendingReview")
      .withArgs(inv.txId, Status.Rejected);
  });

  it("cannot resolve a record that is not pending review", async function () {
    const inv = invoice("TX-6");
    await ledger.connect(oracle).recordTransaction(inv, await sign(farmer, inv), assessment());
    await expect(ledger.connect(auditor).resolve(inv.txId, false, b32("x"))).to.be.revertedWithCustomError(
      ledger,
      "NotPendingReview",
    );
    await expect(ledger.connect(auditor).resolve(b32("TX-NONE"), false, b32("x"))).to.be.revertedWithCustomError(
      ledger,
      "RecordNotFound",
    );
  });

  it("refuses unregistered participants", async function () {
    const inv = invoice("TX-7", { buyer: stranger.address });
    await expect(ledger.connect(oracle).recordTransaction(inv, await sign(farmer, inv), assessment()))
      .to.be.revertedWithCustomError(ledger, "UnknownParticipant")
      .withArgs(stranger.address);
  });

  it("records a batch atomically and keeps batch provenance order", async function () {
    const a = invoice("TX-A"), b = invoice("TX-B");
    await ledger
      .connect(oracle)
      .recordTransactions([a, b], [await sign(farmer, a), await sign(farmer, b)], [assessment(), assessment()]);
    expect(await ledger.batchTrail(a.batchId)).to.deep.equal([a.txId, b.txId]);
    const records = await ledger.getRecords([a.txId, b.txId]);
    expect(records.length).to.equal(2);
  });
});
