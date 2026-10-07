import express from 'express';
import compression from 'compression';
import { createServer as createViteServer } from 'vite';
import { readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createProver, root } from './prover.mjs';
import { createChain } from './chain.mjs';
import { policy, scenarios, prepareDelivery, settleDelivery, publicReceipt } from './protocol.mjs';
import { verifyReceipt } from './verify.mjs';

const port = Number(process.env.PORT || 4318);
console.log('Starting VeilReceipt: real Noir prover and local EVM.');
const prover = await createProver();
const chain = await createChain({ persistent: true });
let runs = [], receipts = [];
const privateInputs = new Map();
const stateFile = path.join(root, '.runtime/state.json');
try {
  const saved = JSON.parse(await readFile(stateFile, 'utf8'));
  if (saved.escrow === chain.info.escrow) {
    receipts = saved.receipts || [];
    runs = (saved.runs || []).map(r => ['accepted','rejected','blocked','expired'].includes(r.status) ? r : { ...r, status: 'blocked', stage: 'interrupted', explanation: '本地服务曾中断，已保存订单。可演示到期退款。' });
  }
} catch {}
let busy = false;
async function save() {
  const temporary=stateFile+'.tmp';
  await writeFile(temporary, JSON.stringify({ escrow: chain.info.escrow, runs, receipts }, null, 2));
  await rename(temporary,stateFile);
}
async function stage(run, s, text) {
  run.stage = s; run.log.push({ stage: s, text, at: new Date().toISOString() }); await save();
}
async function runScenario(run) {
  busy = true;
  try {
    await stage(run, 'funding', '买方预存 0.002 测试 ETH，政策随订单固定。');
    const d = await prepareDelivery(chain, prover, run.scenario);
    run.orderId = d.orderId.toString(); run.fundingTx = d.fundReceipt.hash;
    run.requestCommitment = d.commitments[0]; run.responseCommitment = d.commitments[1];
    privateInputs.set(run.id, { asset: 'ETH / USD · 合成样本', ...d.secret });
    await stage(run, 'signed', '已收到响应承诺及签名，等待合约核验来源。');
    if (run.scenario === 'forged') {
      let rejected = false;
      try { await chain.escrow.settle.staticCall(d.orderId, d.commitments[1], true, d.signature, '0x'); }
      catch (error) {
        rejected = error.revert?.name === 'InvalidSignature' || (error.data && chain.escrow.interface.parseError(error.data)?.name === 'InvalidSignature');
      }
      if (!rejected) throw new Error('Expected InvalidSignature rejection was not observed');
      run.status = 'blocked'; run.explanation = '合约预执行拒绝冒充 Provider 的签名。未结算，也不计入 Provider 的失败记录。';
      await stage(run, 'blocked', run.explanation); return;
    }
    await stage(run, 'proving', '正在本机生成真实零知识证明，私密字段不进入公共凭证。');
    const input = { ...d.input };
    if (run.scenario === 'tampered') input.price_micros += 1000000;
    let proof;
    try { proof = await prover.prove(input); }
    catch (error) {
      if (run.scenario !== 'tampered' || !/assert|constraint/i.test(String(error))) throw error;
      run.status = 'blocked'; run.explanation = '篡改价格后，私密内容无法匹配 Provider 签过的承诺。电路拒绝生成证明，资金仍在托管。';
      await stage(run, 'blocked', run.explanation); return;
    }
    run.proveMs = Math.round(proof.proveMs); run.proofBytes = proof.proof.length;
    await stage(run, 'verifying', '真实证明已生成；合约正在验签、验证证明并执行结算。');
    const tx = await settleDelivery(chain, d, proof);
    const receipt = publicReceipt(chain, d, proof, tx);
    run.receiptId = receipt.orderId; run.status = d.outcome ? 'accepted' : 'rejected';
    receipts.unshift(receipt);
    await stage(run, 'settled', d.outcome ? '验收通过。款项已发送给 Provider，生成公共验收凭证。' : '验收不通过。款项已退还买方，生成有签名与证明支持的失败凭证。');
  } catch (error) {
    console.error('Demo run failed:', error.shortMessage || error.message);
    run.status = 'blocked'; run.explanation = '执行遇到错误，未宣称验收成功。详情见本地服务日志；已有托管订单可到期退款。';
    await stage(run, 'error', run.explanation);
  } finally { try { await save(); } finally { busy = false; } }
}

const app = express();
app.disable('x-powered-by');
app.use(compression());
app.use((req,res,next) => {
  const allowedHosts = [`127.0.0.1:${port}`, `localhost:${port}`];
  if (!allowedHosts.includes(req.headers.host)) return res.status(403).json({ error: 'Local demo only' });
  const origin = req.headers.origin;
  if (origin && !allowedHosts.some(host => origin === `http://${host}`)) return res.status(403).json({ error: 'Cross-origin requests disabled' });
  next();
});
app.use(express.json({ limit: '128kb' }));
app.get('/api/state', async (req,res) => res.json({ busy, runs, receipts, policy, network: chain.info, balances: await chain.balances(),
  counts: { accepted: Number(await chain.escrow.acceptedCount(chain.info.provider)), rejected: Number(await chain.escrow.rejectedCount(chain.info.provider)) } }));
