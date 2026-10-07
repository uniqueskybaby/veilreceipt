import test from 'node:test';
import assert from 'node:assert/strict';
import {runView} from '../src/model.js';
test('only a confirmed receipt announces payment',()=>{for(const stage of ['funding','signed','proving','verifying']){const v=runView({status:'running',stage,log:[]});assert.equal(v.money,'等待结算确认');assert.notEqual(v.title,'已付款')}assert.equal(runView(null,{outcome:true}).title,'已付款')});
test('a valid negative proof is distinct from invalid proof',()=>{const v=runView({}, {outcome:false});assert.equal(v.proof,'有效');assert.equal(v.acceptance,'不合格');assert.equal(v.money,'买方已收回款项')});
test('blocked and expired orders never invent a fault proof',()=>{assert.equal(runView({status:'blocked',orderId:'1'}).proof,'未形成');assert.equal(runView({status:'blocked',orderId:'1'}).money,'资金仍在托管');assert.equal(runView({status:'expired'}).acceptance,'未判定')});
