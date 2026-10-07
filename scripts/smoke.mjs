import { createProver } from '../server/prover.mjs';
import { createChain } from '../server/chain.mjs';
import { prepareDelivery, settleDelivery, publicReceipt } from '../server/protocol.mjs';
import { writeFile } from 'node:fs/promises';
console.log('Starting real proof and EVM smoke test');
const prover = await createProver();
let chain;
try {
  chain = await createChain();
  const d = await prepareDelivery(chain, prover);
  console.log('Order funded and delivery signed', d.orderId.toString());
  const proof = await prover.prove(d.input);
  console.log('Real proof produced', proof.proveMs, 'ms', proof.proof.length, 'bytes');
  console.log('Solidity verifier result', await chain.verifier.verify(proof.proof, proof.publicInputs));
  const receipt = await settleDelivery(chain, d, proof);
  const result = publicReceipt(chain, d, proof, receipt);
  await writeFile('artifacts/smoke-receipt.json', JSON.stringify(result, null, 2));
  console.log('Settlement confirmed', receipt.status, receipt.gasUsed.toString(), await chain.balances());
} finally { await prover.destroy(); if (chain) await chain.close(); }