app.post('/api/run', (req,res) => {
  if (busy) return res.status(409).json({ error: '已有验收在执行，请等待结束。' });
  if (!scenarios.includes(req.body?.scenario)) return res.status(400).json({ error: 'Unknown scenario' });
  busy = true;
  const run = { id: randomUUID(), scenario: req.body.scenario, status: 'running', stage: 'queued', log: [], createdAt: new Date().toISOString() };
  runs.unshift(run); res.status(202).json({ id: run.id }); void runScenario(run);
});
app.get('/api/private/:id', (req,res) => {
  // Deliberately explicit buyer view for local synthetic demo. Not an authenticated production endpoint.
  if (!privateInputs.has(req.params.id)) return res.status(404).json({ error: '本次本地会话没有私密样本，请重新运行案例。' });
  res.json(privateInputs.get(req.params.id));
});
app.get('/api/receipts/:id', (req,res) => {
  const receipt = receipts.find(x => x.orderId === req.params.id);
  if (!receipt) return res.sendStatus(404);
  res.setHeader('Content-Disposition', `attachment; filename="veilreceipt-${receipt.orderId}.json"`); res.json(receipt);
});
app.post('/api/receipts/:id/verify', async (req,res) => {
  const r = receipts.find(x => x.orderId === req.params.id);
  if (!r) return res.sendStatus(404);
  res.json(await verifyReceipt(chain, r));
});
// Verify the supplied portable artifact, without looking it up in the local receipt log.
// Trust is pinned to this deployment, never to addresses asserted by the uploaded file.
app.post('/api/verify', async (req,res) => {
  const r = req.body?.receipt;
  if (!r || typeof r !== 'object' || Array.isArray(r)) return res.status(400).json({ error: '请选择有效的 JSON 凭证文件。' });
  res.json(await verifyReceipt(chain, r));
});
app.post('/api/receipts/:id/replay', async (req,res) => {
  const r = receipts.find(x => x.orderId === req.params.id);
  if (!r) return res.sendStatus(404);
  try { await chain.escrow.settle.staticCall(r.orderId, r.message.responseCommitment, r.outcome, r.signature, r.proof); res.status(500).json({ blocked: false }); }
  catch (error) { res.json({ blocked: error.revert?.name === 'AlreadyFinalized', reason: error.revert?.name || 'Unknown rejection', mode: 'EVM preflight' }); }
});
app.post('/api/runs/:id/expire', async (req,res) => {
  if (busy) return res.status(409).json({ error: '请等待当前验收结束。' });
  const run = runs.find(x => x.id === req.params.id);
  if (!run?.orderId || run.status !== 'blocked') return res.status(400).json({ error: '没有待退款订单。' });
  busy = true;
  try {
    const order = await chain.escrow.orders(run.orderId);
    const block = await chain.provider.getBlock('latest');
    await chain.node.request({ method: 'evm_increaseTime', params: [Math.max(0, Number(order.deadline) - block.timestamp + 1)] });
    await chain.node.request({ method: 'evm_mine', params: [] });
    const tx = await chain.escrow.refundExpired(run.orderId);
    const mined = await tx.wait();
    run.status = 'expired'; run.refundTx = mined.hash;
    await stage(run, 'expired', '仅在本地测试链推进时钟，真实执行到期退款。没有将超时记为 Provider 违约。');
    res.json({ transactionHash: mined.hash });
  } finally { busy = false; }
});
const rpcAllow = new Set(['eth_chainId','eth_blockNumber','eth_getCode','eth_call','eth_getTransactionReceipt','eth_getTransactionByHash','eth_getBlockByNumber','eth_getBalance']);
app.post('/api/rpc', async (req,res) => {
  const request = req.body;
  if (!request || typeof request !== 'object' || Array.isArray(request) || typeof request.method !== 'string' || (request.params !== undefined && !Array.isArray(request.params))) return res.status(400).json({ error: 'Invalid RPC request' });
  if (!rpcAllow.has(request.method)) return res.status(403).json({ error: 'Read-only RPC' });
  try { res.json({ jsonrpc: '2.0', id: request.id, result: await chain.node.request({ method: request.method, params: request.params || [] }) }); }
  catch (error) { res.json({ jsonrpc: '2.0', id: request.id, error: { code: -32000, message: error.message } }); }
});
app.use('/api', (req,res) => res.status(404).json({ error: 'Not found' }));
if (process.env.NODE_ENV === 'production') app.use(express.static(path.join(root, 'dist')));
else {
  const vite = await createViteServer({ root, server: { middlewareMode: true, hmr: false }, appType: 'spa' });
  app.use(vite.middlewares);
}
app.use((err,req,res,next) => {
  if(err.type==='entity.parse.failed')return res.status(400).json({error:'请求必须是有效 JSON。'});
  if(err.type==='entity.too.large')return res.status(413).json({error:'请求超过 128 KB。'});
  console.error(err.message);res.status(500).json({error:'本地服务执行失败，请检查日志。'});
});
app.listen(port, '127.0.0.1', () => console.log(`VeilReceipt ready at http://127.0.0.1:${port}`));
