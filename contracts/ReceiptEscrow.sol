// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IReceiptVerifier {
    function verify(bytes calldata proof, bytes32[] calldata publicInputs) external view returns (bool);
}

/// @notice Experimental buyer-submitted receipt escrow. Not an atomic fair-exchange protocol.
contract ReceiptEscrow is EIP712, ReentrancyGuard {
    uint256 public constant FIELD_MODULUS = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    bytes32 public constant POLICY_ID = keccak256("veilreceipt.market-snapshot.v1");
    bytes32 public constant DELIVERY_TYPEHASH = keccak256("Delivery(uint256 orderId,bytes32 requestCommitment,bytes32 responseCommitment,bytes32 policyId)");
    IReceiptVerifier public immutable verifier;
    uint256 public nextOrderId = 1;
    enum Status { None, Funded, Accepted, Rejected, Expired }
    struct Order {
        address buyer;
        address provider;
        bytes32 requestCommitment;
        uint256 amount;
        uint64 referenceTime;
        uint64 deadline;
        uint64 maxAge;
        uint32 minSamples;
        uint16 minConfidence;
        Status status;
    }
    mapping(uint256 => Order) public orders;
    mapping(address => uint256) public acceptedCount;
    mapping(address => uint256) public rejectedCount;
    event OrderFunded(uint256 indexed orderId, address indexed buyer, address indexed provider, bytes32 requestCommitment, uint256 amount);
    event ReceiptSettled(uint256 indexed orderId, address indexed provider, bytes32 responseCommitment, bytes32 policyId, bool accepted, uint256 amount);
    event OrderExpired(uint256 indexed orderId, uint256 amount);
    error InvalidOrder();
    error UnauthorizedBuyer();
    error InvalidSignature();
    error InvalidProof();
    error AlreadyFinalized();
    error DeadlinePassed();
    error TooEarly();
    error TransferFailed();

    constructor(address verifier_) EIP712("VeilReceipt", "1") {
        require(verifier_.code.length > 0, "Verifier required");
        verifier = IReceiptVerifier(verifier_);
    }

    function fund(address provider, bytes32 requestCommitment, uint64 maxAge, uint32 minSamples, uint16 minConfidence, uint64 ttl)
        external payable returns (uint256 id)
    {
        if (provider == address(0) || provider == msg.sender || msg.value == 0 || uint256(requestCommitment) >= FIELD_MODULUS
            || minConfidence > 10000 || ttl < 60 || ttl > 86400 || maxAge > 86400) revert InvalidOrder();
        id = nextOrderId++;
        orders[id] = Order(msg.sender, provider, requestCommitment, msg.value,
            uint64(block.timestamp), uint64(block.timestamp) + ttl, maxAge, minSamples, minConfidence, Status.Funded);
        emit OrderFunded(id, msg.sender, provider, requestCommitment, msg.value);
    }

    function deliveryDigest(uint256 id, bytes32 responseCommitment) public view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(DELIVERY_TYPEHASH, id, orders[id].requestCommitment, responseCommitment, POLICY_ID)));
    }

    function publicInputs(uint256 id, bytes32 responseCommitment, bool accepted) public view returns (bytes32[] memory inputs) {
        Order storage o = orders[id];
        inputs = new bytes32[](8);
        inputs[0] = bytes32(id);
        inputs[1] = o.requestCommitment;
        inputs[2] = responseCommitment;
        inputs[3] = bytes32(uint256(o.referenceTime));
        inputs[4] = bytes32(uint256(o.maxAge));
        inputs[5] = bytes32(uint256(o.minSamples));
        inputs[6] = bytes32(uint256(o.minConfidence));
        inputs[7] = bytes32(uint256(accepted ? 1 : 0));
    }

    function settle(uint256 id, bytes32 responseCommitment, bool accepted, bytes calldata signature, bytes calldata proof)
        external nonReentrant
    {
        Order storage o = orders[id];
        if (o.status == Status.None) revert InvalidOrder();
        if (o.status != Status.Funded) revert AlreadyFinalized();
        if (msg.sender != o.buyer) revert UnauthorizedBuyer();
        if (block.timestamp > o.deadline) revert DeadlinePassed();
        if (uint256(responseCommitment) >= FIELD_MODULUS) revert InvalidProof();
        if (ECDSA.recover(deliveryDigest(id, responseCommitment), signature) != o.provider) revert InvalidSignature();
        if (!verifier.verify(proof, publicInputs(id, responseCommitment, accepted))) revert InvalidProof();
        o.status = accepted ? Status.Accepted : Status.Rejected;
        if (accepted) acceptedCount[o.provider]++; else rejectedCount[o.provider]++;
        emit ReceiptSettled(id, o.provider, responseCommitment, POLICY_ID, accepted, o.amount);
        (bool ok,) = payable(accepted ? o.provider : o.buyer).call{value: o.amount}("");
        if (!ok) revert TransferFailed();
    }

    function refundExpired(uint256 id) external nonReentrant {
        Order storage o = orders[id];
        if (o.status == Status.None) revert InvalidOrder();
        if (o.status != Status.Funded) revert AlreadyFinalized();
        if (block.timestamp <= o.deadline) revert TooEarly();
        o.status = Status.Expired;
        emit OrderExpired(id, o.amount);
        // A timeout is not cryptographic evidence of provider misbehavior.
        (bool ok,) = payable(o.buyer).call{value: o.amount}("");
        if (!ok) revert TransferFailed();
    }
}
