import solc from 'solc';
import fs from 'node:fs';
import path from 'node:path';
import { root } from '../server/prover.mjs';

const sources = Object.fromEntries(['ReceiptEscrow.sol', 'Verifier.sol'].map(name => [name, { content: fs.readFileSync(path.join(root, 'contracts', name), 'utf8') }]));
const result = JSON.parse(solc.compile(JSON.stringify({ language: 'Solidity', sources, settings: {
  optimizer: { enabled: true, runs: 1 }, evmVersion: 'shanghai',
  outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'evm.bytecode.linkReferences', 'evm.deployedBytecode.object'] } },
} }), { import: p => {
  const resolved = path.join(root, 'node_modules', p);
  return fs.existsSync(resolved) ? { contents: fs.readFileSync(resolved, 'utf8') } : { error: `Missing import: ${p}` };
} }));
for (const error of result.errors || []) console.log(error.formattedMessage);
if (result.errors?.some(x => x.severity === 'error')) process.exit(1);
fs.writeFileSync(path.join(root, 'artifacts/contracts.json'), JSON.stringify(result.contracts));
for (const [source, contracts] of Object.entries(result.contracts)) for (const [name, artifact] of Object.entries(contracts)) {
  if (artifact.evm.bytecode.object) console.log(`${source}:${name} deployed ${artifact.evm.deployedBytecode.object.length / 2} bytes`);
}
