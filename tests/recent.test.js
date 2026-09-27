import test from 'node:test';
import assert from 'node:assert/strict';
import {createRecentCookies} from '../src/lib/recent-cookies.js';
import {identity} from '../src/lib/cookies.js';
import {preview,executeCleanupPlan} from '../src/lib/engine.js';
import {createQueue} from '../src/lib/state.js';

const HOUR=3600000;
const cookie=(name,domain='recent.test')=>({storeId:'0',name,domain,path:'/',value:`value-${name}`,hostOnly:true,secure:true,httpOnly:false,sameSite:'lax',session:true});
function fixture(initial,protectedSites=[]){
  let cookies=[...initial],sites=[...protectedSites],saved={};const calls=[];
  const api={
    cookies:{getAllCookieStores:async()=>[{id:'0'}],getAll:async query=>cookies.filter(c=>c.storeId===query.storeId&&(!query.name||c.name===query.name)&&(!query.url||new URL(query.url).hostname===c.domain)),get:async details=>cookies.find(c=>c.name===details.name&&c.storeId===details.storeId&&c.domain===new URL(details.url).hostname),remove:async details=>{const index=cookies.findIndex(c=>c.name===details.name&&c.storeId===details.storeId&&c.domain===new URL(details.url).hostname);if(index<0)return undefined;const [removed]=cookies.splice(index,1);calls.push(['cookie',removed.name]);return {name:removed.name,url:details.url};}},
    tabs:{query:async()=>[]},
    browsingData:{remove:async options=>calls.push(['origin',options.origins[0]])},
    storage:{local:{get:async()=>({sitekeepState:{protectedSites:sites,schedule:{mode:'disabled'},history:[]}}),set:async()=>{}},session:{get:async()=>saved,set:async data=>Object.assign(saved,structuredClone(data))}}
  };
  return {api,calls,cookies:()=>cookies,protect:host=>sites.push(host),add:c=>cookies.push(c),saved:()=>saved};
}
test('1, 2 and 24 hour previews include only observed cookies and no storage origins',async()=>{
  let now=100*HOUR;const a=cookie('a'),b=cookie('b'),c=cookie('c'),unknown=cookie('unknown');
  const f=fixture([a,b,c,unknown]),tracker=createRecentCookies(f.api,()=>now);
  try{
    for(const [item,age] of [[c,23],[b,1.5],[a,.5]]){now=(100-age)*HOUR;await tracker.observe({cookie:item,removed:false});}
    now=100*HOUR;
    for(const [hours,n] of [[1,1],[2,2],[24,3]]){
      const ids=await tracker.eligible(f.cookies(),hours),p=await preview(f.api,null,{recentIds:ids});
      assert.equal(p.summary.cookieCount,n);assert.equal(p.summary.temporalExcluded,4-n);
      assert.deepEqual(p.plan.origins,[]);assert.deepEqual(p.summary.types,['cookies']);
    }
    await tracker.flush();const stored=JSON.stringify(f.saved());
    assert.ok(!stored.includes('value-a')&&!stored.includes('recent.test'));
  }finally{tracker.stop();}
});
test('recent confirmation stays inside preview and excludes a new cookie',async()=>{
  let now=100*HOUR;const a=cookie('a'),newCookie=cookie('new');const f=fixture([a]),tracker=createRecentCookies(f.api,()=>now);
  try{
    await tracker.observe({cookie:a,removed:false});const ids=await tracker.eligible(f.cookies(),1),p=await preview(f.api,null,{recentIds:ids});
    f.add(newCookie);await tracker.observe({cookie:newCookie,removed:false});
    const result=await executeCleanupPlan(f.api,createQueue(),p.plan,null,'recent',{recentEligible:async item=>(await tracker.eligible([item],1)).has(identity(item))});
    assert.equal(result.cookiesDeleted,1);assert.deepEqual(f.cookies().map(c=>c.name),['new']);assert.ok(!f.calls.some(c=>c[0]==='origin'));
  }finally{tracker.stop();}
});
test('protection added after recent preview wins',async()=>{
  let now=100*HOUR;const a=cookie('a');const f=fixture([a]),tracker=createRecentCookies(f.api,()=>now);
  try{
    await tracker.observe({cookie:a,removed:false});const p=await preview(f.api,null,{recentIds:await tracker.eligible(f.cookies(),1)});
    f.protect('recent.test');
    const result=await executeCleanupPlan(f.api,createQueue(),p.plan,null,'recent',{recentEligible:async item=>(await tracker.eligible([item],1)).has(identity(item))});
    assert.equal(result.cookiesDeleted,0);assert.equal(f.cookies().length,1);
  }finally{tracker.stop();}
});
test('cookie aging out after preview is not deleted',async()=>{
  let now=100*HOUR;const a=cookie('a');const f=fixture([a]),tracker=createRecentCookies(f.api,()=>now);
  try{
    await tracker.observe({cookie:a,removed:false});const p=await preview(f.api,null,{recentIds:await tracker.eligible(f.cookies(),1)});
    now+=2*HOUR;
    const result=await executeCleanupPlan(f.api,createQueue(),p.plan,null,'recent',{recentEligible:async item=>(await tracker.eligible([item],1)).has(identity(item))});
    assert.equal(result.cookiesDeleted,0);assert.equal(f.cookies().length,1);
  }finally{tracker.stop();}
});
test('full cleanup does not use recent observations',async()=>{
  const f=fixture([cookie('unknown')]);const p=await preview(f.api);
  assert.equal(p.summary.cookieCount,1);assert.ok(p.plan.origins.length>0);
});
test('automatic cleanup builds a fresh full plan without recent metadata',async()=>{
  const f=fixture([cookie('unobserved')]);
  const result=await executeCleanupPlan(f.api,createQueue(),null,null,'automatic');
  assert.equal(result.cookiesDeleted,1);
  assert.equal(f.cookies().length,0);
  assert.ok(f.calls.some(call=>call[0]==='origin'));
});
test('a cookie revoked after preview cannot be removed',async()=>{
  const a=cookie('a'),f=fixture([a]),p=await preview(f.api);
  const result=await executeCleanupPlan(f.api,createQueue(),p.plan,null,'recent',{revokedIds:new Set([identity(a)])});
  assert.equal(result.cookiesDeleted,0);
  assert.equal(f.cookies().length,1);
});
