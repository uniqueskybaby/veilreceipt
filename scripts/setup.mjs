import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createProver, proofOptions, root } from '../server/prover.mjs';

console.log('Initializing real Barretenberg prover and caching the public SRS…');
const p = await createProver();
try {
  const vk = await p.backend.getVerificationKey(proofOptions);
  const solidity = await p.backend.getSolidityVerifier(vk, proofOptions);
  await mkdir(path.join(root, 'artifacts'), { recursive: true });
  await writeFile(path.join(root, 'artifacts/verification-key.bin'), vk);
  await writeFile(path.join(root, 'contracts/Verifier.sol'), solidity);
  console.log(`Generated verifier: ${solidity.length} characters, verification key: ${vk.length} bytes.`);
} finally { await p.destroy(); }
