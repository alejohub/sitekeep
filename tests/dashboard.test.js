import test from 'node:test';
import assert from 'node:assert/strict';

class Element{
  constructor(tag='div'){this.tag=tag;this.children=[];this.value='';this.textContent='';this.hidden=false;this.disabled=false;}
  append(...children){this.children.push(...children);}
  replaceChildren(...children){this.children=[...children];}
  addEventListener(){}
  showModal(){this.open=true;}
  close(){this.open=false;}
  get lastChild(){return this.children.at(-1);}
}
const ids=['version','search','filter','sort','history-period','visits-heading','ranking-status','history-permission','rows','empty','metrics','interval','next','clean-all','clean-recent','dry-recent','recent-hours','history','refresh','settings','notice','dialog','dialog-title','dialog-body','dialog-actions','cleanup-progress','cleanup-progress-label','cleanup-progress-bar','cleanup-progress-stats','cleanup-progress-counts'];
const elements=Object.fromEntries(ids.map(id=>[id,new Element()]));
elements.filter.value='all';elements.sort.value='cookies';elements['history-period'].value='30';elements['recent-hours'].value='1';
globalThis.document={getElementById:id=>elements[id],createElement:tag=>new Element(tag)};
let granted=false,requests=0,searches=0;
const messages=[];
const storageListeners=[];
let cleanupProgress={state:'idle',revision:0};
globalThis.chrome={
  runtime:{getManifest:()=>({version:'0.1.0'}),sendMessage:async message=>{messages.push(message);return {ok:true,data:message.type==='status'?cleanupProgress:message.type==='preview'?{token:'test-preview',hosts:['a.test'],cookieCount:1,estimatedBytes:231,keptProtected:0,temporalExcluded:0,types:['cookies']}:{state:{protectedSites:[],schedule:{mode:'disabled'},history:[]},rows:[{host:'a.test',cookies:1,origins:['https://a.test'],protected:false,releasableBytes:231}],totalCookies:1,measured:{releasableBytes:231},running:cleanupProgress.state==='running',progress:cleanupProgress}};}},
  storage:{local:{get:async()=>({dashboardPreferences:{sort:'cookies',period:30}}),set:async()=>{}},onChanged:{addListener:fn=>storageListeners.push(fn)}},
  permissions:{contains:async()=>granted,request:()=>{requests++;return Promise.resolve(granted);},onRemoved:{addListener:()=>{}}}
};
const tick=()=>new Promise(resolve=>setTimeout(resolve,10));
await import('../src/options/options.js');
test('dashboard renders five KPI and table without history permission or API',async()=>{
  await tick();
  assert.equal(elements.metrics.children.length,5);
  assert.equal(elements.metrics.children[4].children[1].textContent,'≈ 231 B');
  assert.equal(elements.rows.children.length,1);
  assert.equal(elements.rows.children[0].children[3].textContent,'≈ 231 B');
  assert.equal(requests,0);assert.equal(elements.notice.textContent,'');
});
test('denied history keeps table and shows a discreet status',async()=>{
  elements.sort.value='visits';elements.sort.onchange();await tick();
  assert.equal(requests,1);assert.equal(elements.rows.children.length,1);
  assert.match(elements['ranking-status'].textContent,/acceso al historial/);
});
test('granted history sorts and displays visits',async()=>{
  granted=true;chrome.history={search:async()=>{searches++;return [{url:'https://a.test/path'}];},getVisits:async()=>[{visitId:'1',visitTime:Date.now()-1000,transition:'link'}],onVisited:{addListener:()=>{}},onVisitRemoved:{addListener:()=>{}}};
  elements.sort.onchange();await tick();
  assert.equal(searches,1);
  assert.equal(elements.rows.children[0].children[3].textContent,'1');
  assert.equal(elements.rows.children[0].children[4].textContent,'≈ 231 B');
});
test('recent actions use the selected time globally while clean all ignores it',async()=>{
  elements['recent-hours'].value='2';
  messages.length=0;
  elements['dry-recent'].onclick();await tick();
  assert.deepEqual(messages.find(m=>m.type==='preview'),{type:'preview',host:null,recentHours:2});
  messages.length=0;
  elements['clean-recent'].onclick();await tick();
  assert.deepEqual(messages.find(m=>m.type==='preview'),{type:'preview',host:null,recentHours:2});
  messages.length=0;
  elements['clean-all'].onclick();await tick();
  assert.deepEqual(messages.find(m=>m.type==='preview'),{type:'preview',host:null,recentHours:null});
});
test('dashboard receives shared progress and locks row/global actions until completion',async()=>{
  cleanupProgress={state:'running',operationId:'dashboard-operation',revision:1,total:10,completed:2,percent:20,startedAt:Date.now(),phase:'cookies'};
  for(const listener of storageListeners)listener({sitekeepCleanupProgress:{newValue:cleanupProgress}},'session');
  assert.equal(elements['clean-all'].disabled,true);assert.equal(elements['clean-recent'].disabled,true);
  assert.equal(elements.rows.children[0].lastChild.children[0].children[1].disabled,true);
  cleanupProgress={...cleanupProgress,state:'completed',revision:2,completed:10,percent:100,finishedAt:Date.now()};
  for(const listener of storageListeners)listener({sitekeepCleanupProgress:{newValue:cleanupProgress}},'session');
  await tick();assert.equal(elements['clean-all'].disabled,false);
  assert.equal(elements.rows.children[0].lastChild.children[0].children[1].disabled,false);
});
