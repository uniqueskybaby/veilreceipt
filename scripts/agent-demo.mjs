import { writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

// Deterministic Agent client, no LLM needed to demonstrate the tool protocol.
const base=process.env.VEILRECEIPT_URL||'http://127.0.0.1:4318';
const scenario=process.argv[2]||'valid';
const response=await fetch(`${base}/api/run`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({scenario})});
const started=await response.json();if(!response.ok)throw new Error(started.error);
console.log(`Agent requested ${scenario} delivery. Waiting for settlement…`);
const deadline=Date.now()+120000;
while(Date.now()<deadline){
  const state=await (await fetch(`${base}/api/state`)).json();
  const run=state.runs.find(r=>r.id===started.id);
  if(run?.status==='accepted'||run?.status==='rejected'){
    const receipt=await (await fetch(`${base}/api/receipts/${run.receiptId}`)).json();
    const file=`artifacts/agent-receipt-${receipt.orderId}.json`;
    await writeFile(file,JSON.stringify(receipt,null,2));
    console.log(JSON.stringify({outcome:receipt.outcome,orderId:receipt.orderId,transaction:receipt.settlement.transactionHash,file},null,2));
    break;
  }
  if(run?.status==='blocked')throw new Error(run.explanation);
  await delay(500);
}
if(Date.now()>=deadline)throw new Error('Timed out; inspect the order before retrying.');
