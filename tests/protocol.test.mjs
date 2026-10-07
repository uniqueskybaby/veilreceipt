import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { hexlify, getBytes, parseEther } from 'ethers';
import { createProver, fieldHex } from '../server/prover.mjs';
import { createChain } from '../server/chain.mjs';
import { prepareDelivery, settleDelivery, publicReceipt, witnessInput, verdict } from '../server/protocol.mjs';
import { verifyReceipt } from '../server/verify.mjs';

test('real Noir proof, Solidity verification, escrow and adversarial cases', { timeout: 180000 }, async t => {
  const prover = await createProver();
  const chain = await createChain();
  t.after(async()=>{await prover.destroy();await chain.close()});
  const report={startedAt:new Date().toISOString(),tests:[],network:'fresh local EVM 31337',proofMode:'UltraHonk evm (ZK enabled)'};
  const check=async(name,fn)=>{await t.test(name,async()=>{try{await fn();report.tests.push({name,passed:true})}catch(error){report.tests.push({name,passed:false});throw error}})};
  const d=await prepareDelivery(chain,prover,'valid');
  let proof;
  await check('valid private data produces a proof accepted by the generated Solidity verifier',async()=>{
    proof=await prover.prove(d.input);
    assert.equal(proof.publicInputs.length,8);
    assert.equal(await chain.verifier.verify(proof.proof,proof.publicInputs),true);
    assert.deepEqual(Array.from(await chain.escrow.publicInputs(d.orderId,d.commitments[1],true)),proof.publicInputs);
    report.proveMs=proof.proveMs;report.proofBytes=proof.proof.length;
  });
  await check('tampering signed private content cannot satisfy the commitment constraints',async()=>{
    await assert.rejects(()=>prover.execute({...d.input,price_micros:d.input.price_micros+1}));
    await assert.rejects(()=>prover.execute({...d.input,request_salt:'42'}));
    await assert.rejects(()=>prover.execute({...d.input,response_salt:'42'}));
  });
  await check('public outcome and policy parameters cannot be changed after proving',async()=>{
    for (const i of [0,1,2,3,4,5,6,7]) {
      const inputs=[...proof.publicInputs];inputs[i]=fieldHex(BigInt(inputs[i])+1n);
      assert.equal(await prover.verify({proof:proof.proof,publicInputs:inputs}),false,`input ${i}`);
    }
  });
  await check('corrupted proof is rejected',async()=>{
    const bytes=Uint8Array.from(proof.proof);bytes[200]^=1;
    assert.equal(await prover.verify({proof:bytes,publicInputs:proof.publicInputs}),false);
    await assert.rejects(()=>chain.escrow.settle.staticCall(d.orderId,d.commitments[1],true,d.signature,bytes));
  });
  await check('counterfeit provider, wrong buyer, and wrong chain domain are rejected',async()=>{
    const wrongSig=await chain.stranger.signTypedData(chain.domain,chain.types,d.message);
    await assert.rejects(()=>chain.escrow.settle.staticCall(d.orderId,d.commitments[1],true,wrongSig,proof.proof),e=>e.revert?.name==='InvalidSignature');
    const outsider=await chain.provider.getSigner(2);
    await assert.rejects(()=>chain.escrow.connect(outsider).settle.staticCall(d.orderId,d.commitments[1],true,d.signature,proof.proof),e=>e.revert?.name==='UnauthorizedBuyer');
    const wrongDomain=await chain.seller.signTypedData({...chain.domain,chainId:1},chain.types,d.message);
    await assert.rejects(()=>chain.escrow.settle.staticCall(d.orderId,d.commitments[1],true,wrongDomain,proof.proof),e=>e.revert?.name==='InvalidSignature');
  });
  await check('even a freshly signed commitment cannot reuse the proof in another order',async()=>{
    const other=await prepareDelivery(chain,prover,'valid');
    const forgedContext={...other.message,responseCommitment:d.commitments[1]};
    const sig=await chain.seller.signTypedData(chain.domain,chain.types,forgedContext);
    await assert.rejects(()=>chain.escrow.settle.staticCall(other.orderId,d.commitments[1],true,sig,proof.proof));
    assert.equal(Number((await chain.escrow.orders(other.orderId)).status),1);
  });
  let acceptedReceipt;
  await check('accepted delivery pays the exact order amount and emits a verifiable receipt',async()=>{
    const before=await chain.provider.getBalance(chain.info.provider);
    const tx=await settleDelivery(chain,d,proof);
    assert.equal(await chain.provider.getBalance(chain.info.provider)-before,parseEther(d.p.amount));
    assert.equal(Number((await chain.escrow.orders(d.orderId)).status),2);
    assert.equal(Number(await chain.escrow.acceptedCount(chain.info.provider)),1);
    acceptedReceipt=publicReceipt(chain,d,proof,tx);
    const verified = await verifyReceipt(chain,acceptedReceipt);
    assert.ok(verified.valid,JSON.stringify(verified));
    report.settlementGas=tx.gasUsed.toString();
  });
  await check('replay cannot pay twice or inflate reputation',async()=>{
    await assert.rejects(()=>chain.escrow.settle.staticCall(d.orderId,d.commitments[1],true,d.signature,proof.proof),e=>e.revert?.name==='AlreadyFinalized');
    assert.equal(Number(await chain.escrow.acceptedCount(chain.info.provider)),1);
  });
  await check('public export contains neither the private response nor salts, and rejects altered displayed amounts',async()=>{
    const serialized=JSON.stringify(acceptedReceipt);
    for(const value of [d.secret.request_salt,d.secret.response_salt,'price_micros','confidence_bps','observed_at','sample_count']) assert.ok(!serialized.includes(String(value)),value);
    assert.equal((await verifyReceipt(chain,{...acceptedReceipt,amount:'1'})).valid,false);
    assert.equal((await verifyReceipt(chain,{...acceptedReceipt,domain:{...acceptedReceipt.domain,name:'Counterfeit'}})).valid,false);
    assert.equal((await verifyReceipt(chain,{...acceptedReceipt,settlement:{...acceptedReceipt.settlement,blockNumber:999999}})).valid,false);
  });
  await check('a stale signed response has a valid negative proof and refunds the buyer',async()=>{
    const stale=await prepareDelivery(chain,prover,'stale');
    assert.equal(stale.outcome,false);
    await assert.rejects(()=>prover.execute({...stale.input,outcome:true}));
    const negativeProof=await prover.prove(stale.input);
    const sellerBefore=await chain.provider.getBalance(chain.info.provider);
    const buyerBefore=await chain.provider.getBalance(chain.info.buyer);
    const tx=await settleDelivery(chain,stale,negativeProof);
    const buyerAfter=await chain.provider.getBalance(chain.info.buyer);
    assert.equal(buyerAfter-buyerBefore+tx.gasUsed*tx.gasPrice,parseEther(stale.p.amount));
    assert.equal(await chain.provider.getBalance(chain.info.provider),sellerBefore);
    assert.equal(Number((await chain.escrow.orders(stale.orderId)).status),3);
    assert.equal(Number(await chain.escrow.rejectedCount(chain.info.provider)),1);
    const verified = await verifyReceipt(chain,publicReceipt(chain,stale,negativeProof,tx));
    assert.ok(verified.valid,JSON.stringify(verified));
  });
  await check('low-quality delivery proves a negative result and refunds the exact escrow',async()=>{
    const low=await prepareDelivery(chain,prover,'low-quality');
    assert.equal(low.outcome,false);
    const negative=await prover.prove(low.input);
    const sellerBefore=await chain.provider.getBalance(chain.info.provider);
    const buyerBefore=await chain.provider.getBalance(chain.info.buyer);
    const tx=await settleDelivery(chain,low,negative);
    assert.equal(await chain.provider.getBalance(chain.info.buyer)-buyerBefore+tx.gasUsed*tx.gasPrice,parseEther(low.p.amount));
    assert.equal(await chain.provider.getBalance(chain.info.provider),sellerBefore);
    assert.equal(Number((await chain.escrow.orders(low.orderId)).status),3);
    assert.equal((await verifyReceipt(chain,publicReceipt(chain,low,negative,tx))).valid,true);
  });
  await check('malformed and foreign artifacts never become verified receipts',async()=>{
    for(const invalid of [null,{},[],{...acceptedReceipt,proof:'0x'},{...acceptedReceipt,network:{...acceptedReceipt.network,escrow:'0x0000000000000000000000000000000000000001'}}]){
      assert.equal((await verifyReceipt(chain,invalid)).valid,false);
    }
  });
  await check('boundary values and false claims are constrained inside Noir',async()=>{
    const reference=Number(d.order.referenceTime);
    for(const change of [
      {observed_at:reference-120,sample_count:100,confidence_bps:9000},
      {observed_at:reference+1}, {observed_at:reference-121}, {sample_count:99},
      {confidence_bps:8999}, {confidence_bps:10001}, {price_micros:0}, {response_asset_id:8},
    ]) {
      const secret={...d.secret,...change};const cs=await prover.commitments(secret);
      const expected=verdict(secret,d.p,reference);
      await prover.execute(witnessInput(secret,cs,d.order,expected));
      await assert.rejects(()=>prover.execute(witnessInput(secret,cs,d.order,!expected)));
    }
  });
  await check('expiry refunds without a fault receipt and prevents late settlement',async()=>{
    const timeout=await prepareDelivery(chain,prover,'valid',{policy:{ttl:60}});
    await assert.rejects(()=>chain.escrow.refundExpired.staticCall(timeout.orderId),e=>e.revert?.name==='TooEarly');
    const counts=await chain.escrow.rejectedCount(chain.info.provider);
    await chain.node.request({method:'evm_increaseTime',params:[61]});await chain.node.request({method:'evm_mine',params:[]});
    await assert.rejects(()=>chain.escrow.settle.staticCall(timeout.orderId,timeout.commitments[1],true,timeout.signature,proof.proof),e=>e.revert?.name==='DeadlinePassed');
    const tx=await chain.escrow.refundExpired(timeout.orderId);await tx.wait();
    assert.equal(Number((await chain.escrow.orders(timeout.orderId)).status),4);
    assert.equal(await chain.escrow.rejectedCount(chain.info.provider),counts);
    await assert.rejects(()=>chain.escrow.refundExpired.staticCall(timeout.orderId),e=>e.revert?.name==='AlreadyFinalized');
  });
  report.completedAt=new Date().toISOString();await writeFile('artifacts/test-report.json',JSON.stringify(report,null,2));
});
