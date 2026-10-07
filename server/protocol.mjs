import { parseEther, hexlify, verifyTypedData } from 'ethers';
import { randomField } from './prover.mjs';

export const policy = { id: 'market-snapshot.v1', maxAge: 120, minSamples: 100, minConfidence: 9000, ttl: 3600, amount: '0.002' };
export const scenarios = ['valid', 'stale', 'low-quality', 'tampered', 'forged'];
export function makeSecret(overrides = {}) {
  return {
    order_id: '0', asset_id: 7, request_salt: randomField(), response_asset_id: 7,
    observed_at: 1, sample_count: 240, confidence_bps: 9700, price_micros: 2684320000,
    response_salt: randomField(), ...overrides,
  };
}
export function verdict(secret, p, referenceTime) {
  return secret.asset_id === secret.response_asset_id && secret.observed_at <= referenceTime && referenceTime - secret.observed_at <= p.maxAge
    && secret.sample_count >= p.minSamples && secret.confidence_bps >= p.minConfidence && secret.confidence_bps <= 10000 && secret.price_micros > 0;
}
export function witnessInput(secret, commitments, order, outcome) {
  return { ...secret, request_commitment: commitments[0], response_commitment: commitments[1], reference_time: order.referenceTime.toString(),
    max_age: order.maxAge.toString(), min_samples: order.minSamples.toString(), min_confidence: order.minConfidence.toString(), outcome };
}
export async function prepareDelivery(chain, prover, scenario = 'valid', options = {}) {
  const p = { ...policy, ...options.policy };
  const secret = makeSecret(options.secret);
  const [requestCommitment] = await prover.commitments(secret);
  const fundTx = await chain.escrow.fund(chain.seller.address, requestCommitment, p.maxAge, p.minSamples, p.minConfidence, p.ttl, { value: parseEther(p.amount) });
  const fundReceipt = await fundTx.wait();
  const event = fundReceipt.logs.map(x => { try { return chain.escrow.interface.parseLog(x); } catch { return null; } }).find(x => x?.name === 'OrderFunded');
  const orderId = event.args.orderId;
  const order = await chain.escrow.orders(orderId);
  secret.order_id = orderId.toString();
  secret.observed_at = Number(order.referenceTime) - (scenario === 'stale' ? 600 : 12);
  if (scenario === 'low-quality') secret.sample_count = 24;
  if (options.afterFund) Object.assign(secret, options.afterFund);
  const commitments = await prover.commitments(secret);
  const message = { orderId: orderId.toString(), requestCommitment: commitments[0], responseCommitment: commitments[1], policyId: await chain.escrow.POLICY_ID() };
  const signature = await (scenario === 'forged' ? chain.stranger : chain.seller).signTypedData(chain.domain, chain.types, message);
  const outcome = verdict(secret, p, Number(order.referenceTime));
  return { secret, commitments, order, orderId, message, signature, outcome, p, fundReceipt, input: witnessInput(secret, commitments, order, outcome) };
}
export function signatureValid(chain, delivery) {
  return verifyTypedData(chain.domain, chain.types, delivery.message, delivery.signature) === chain.seller.address;
}
export async function settleDelivery(chain, delivery, proof) {
  const tx = await chain.escrow.settle(delivery.orderId, delivery.commitments[1], delivery.outcome, delivery.signature, hexlify(proof.proof), { gasLimit: 12_000_000 });
  const receipt = await tx.wait();
  if (receipt.status !== 1) throw new Error('Settlement transaction failed');
  return receipt;
}
export function publicReceipt(chain, d, proof, receipt) {
  const event = receipt.logs.map(x => { try { return chain.escrow.interface.parseLog(x); } catch { return null; } }).find(x => x?.name === 'ReceiptSettled');
  if (!event) throw new Error('No ReceiptSettled event in transaction');
  return {
    schema: 'veilreceipt.public-receipt.v1', network: chain.info, orderId: d.orderId.toString(),
    policy: { id: d.p.id, policyId: d.message.policyId, maxAge: d.p.maxAge, minSamples: d.p.minSamples, minConfidence: d.p.minConfidence },
    referenceTime: Number(d.order.referenceTime), deadline: Number(d.order.deadline), amount: d.p.amount, denomination: 'local-test-ETH',
    domain: chain.domain, message: d.message, signature: d.signature, outcome: d.outcome,
    proof: hexlify(proof.proof), publicInputs: proof.publicInputs, proofSystem: 'UltraHonk ZK / Noir 1.0.0-beta.19 / bb.js 4.1.1',
    metrics: { proveMs: Math.round(proof.proveMs), verifyMs: Math.round(proof.verifyMs), proofBytes: proof.proof.length, gasUsed: receipt.gasUsed.toString() },
    funding: { transactionHash: d.fundReceipt.hash, blockNumber: d.fundReceipt.blockNumber },
    settlement: { transactionHash: receipt.hash, blockNumber: receipt.blockNumber, status: receipt.status, recipient: d.outcome ? chain.info.provider : chain.info.buyer, amountWei: event.args.amount.toString() },
    privacy: { hidden: ['query asset', 'response fields', 'request salt', 'response salt'], disclosed: ['parties', 'policy', 'order time', 'amount', 'commitments', 'verdict'] },
    limitations: ['Synthetic provider data', 'Provider attestation, not real-world truth', 'Buyer-submitted settlement, not atomic fair exchange', 'Public local receipt log, no deployed ERC-8004 registry integration'],
  };
}
