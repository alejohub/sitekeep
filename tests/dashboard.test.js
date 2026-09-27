import test from 'node:test';
import assert from 'node:assert/strict';

class Element{
  constructor(tag='div'){this.tag=tag;this.children=[];this.value='';this.textContent='';this.hidden=false;this.disabled=false;}
  append(...children){this.children.push(...children);}
  replaceChildren(...children){this.children=[...children];}
  addEventListener(){}
  get lastChild(){return this.children.at(-1);}
}
const ids=['version','search','filter','sort','history-period','visits-heading','ranking-status','history-permission','rows','empty','metrics','interval','next','clean-all','dry','clean-recent','dry-recent','recent-hours','history','refresh','settings','notice','dialog','dialog-title','dialog-body','dialog-actions'];
const elements=Object.fromEntries(ids.map(id=>[id,new Element()]));
elements.filter.value='all';elements.sort.value='cookies';elements['history-period'].value='30';elements['recent-hours'].value='1';
globalThis.document={getElementById:id=>elements[id],createElement:tag=>new Element(tag)};
let granted=false,requests=0,searches=0;
globalThis.chrome={
  runtime:{getManifest:()=>({version:'0.1.0'}),sendMessage:async()=>({ok:true,data:{state:{protectedSites:[],schedule:{mode:'disabled'},history:[]},rows:[{host:'a.test',cookies:1,origins:['https://a.test'],protected:false,releasableBytes:231}],totalCookies:1,measured:{releasableBytes:231},running:false}})},
  storage:{local:{get:async()=>({dashboardPreferences:{sort:'cookies',period:30}}),set:async()=>{}},onChanged:{addListener:()=>{}}},
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
