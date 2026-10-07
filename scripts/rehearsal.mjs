import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
const origin='http://127.0.0.1:4318';
const request=async(path,body)=>{const r=await fetch(origin+path,body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{});assert.equal(r.ok,true,`${path}: ${r.status}`);return r.json()};
const report={startedAt:new Date().toISOString(),rounds:[]};
for(let i=1;i<=3;i++){
 const round={number:i,cases:[]};
 for(const scenario of ['valid','stale']){
  const initial=await request('/api/state');const {id}=await request('/api/run',{scenario});let run,state;const start=Date.now();
  do{await new Promise(r=>setTimeout(r,300));state=await request('/api/state');run=state.runs.find(r=>r.id===id)}while((!run||run.status==='running'||state.busy)&&Date.now()-start<30000);
  assert.equal(run.status,scenario==='valid'?'accepted':'rejected');const receipt=state.receipts.find(r=>r.orderId===run.receiptId);assert.ok(receipt);
  assert.equal((await request('/api/verify',{receipt})).valid,true);
  const edited=structuredClone(receipt);edited.outcome=!edited.outcome;assert.equal((await request('/api/verify',{receipt:edited})).valid,false);
  assert.equal((await request(`/api/receipts/${receipt.orderId}/replay`,{})).blocked,true);
  const countKey=scenario==='valid'?'accepted':'rejected';assert.equal(state.counts[countKey]-initial.counts[countKey],1);
  round.cases.push({scenario,orderId:receipt.orderId,runId:id,proofMs:receipt.metrics.proveMs,transactionHash:receipt.settlement.transactionHash,outcome:receipt.outcome,verified:true,tamperRejected:true,replayRejected:true});
 }
 report.rounds.push(round);console.log(`Rehearsal ${i}: valid + stale + portable verification + tamper + replay passed`);
}
report.completedAt=new Date().toISOString();await mkdir('artifacts/quality',{recursive:true});await writeFile('artifacts/quality/rehearsal.json',JSON.stringify(report,null,2));
