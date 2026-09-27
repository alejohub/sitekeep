import test from 'node:test';
import assert from 'node:assert/strict';
import {discoverSiteData,buildCleanupPlan} from '../src/lib/sites.js';
import {estimateBytes} from '../src/lib/cookies.js';
import {formatBytes,formatEstimate} from '../src/lib/space.js';
import {preview} from '../src/lib/engine.js';

const cookie=(domain,value='value',hostOnly=false)=>({storeId:'0',name:'session',domain,path:'/',value,hostOnly,secure:true,httpOnly:false,sameSite:'lax',session:true});
const plan=(cookies,protectedSites=[],tabs=[])=>buildCleanupPlan(discoverSiteData(cookies,tabs.map(url=>({url})),protectedSites),cookies,protectedSites);
test('releasable bytes sum only cookies allowed by cleanup plan',()=>{
  const one=cookie('one.test'),two=cookie('two.test');
  assert.equal(plan([one,two]).measured.releasableBytes,estimateBytes(one)+estimateBytes(two));
  assert.equal(plan([one,two],['one.test']).measured.releasableBytes,estimateBytes(two));
});
test('site estimates partition the KPI without counting a shared cookie twice',()=>{
  const parent=cookie('.example.com','shared'),child=cookie('sub.example.com','local',true);
  const measured=plan([parent,child]).measured;
  assert.equal(measured.releasableByHost['example.com'],estimateBytes(parent));
  assert.equal(measured.releasableByHost['sub.example.com'],estimateBytes(child));
  assert.equal(Object.values(measured.releasableByHost).reduce((sum,n)=>sum+n,0),measured.releasableBytes);
  assert.equal(measured.releasableBytes,estimateBytes(parent)+estimateBytes(child));
});
test('protected rows show zero releasable bytes and estimates update immediately',()=>{
  const parent=cookie('.example.com','shared'),child=cookie('sub.example.com','local',true);
  const before=plan([parent,child]).measured;
  const protectedNow=plan([parent,child],['sub.example.com']).measured;
  assert.ok(before.releasableBytes>0);
  assert.equal(protectedNow.releasableByHost['sub.example.com']??0,0);
  assert.equal(protectedNow.releasableByHost['example.com']??0,0);
  assert.equal(protectedNow.releasableBytes,0);
  assert.equal(plan([parent,child]).measured.releasableBytes,before.releasableBytes);
});
test('protect and unprotect immediately change estimate',()=>{
  const item=cookie('child.example.com','abc',true);
  assert.equal(plan([item]).measured.releasableBytes,estimateBytes(item));
  assert.equal(plan([item],['example.com']).measured.releasableBytes,0);
  assert.equal(plan([item]).measured.releasableBytes,estimateBytes(item));
});
test('after cleanup inventory has zero measurable bytes',()=>{
  const before=plan([cookie('a.test')]).measured.releasableBytes;
  const after=plan([]).measured.releasableBytes;
  assert.ok(before>0);assert.equal(after,0);assert.equal(formatEstimate(after),'0 B');
});
test('cache and storage origins do not add fictional bytes',()=>{
  const p=plan([],[],['https://storage-only.test']);
  assert.equal(p.origins.length,1);assert.equal(p.measured.releasableBytes,0);
});
test('dry run and dashboard use one plan estimate',async()=>{
  const cookies=[cookie('a.test'),cookie('b.test')],rows=discoverSiteData(cookies,[],['b.test']);
  const dashboard=buildCleanupPlan(rows,cookies,['b.test']).measured.releasableBytes;
  const api={cookies:{getAllCookieStores:async()=>[{id:'0'}],getAll:async()=>cookies},tabs:{query:async()=>[]},storage:{local:{get:async()=>({sitekeepState:{protectedSites:['b.test'],schedule:{mode:'disabled'},history:[]}})}}};
  const dry=(await preview(api)).summary.estimatedBytes;
  assert.equal(dashboard,dry);assert.equal(dry,estimateBytes(cookies[0]));
});
test('format uses B, KB, MB, GB with controlled precision',()=>{
  assert.equal(formatBytes(231),'231 B');assert.equal(formatBytes(6554),'6.4 KB');
  assert.equal(formatBytes(18.2*1024*1024),'18.2 MB');assert.equal(formatBytes(1.3*1024**3),'1.3 GB');
  assert.equal(formatEstimate(231),'≈ 231 B');assert.equal(formatEstimate(0),'0 B');
});
