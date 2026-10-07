export const scenarioLabels = { valid: '合格交付', stale: '过期交付', 'low-quality': '样本不足', tampered: '篡改内容', forged: '伪造来源' };
export const stageLabels = { queued:'等待执行', funding:'资金托管', signed:'收到签署承诺', proving:'生成证明', verifying:'链上验证', settled:'结算确认', blocked:'交付拦截', error:'执行异常', interrupted:'执行中断', expired:'到期退款' };
export const checkLabels = {schema:'凭证格式','trusted-contract':'可信部署','provider-signature':'来源签名','order-binding':'订单与规则','public-inputs':'公开输入','zk-proof':'零知识证明','settlement-event':'结算事件','final-state':'最终状态','verification-error':'验证器拒绝'};
export const short = s => s ? `${s.slice(0,10)}…${s.slice(-6)}` : '尚未生成';
export async function api(url, body, signal) {
  const res = await fetch(url,{ ...(body === undefined ? {} : {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),signal:signal || AbortSignal.timeout(20000) });
  const value=await res.json(); if(!res.ok) throw new Error(value.error || '请求未完成'); return value;
}
export function readSession(key, fallback) {try{return JSON.parse(sessionStorage.getItem(key)) ?? fallback}catch{return fallback}}
export function saveSession(key,value) {try{sessionStorage.setItem(key,JSON.stringify(value))}catch{}}
export function runView(run, receipt) {
  if(receipt) return {title:receipt.outcome?'已付款':'已退款', tone:receipt.outcome?'success':'refund', detail:receipt.outcome?'私密内容满足约定，款项已发送给 Provider。':'私密内容未满足约定，款项已退还买方。', proof:'有效', acceptance:receipt.outcome?'合格':'不合格', money:receipt.outcome?'Provider 已收款':'买方已收回款项'};
  if(run?.status==='expired') return {title:'到期已退款',tone:'refund',detail:'未形成交付证明。到期退款不计为 Provider 违约。',proof:'未形成',acceptance:'未判定',money:'买方已收回款项'};
  if(run?.status==='blocked') return {title:run.stage==='error'?'执行异常':'已拦截',tone:'blocked',detail:run.explanation,proof:'未形成',acceptance:'未判定',money:run.orderId?'资金仍在托管':'尚无已确认订单'};
  if(run?.status==='running') return {title:stageLabels[run.stage] || '执行中',tone:'running',detail:run.log.at(-1)?.text || '等待执行真实验收。',proof:'待确认',acceptance:'待确认',money:'等待结算确认'};
  return {title:'等待交付',tone:'idle',detail:'开始一次真实验收。结算确认后，凭证才会出现。',proof:'待确认',acceptance:'待确认',money:'尚未发起订单'};
}
