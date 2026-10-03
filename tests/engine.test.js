import test from 'node:test';
import assert from 'node:assert/strict';
import {discoverSiteData,buildCleanupPlan,protectedHost} from '../src/lib/sites.js';
import {executeCleanupPlan,preview} from '../src/lib/engine.js';
import {createQueue} from '../src/lib/state.js';

const cookie=(domain,value='v')=>({storeId:'0',name:'session',domain,path:'/',value,hostOnly:false,secure:true,httpOnly:false,sameSite:'lax',session:true});
function fake({cookies=[],tabs=[],protectedSites=[]}={}){
  let list=cookies.map(c=>({...c})),sites=[...protectedSites];
  const calls=[];
  const api={
    tabs:{query:async()=>tabs.map(url=>({url}))},
    cookies:{
      getAllCookieStores:async()=>[...new Set(list.map(c=>c.storeId))].map(id=>({id})),
      getAll:async query=>list.filter(c=>c.storeId===query.storeId && (!query.name||c.name===query.name) && (!query.url||new URL(query.url).hostname===c.domain.replace(/^\./,''))),
      get:async details=>list.find(c=>c.name===details.name&&c.domain.replace(/^\./,'')===new URL(details.url).hostname),
      remove:async details=>{const index=list.findIndex(c=>c.name===details.name&&c.domain.replace(/^\./,'')===new URL(details.url).hostname);if(index<0)return undefined;list.splice(index,1);calls.push(['cookie',details.url]);return {url:details.url,name:details.name};}
    },
    browsingData:{remove:async(options,types)=>{calls.push(['origin',options.origins[0],types]);}},
    storage:{local:{get:async()=>({sitekeepState:{protectedSites:sites,schedule:{mode:'disabled'},history:[]}}),set:async()=>{}}}
  };
  return {api,calls,protect:host=>sites.push(host),cookies:()=>list};
}

