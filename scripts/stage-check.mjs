import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
const origin='http://127.0.0.1:4318';
const state=await (await fetch(`${origin}/api/state`)).json();
assert.ok(state.receipts.length,'Run one genuine delivery first');
const original=state.receipts[0];
const cases=[];
async function check(name,receipt,expected){
  const response=await fetch(`${origin}/api/verify`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({receipt})});
  assert.equal(response.status,200);
  const result=await response.json();
  assert.equal(result.valid,expected,name);
  cases.push({name,passed:true,result});
}
await check('portable original verifies all eight groups',original,true);
const flipped=structuredClone(original);flipped.outcome=!flipped.outcome;
await check('changing outcome cannot rewrite the result',flipped,false);
const changedTrust=structuredClone(original);changedTrust.domain.verifyingContract='0x0000000000000000000000000000000000000001';
await check('uploaded artifact cannot replace trusted deployment',changedTrust,false);
await check('malformed artifact returns invalid rather than success',{},false);
const bad=await fetch(`${origin}/api/verify`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
assert.equal(bad.status,400);
cases.push({name:'missing artifact returns a client error',passed:true});
await writeFile('artifacts/stage-check.json',JSON.stringify({at:new Date().toISOString(),orderId:original.orderId,cases},null,2));
await writeFile('artifacts/stage-original.json',JSON.stringify(original,null,2));
await writeFile('artifacts/stage-tampered.json',JSON.stringify(flipped,null,2));
console.log(JSON.stringify({orderId:original.orderId,passed:cases.length,originalChecks:cases[0].result.checks.length}));
