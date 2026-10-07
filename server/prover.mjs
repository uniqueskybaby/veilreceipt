import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Noir } from '@noir-lang/noir_js';
import { Barretenberg, BackendType, UltraHonkBackend } from '@aztec/bb.js';
import { randomBytes } from 'node:crypto';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const fieldHex = x => `0x${BigInt(x).toString(16).padStart(64, '0')}`;
export const randomField = () => BigInt(`0x${randomBytes(31).toString('hex')}`).toString();
export const proofOptions = { verifierTarget: 'evm' }; // ZK enabled. Never use evm-no-zk.
export const loadJson = async p => JSON.parse(await readFile(path.join(root, p), 'utf8'));

export async function createProver() {
  const circuit = await loadJson('circuits/receipt/target/receipt.json');
  const helper = new Noir(await loadJson('circuits/commitments/target/commitments.json'));
  const noir = new Noir(circuit);
  const crsPath = path.join(root, '.runtime/crs');
  await mkdir(crsPath, { recursive: true });
  const api = await Barretenberg.new({ threads: 2, backend: BackendType.Wasm, crsPath });
  const backend = new UltraHonkBackend(circuit.bytecode, api);
  return {
    circuit, backend,
    async commitments(secret) {
      const { returnValue } = await helper.execute(secret);
      return returnValue.map(fieldHex);
    },
    async execute(input) { return noir.execute(input); },
    async prove(input) {
      const start = performance.now();
      const { witness } = await noir.execute(input);
      const witnessMs = performance.now() - start;
      const generated = await backend.generateProof(witness, proofOptions);
      const proveMs = performance.now() - start - witnessMs;
      const verifyStart = performance.now();
      const valid = await backend.verifyProof(generated, proofOptions);
      if (!valid) throw new Error('Generated proof failed verification');
      return { ...generated, publicInputs: generated.publicInputs.map(fieldHex), witnessMs, proveMs, verifyMs: performance.now() - verifyStart };
    },
    async verify(proof) {
      try { return await backend.verifyProof(proof, proofOptions); } catch { return false; }
    },
    async destroy() { await api.destroy(); },
  };
}
