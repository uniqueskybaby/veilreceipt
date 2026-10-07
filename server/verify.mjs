import { getBytes, verifyTypedData, parseEther } from 'ethers';
import { fieldHex } from './prover.mjs';

export async function verifyReceipt(chain, receipt) {
  const checks = [];
  const check = (name, ok) => { checks.push({ name, ok: Boolean(ok) }); return ok; };
  try {
    check('schema', receipt.schema === 'veilreceipt.public-receipt.v1' && typeof receipt.outcome === 'boolean'
      && receipt.denomination === 'local-test-ETH' && receipt.policy.id === 'market-snapshot.v1');
    check('trusted-contract', receipt.domain.verifyingContract.toLowerCase() === chain.info.escrow.toLowerCase()
      && receipt.domain.chainId === chain.info.chainId && receipt.network.chainId === chain.info.chainId
      && receipt.domain.name === chain.domain.name && receipt.domain.version === chain.domain.version
      && receipt.network.escrow.toLowerCase() === chain.info.escrow.toLowerCase()
      && receipt.network.verifier.toLowerCase() === chain.info.verifier.toLowerCase());
    const o = await chain.escrow.orders(receipt.orderId);
    check('provider-signature', verifyTypedData(chain.domain, chain.types, receipt.message, receipt.signature).toLowerCase() === o.provider.toLowerCase());
    const policyId = await chain.escrow.POLICY_ID();
    const fundingTx = await chain.provider.getTransactionReceipt(receipt.funding.transactionHash);
    const funded = fundingTx?.logs.filter(x => x.address.toLowerCase() === chain.info.escrow.toLowerCase()).map(x => {
      try { return chain.escrow.interface.parseLog(x); } catch { return null; }
    }).find(x => x?.name === 'OrderFunded' && x.args.orderId.toString() === receipt.orderId);
    check('order-binding', receipt.message.orderId === receipt.orderId && receipt.message.requestCommitment === o.requestCommitment
      && receipt.message.policyId === policyId && receipt.policy.policyId === policyId
      && receipt.referenceTime === Number(o.referenceTime) && receipt.deadline === Number(o.deadline)
      && receipt.policy.maxAge === Number(o.maxAge) && receipt.policy.minSamples === Number(o.minSamples)
      && receipt.policy.minConfidence === Number(o.minConfidence) && parseEther(receipt.amount) === o.amount
      && fundingTx?.status === 1 && fundingTx.blockNumber === receipt.funding.blockNumber
      && funded && funded.args.amount === o.amount && funded.args.requestCommitment === o.requestCommitment
      && receipt.network.buyer.toLowerCase() === o.buyer.toLowerCase() && receipt.network.provider.toLowerCase() === o.provider.toLowerCase()
      && receipt.settlement.recipient.toLowerCase() === (receipt.outcome ? o.provider : o.buyer).toLowerCase());
    const expected = Array.from(await chain.escrow.publicInputs(receipt.orderId, receipt.message.responseCommitment, receipt.outcome));
    check('public-inputs', expected.length === receipt.publicInputs.length && expected.every((v,i) => v === fieldHex(receipt.publicInputs[i])));
    check('zk-proof', await chain.verifier.verify(getBytes(receipt.proof), expected));
    const tx = await chain.provider.getTransactionReceipt(receipt.settlement.transactionHash);
    const event = tx?.logs.filter(x => x.address.toLowerCase() === chain.info.escrow.toLowerCase()).map(x => {
      try { return chain.escrow.interface.parseLog(x); } catch { return null; }
    }).find(x => x?.name === 'ReceiptSettled' && x.args.orderId.toString() === receipt.orderId);
    check('settlement-event', tx?.status === 1 && receipt.settlement.status === tx.status
      && receipt.settlement.blockNumber === tx.blockNumber && receipt.metrics.gasUsed === tx.gasUsed.toString()
      && event && event.args.responseCommitment === receipt.message.responseCommitment
      && event.args.accepted === receipt.outcome && event.args.amount.toString() === receipt.settlement.amountWei
      && event.args.policyId === receipt.message.policyId && event.args.provider.toLowerCase() === o.provider.toLowerCase());
    check('final-state', Number(o.status) === (receipt.outcome ? 2 : 3));
  } catch (err) { checks.push({ name: 'verification-error', ok: false, reason: err.shortMessage || err.message }); }
  return { valid: checks.length === 8 && checks.every(x => x.ok), checks, verifiedAt: new Date().toISOString() };
}
