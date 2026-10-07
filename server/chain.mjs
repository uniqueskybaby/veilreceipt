import ganache from 'ganache';
import { BrowserProvider, ContractFactory, Contract, Wallet, formatEther } from 'ethers';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { loadJson, root } from './prover.mjs';

// Public, well-known development mnemonic. These accounts must never hold real funds.
const mnemonic = 'test test test test test test test test test test test junk';
export async function createChain({ persistent = false } = {}) {
  await mkdir(path.join(root, '.runtime'), { recursive: true });
  const node = ganache.provider({
    wallet: { mnemonic, totalAccounts: 5, defaultBalance: 1000 },
    chain: { chainId: 31337, hardfork: 'shanghai' },
    miner: { blockGasLimit: 40_000_000 }, logging: { quiet: true },
    ...(persistent ? { database: { dbPath: path.join(root, '.runtime/chain') } } : {}),
  });
  const provider = new BrowserProvider(node, undefined, { cacheTimeout: -1 });
  provider.pollingInterval = 50;
  const buyer = await provider.getSigner(0);
  const seller = new Wallet(Object.values(node.getInitialAccounts())[1].secretKey);
  const stranger = new Wallet(Object.values(node.getInitialAccounts())[2].secretKey);
  const artifacts = await loadJson('artifacts/contracts.json');
  const buildFingerprint = createHash('sha256').update(JSON.stringify(artifacts)).digest('hex');
  const manifestPath = path.join(root, '.runtime/deployment.json');
  let saved;
  if (persistent) try { saved = JSON.parse(await readFile(manifestPath, 'utf8')); } catch {}
  const deployed = {};
  async function deploy(source, name, args = []) {
    const artifact = artifacts[source][name];
    let code = artifact.evm.bytecode.object;
    for (const [file, libraries] of Object.entries(artifact.evm.bytecode.linkReferences)) {
      for (const [lib, refs] of Object.entries(libraries)) {
        const address = (deployed[lib] || await deploy(file, lib)).slice(2);
        for (const ref of refs) code = code.slice(0, ref.start * 2) + address + code.slice((ref.start + ref.length) * 2);
      }
    }
    const instance = await new ContractFactory(artifact.abi, code, buyer).deploy(...args, { gasLimit: 35_000_000 });
    await instance.waitForDeployment();
    return deployed[name] = await instance.getAddress();
  }
  const verifierName = Object.keys(artifacts['Verifier.sol']).find(name => name === 'HonkVerifier')
    || Object.keys(artifacts['Verifier.sol']).find(name => name.endsWith('Verifier') && artifacts['Verifier.sol'][name].evm.bytecode.object);
  if (!verifierName) throw new Error('Generated verifier contract missing');
  let verifierAddress, escrowAddress;
  if (saved && (!saved.buildFingerprint || saved.buildFingerprint === buildFingerprint) && await provider.getCode(saved.escrow) !== '0x') {
    verifierAddress = saved.verifier; escrowAddress = saved.escrow;
    if (persistent && !saved.buildFingerprint) await writeFile(manifestPath,JSON.stringify({...saved,buildFingerprint},null,2));
  } else {
    verifierAddress = await deploy('Verifier.sol', verifierName);
    escrowAddress = await deploy('ReceiptEscrow.sol', 'ReceiptEscrow', [verifierAddress]);
    if (persistent) await writeFile(manifestPath, JSON.stringify({ verifier: verifierAddress, escrow: escrowAddress, chainId: 31337, verifierName, buildFingerprint, deployedAt: new Date().toISOString() }, null, 2));
  }
  const escrow = new Contract(escrowAddress, artifacts['ReceiptEscrow.sol'].ReceiptEscrow.abi, buyer);
  const verifier = new Contract(verifierAddress, artifacts['Verifier.sol'][verifierName].abi, provider);
  const domain = { name: 'VeilReceipt', version: '1', chainId: 31337, verifyingContract: escrowAddress };
  const types = { Delivery: [
    { name: 'orderId', type: 'uint256' }, { name: 'requestCommitment', type: 'bytes32' },
    { name: 'responseCommitment', type: 'bytes32' }, { name: 'policyId', type: 'bytes32' },
  ] };
  return {
    node, provider, buyer, seller, stranger, escrow, verifier, domain, types,
    info: { chainId: 31337, network: 'Local EVM', buyer: await buyer.getAddress(), provider: seller.address, escrow: escrowAddress, verifier: verifierAddress },
    async balances() {
      return Object.fromEntries(await Promise.all([['buyer', await buyer.getAddress()], ['provider', seller.address], ['escrow', escrowAddress]].map(async ([k,a]) => [k, formatEther(await provider.getBalance(a))])));
    },
    async close() { await provider.destroy(); await node.disconnect(); },
  };
}
