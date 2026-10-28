// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @title AgriChainLedger
/// @notice On-chain ledger for agricultural supply-chain transactions screened by an ML fraud model.
///
/// Flow for every hand-over (farmer -> cooperative -> processor -> distributor -> retailer):
///  1. The seller signs an EIP-712 `Invoice` (txId, batchId, seller, buyer, dataHash) off-chain.
///     `dataHash` = keccak256 of the full invoice data, which stays off-chain.
///  2. The ML engine (ORACLE_ROLE) scores the invoice and calls `recordTransaction` with the seller's
///     signature and its assessment. The contract verifies the signature, so nobody can record an
///     invoice in a seller's name, and the oracle pays the gas (sellers need no ETH).
///  3. CLEAR -> Committed, FLAGGED -> Flagged, QUARANTINED -> PendingReview.
///  4. An auditor (AUDITOR_ROLE) resolves PendingReview records exactly once: Approved or Rejected.
///
/// Records are write-once: nothing can be overwritten or deleted, and every change emits an event.
contract AgriChainLedger is AccessControl, EIP712 {
    bytes32 public constant REGISTRAR_ROLE = keccak256("REGISTRAR_ROLE");
    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");
    bytes32 public constant AUDITOR_ROLE = keccak256("AUDITOR_ROLE");

    bytes32 public constant INVOICE_TYPEHASH =
        keccak256("Invoice(bytes32 txId,bytes32 batchId,address seller,address buyer,bytes32 dataHash)");

    enum Role {
        None,
        Farmer,
        Cooperative,
        Processor,
        Distributor,
        Retailer
    }

    enum Status {
        None,
        Committed,
        Flagged,
        PendingReview,
        Approved,
        Rejected
    }

    enum Decision {
        Clear,
        Flagged,
        Quarantined
    }

    struct Participant {
        bytes32 id;
        Role role;
        bool active;
    }

    struct Invoice {
        bytes32 txId;
        bytes32 batchId;
        address seller;
        address buyer;
        bytes32 dataHash;
    }

    struct Assessment {
        uint16 riskBps; // risk score in basis points (0-10000)
        Decision decision;
        uint8 fraudType; // 0 = none, 1-6 = fraud types (see off-chain FRAUD_TYPES order)
        bytes32 modelVersion;
    }

    struct Record {
        bytes32 batchId;
        address seller;
        address buyer;
        bytes32 dataHash;
        uint16 riskBps;
        uint8 fraudType;
        Status status;
        bytes32 modelVersion;
        uint64 recordedAt;
        uint64 recordedBlock;
        address auditor;
        bytes32 verdictNoteHash;
    }

    mapping(address => Participant) public participants;
    mapping(bytes32 => address) public participantAddress;

    mapping(bytes32 => Record) private _records;
    mapping(bytes32 => bytes32[]) private _batchRecords;
    bytes32[] private _recordIds;

    event ParticipantRegistered(address indexed account, bytes32 indexed id, Role role);
    event TransactionRecorded(
        bytes32 indexed txId,
        bytes32 indexed batchId,
        address indexed seller,
        address buyer,
        bytes32 dataHash,
        uint16 riskBps,
        Status status,
        uint8 fraudType
    );
    event VerdictRecorded(bytes32 indexed txId, Status status, address indexed auditor, bytes32 noteHash);

    error UnknownParticipant(address account);
    error SellerIsBuyer();
    error RecordExists(bytes32 txId);
    error RecordNotFound(bytes32 txId);
    error InvalidSellerSignature(address expectedSeller, address recoveredSigner);
    error NotPendingReview(bytes32 txId, Status status);
    error InvalidRisk(uint16 riskBps);
    error LengthMismatch();

    constructor(address admin, address oracle, address auditor) EIP712("AgriChainLedger", "1") {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(REGISTRAR_ROLE, admin);
        _grantRole(ORACLE_ROLE, oracle);
        _grantRole(AUDITOR_ROLE, auditor);
    }

    // ------------------------------------------------------------------ participants

    function registerParticipants(
        address[] calldata accounts,
        bytes32[] calldata ids,
        Role[] calldata roles
    ) external onlyRole(REGISTRAR_ROLE) {
        if (accounts.length != ids.length || ids.length != roles.length) revert LengthMismatch();
        for (uint256 i = 0; i < accounts.length; i++) {
            participants[accounts[i]] = Participant(ids[i], roles[i], true);
            participantAddress[ids[i]] = accounts[i];
            emit ParticipantRegistered(accounts[i], ids[i], roles[i]);
        }
    }

    // ------------------------------------------------------------------ recording

    /// @notice EIP-712 digest the seller signs for an invoice.
    function invoiceDigest(Invoice calldata inv) public view returns (bytes32) {
        return
            _hashTypedDataV4(
                keccak256(abi.encode(INVOICE_TYPEHASH, inv.txId, inv.batchId, inv.seller, inv.buyer, inv.dataHash))
            );
    }

    function recordTransaction(
        Invoice calldata inv,
        bytes calldata sellerSignature,
        Assessment calldata assessment
    ) external onlyRole(ORACLE_ROLE) {
        _record(inv, sellerSignature, assessment);
    }

    /// @notice Record several transactions in one Ethereum transaction (bulk import / history seeding).
    function recordTransactions(
        Invoice[] calldata invs,
        bytes[] calldata sellerSignatures,
        Assessment[] calldata assessments
    ) external onlyRole(ORACLE_ROLE) {
        if (invs.length != sellerSignatures.length || invs.length != assessments.length) revert LengthMismatch();
        for (uint256 i = 0; i < invs.length; i++) {
            _record(invs[i], sellerSignatures[i], assessments[i]);
        }
    }

    function _record(Invoice calldata inv, bytes calldata sig, Assessment calldata a) internal {
        if (!participants[inv.seller].active) revert UnknownParticipant(inv.seller);
        if (!participants[inv.buyer].active) revert UnknownParticipant(inv.buyer);
        if (inv.seller == inv.buyer) revert SellerIsBuyer();
        if (_records[inv.txId].status != Status.None) revert RecordExists(inv.txId);
        if (a.riskBps > 10_000) revert InvalidRisk(a.riskBps);

        (address signer, ECDSA.RecoverError err, ) = ECDSA.tryRecover(invoiceDigest(inv), sig);
        if (err != ECDSA.RecoverError.NoError || signer != inv.seller) {
            revert InvalidSellerSignature(inv.seller, signer);
        }

        Status status = a.decision == Decision.Clear
            ? Status.Committed
            : (a.decision == Decision.Flagged ? Status.Flagged : Status.PendingReview);

        Record storage r = _records[inv.txId];
        r.batchId = inv.batchId;
        r.seller = inv.seller;
        r.buyer = inv.buyer;
        r.dataHash = inv.dataHash;
        r.riskBps = a.riskBps;
        r.fraudType = a.fraudType;
        r.status = status;
        r.modelVersion = a.modelVersion;
        r.recordedAt = uint64(block.timestamp);
        r.recordedBlock = uint64(block.number);

        _recordIds.push(inv.txId);
        _batchRecords[inv.batchId].push(inv.txId);

        emit TransactionRecorded(
            inv.txId,
            inv.batchId,
            inv.seller,
            inv.buyer,
            inv.dataHash,
            a.riskBps,
            status,
            a.fraudType
        );
    }

    // ------------------------------------------------------------------ auditor verdicts

    function resolve(bytes32 txId, bool approve, bytes32 noteHash) external onlyRole(AUDITOR_ROLE) {
        Record storage r = _records[txId];
        if (r.status == Status.None) revert RecordNotFound(txId);
        if (r.status != Status.PendingReview) revert NotPendingReview(txId, r.status);
        r.status = approve ? Status.Approved : Status.Rejected;
        r.auditor = msg.sender;
        r.verdictNoteHash = noteHash;
        emit VerdictRecorded(txId, r.status, msg.sender, noteHash);
    }

    // ------------------------------------------------------------------ reads

    function getRecord(bytes32 txId) external view returns (Record memory) {
        return _records[txId];
    }

    function getRecords(bytes32[] calldata txIds) external view returns (Record[] memory out) {
        out = new Record[](txIds.length);
        for (uint256 i = 0; i < txIds.length; i++) {
            out[i] = _records[txIds[i]];
        }
    }

    function recordCount() external view returns (uint256) {
        return _recordIds.length;
    }

    function recordIdAt(uint256 index) external view returns (bytes32) {
        return _recordIds[index];
    }

    function batchTrail(bytes32 batchId) external view returns (bytes32[] memory) {
        return _batchRecords[batchId];
    }

    /// @notice Does an off-chain copy still match what was recorded on-chain?
    function verifyRecord(bytes32 txId, bytes32 dataHash) external view returns (bool matches, Status status) {
        Record storage r = _records[txId];
        return (r.status != Status.None && r.dataHash == dataHash, r.status);
    }
}
