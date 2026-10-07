import { readFile } from 'node:fs/promises';
import { Contract, JsonRpcProvider } from 'ethers';
import { loadJson } from '../server/prover.mjs';
import { verifyReceipt } from '../server/verify.mjs';

const [filename, rpc='http://127.0.0.1:4318/api/rpc', trustedEscrow] = process.argv.slice(2);
if(!filename || !trustedEscrow) {
  console.error('Usage: node scripts/verify-receipt.mjs RECEIPT.json RPC_URL TRUSTED_ESCROW_ADDRESS');
  console.error('Pin the trusted escrow independently. Never trust a contract address only because an untrusted receipt contains it.');
  process.exit(1);
}
const provider=new JsonRpcProvider(rpc,undefined,{batchMaxCount:1,cacheTimeout:-1});
try {
  const receipt=JSON.parse(await readFile(filename,'utf8'));
  const artifacts=await loadJson('artifacts/contracts.json');
  const escrow=new Contract(trustedEscrow,artifacts['ReceiptEscrow.sol'].ReceiptEscrow.abi,provider);
  const verifierAddress=await escrow.verifier();
  const verifier=new Contract(verifierAddress,artifacts['Verifier.sol'].HonkVerifier.abi,provider);
  const network=await provider.getNetwork();
  const types={Delivery:[{name:'orderId',type:'uint256'},{name:'requestCommitment',type:'bytes32'},{name:'responseCommitment',type:'bytes32'},{name:'policyId',type:'bytes32'}]};
  const context={provider,escrow,verifier,types,domain:{name:'VeilReceipt',version:'1',chainId:Number(network.chainId),verifyingContract:trustedEscrow},info:{escrow:trustedEscrow,verifier:verifierAddress,chainId:Number(network.chainId)}};
  const result=await verifyReceipt(context,receipt);
  console.log(JSON.stringify(result,null,2));
  if(!result.valid) process.exitCode=1;
}finally{await provider.destroy()}
