import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';

// An explicitly selected running local demo is required; this suite never starts an order.
const origin=process.env.VEIL_TEST_URL;
if(!origin)throw new Error('Set VEIL_TEST_URL to the running local review server.');
const post=(route,body,headers={})=>fetch(origin+route,{method:'POST',headers:{'content-type':'application/json',...headers},body});
test('malformed and missing request bodies return client errors',async()=>{
 for(const [route,body]of [['/api/run','{}'],['/api/run',undefined],['/api/rpc','{}'],['/api/rpc','[]'],['/api/rpc',undefined],['/api/verify','{}'],['/api/verify','{']]){
  const r=await post(route,body);assert.equal(r.status,400,route);assert.equal(typeof (await r.json()).error,'string');
 }
});
test('oversized JSON is rejected before verification',async()=>{
 const r=await post('/api/verify',JSON.stringify({receipt:'x'.repeat(140000)}));assert.equal(r.status,413);
});
test('foreign origins and host names are rejected',async()=>{
 assert.equal((await post('/api/run','{}',{origin:'https://example.invalid'})).status,403);
 const code=await new Promise((resolve,reject)=>{const req=request(new URL('/api/state',origin),{headers:{host:'example.invalid'}},res=>{res.resume();resolve(res.statusCode)});req.on('error',reject);req.end()});
 assert.equal(code,403);
});
test('RPC proxy is read-only and rejects malformed parameters',async()=>{
 assert.equal((await post('/api/rpc',JSON.stringify({method:'eth_sendTransaction',params:[]}))).status,403);
 assert.equal((await post('/api/rpc',JSON.stringify({method:'evm_increaseTime',params:[1]}))).status,403);
 assert.equal((await post('/api/rpc',JSON.stringify({method:'eth_chainId',params:{}}))).status,400);
 const r=await post('/api/rpc',JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_chainId',params:[]}));assert.equal(r.status,200);assert.equal((await r.json()).result,'0x7a69');
});
test('public state does not expose private response fields',async()=>{
 const r=await fetch(origin+'/api/state');assert.equal(r.status,200);const text=await r.text();
 for(const key of ['request_salt','response_salt','price_micros','confidence_bps','observed_at'])assert.ok(!text.includes('"'+key+'"'),key);
});