test('hostname boundaries and descendant protection',()=>{
  assert.equal(protectedHost('www.example.com',['example.com']),true);
  assert.equal(protectedHost('evil-example.com',['example.com']),false);
  assert.equal(protectedHost('evilreddit.com',['reddit.com']),false);
});
test('discovery and policy preserve protected sites',()=>{
  const cookies=[cookie('.example.com'),cookie('evil-example.com')];
  const rows=discoverSiteData(cookies,[{url:'https://www.example.com/x'},{url:'https://evil-example.com'}],['example.com']);
  const plan=buildCleanupPlan(rows,cookies,['example.com']);
  assert.ok(!plan.hosts.includes('www.example.com'));
  assert.ok(plan.hosts.includes('evil-example.com'));
  assert.ok(plan.cookies.every(c=>c.domain!==' .example.com' && c.domain!=='.example.com'));
});
test('manual preview does not admit a newly discovered site',async()=>{
  const data=fake({tabs:['https://one.example']});const initial=await preview(data.api);
  data.api.tabs.query=async()=>[{url:'https://one.example'},{url:'https://new.example'}];
  await executeCleanupPlan(data.api,createQueue(),initial.plan);
  assert.ok(data.calls.some(c=>c[1]==='https://one.example'));
  assert.ok(!data.calls.some(c=>c[1]==='https://new.example'));
});
test('protection added after preview wins',async()=>{
  const data=fake({cookies:[cookie('example.com')],tabs:['https://example.com']});
  const initial=await preview(data.api);data.protect('example.com');
  await executeCleanupPlan(data.api,createQueue(),initial.plan);
  assert.deepEqual(data.calls,[]);
  assert.equal(data.cookies().length,1);
});
test('global cleanup processes only unprotected origins',async()=>{
  const data=fake({tabs:['https://keep.example','https://clear.example'],protectedSites:['keep.example']});
  await executeCleanupPlan(data.api,createQueue(),null,null,'automatic');
  assert.deepEqual(data.calls.filter(c=>c[0]==='origin'),[]);
});
test('single site cleanup does not process another site',async()=>{
  const data=fake({tabs:['https://one.example','https://two.example']});
  await executeCleanupPlan(data.api,createQueue(),null,'one.example');
  assert.deepEqual(data.calls.filter(c=>c[0]==='origin').map(c=>c[1]),['https://one.example']);
});
test('partial API failure leaves other origin processing intact',async()=>{
  const data=fake({tabs:['https://bad.example','https://good.example']});
  data.api.browsingData.remove=async options=>{if(options.origins[0]==='https://bad.example')throw new Error('permission denied');data.calls.push(['origin',options.origins[0]]);};
  const result=await executeCleanupPlan(data.api,createQueue());
  assert.equal(result.failed,1);assert.ok(data.calls.some(c=>c[1]==='https://good.example'));
});
test('inventory includes cookies from multiple stores',async()=>{
  const second={...cookie('second.example'),storeId:'1'};
  const data=fake({cookies:[cookie('first.example'),second]});
  const plan=await preview(data.api);
  assert.equal(plan.summary.cookieCount,2);
});
test('a fresh worker plan reads the latest protection',async()=>{
  const data=fake({tabs:['https://later.example']});
  assert.equal((await preview(data.api)).summary.hosts.length,1);
  data.protect('later.example');
  assert.equal((await preview(data.api)).summary.hosts.length,0);
});
test('individual cleanup of a protected site has no effects',async()=>{
  const data=fake({tabs:['https://keep.example'],cookies:[cookie('keep.example')],protectedSites:['keep.example']});
  const result=await executeCleanupPlan(data.api,createQueue(),null,'keep.example');
  assert.equal(result.cookiesDeleted,0);assert.equal(result.originsCleared,0);assert.deepEqual(data.calls,[]);
});
test('parent site cleanup includes a child host-only cookie',()=>{
  const child={...cookie('www.example.com'),hostOnly:true};
  const rows=discoverSiteData([child],[{url:'https://example.com'}],[]);
  const plan=buildCleanupPlan(rows,[child],[],'example.com');
  assert.equal(plan.cookies.length,1);
});
test('missing browsingData permission fails without a global fallback',async()=>{
  const data=fake({tabs:['https://one.example']});
  delete data.api.browsingData;
  const result=await executeCleanupPlan(data.api,createQueue());
  assert.equal(result.failed,1);assert.equal(result.originsCleared,0);
});
test('real progress counts cookies and opaque origin calls, including partial failures',async()=>{
  const data=fake({cookies:[cookie('one.example')]}),updates=[];
  data.api.browsingData.remove=async options=>{if(options.origins[0].startsWith('http:'))throw Error('synthetic failure');};
  const result=await executeCleanupPlan(data.api,createQueue(),null,null,'manual',{onProgress:p=>updates.push({...p})});
  assert.equal(updates[0].completed,0);assert.equal(updates[0].percent,0);
  assert.equal(updates[0].total,3);
  const last=updates.at(-1);
  assert.equal(last.completed,3);assert.equal(last.percent,100);
  assert.equal(last.cookiesCompleted,1);assert.equal(last.originsCompleted,2);
  assert.equal(last.deleted,2);assert.equal(last.failed,1);assert.equal(last.skipped,0);
  assert.equal(result.failed,1);
  for(let i=1;i<updates.length;i++){assert.ok(updates[i].completed>=updates[i-1].completed);assert.ok(updates[i].percent>=updates[i-1].percent);}
  assert.ok(updates.some(p=>p.phase==='storage'&&p.completed===1));
});
test('protection added during execution produces omissions without losing progress steps',async()=>{
  const data=fake({cookies:[cookie('first.example'),cookie('second.example')]}),updates=[];
  const original=data.api.cookies.remove;
  data.api.cookies.remove=async details=>{const result=await original(details);data.protect('second.example');return result;};
  const result=await executeCleanupPlan(data.api,createQueue(),null,null,'automatic',{onProgress:p=>updates.push({...p})});
  assert.equal(result.cookiesDeleted,1);assert.equal(data.cookies().length,1);
  assert.equal(result.skipped,5);assert.equal(updates.at(-1).total,6);
  assert.equal(updates.at(-1).completed,6);assert.equal(updates.at(-1).percent,100);
  assert.equal(updates.at(-1).skipped,5);
});
test('an opaque Chromium call counts one step only after its response',async()=>{
  const data=fake({tabs:['https://synthetic.example']}),updates=[];let finish;
  data.api.browsingData.remove=()=>new Promise(resolve=>{finish=resolve;});
  const running=executeCleanupPlan(data.api,createQueue(),null,null,'manual',{onProgress:p=>updates.push({...p})});
  while(!finish)await new Promise(resolve=>setImmediate(resolve));
  assert.equal(updates.at(-1).phase,'storage');assert.equal(updates.at(-1).completed,0);assert.equal(updates.at(-1).total,1);
  finish();await running;
  assert.equal(updates.at(-1).completed,1);assert.equal(updates.at(-1).percent,100);
});
