import test from 'node:test';
import assert from 'node:assert/strict';
const ids=['version','host','status','count','origins','protect','delete','clean-all','interval','next','dashboard','notice','dialog-actions','cleanup-progress','cleanup-progress-label','cleanup-progress-bar','cleanup-progress-stats','cleanup-progress-counts'];
const elements=Object.fromEntries(ids.map(id=>[id,{id,disabled:false,hidden:true,children:[]}]));
const listeners=[];
let progress={state:'running',operationId:'popup-operation',revision:1,phase:'storage',startedAt:Date.now(),total:5,completed:3,percent:60};
globalThis.document={getElementById:id=>elements[id]??null};
globalThis.chrome={runtime:{getManifest:()=>({version:'0.1.0'}),sendMessage:async message=>({ok:true,data:message.type==='status'?progress:{host:'synthetic.test',protectedSite:false,siteCookies:2,rows:[{host:'synthetic.test',origins:['https://synthetic.test']}],state:{schedule:{mode:'disabled'}},running:progress.state==='running',progress}})},storage:{onChanged:{addListener:fn=>listeners.push(fn)}}};
await import('../src/popup/popup.js');
const tick=()=>new Promise(resolve=>setTimeout(resolve,10));
test('opening popup during cleanup recovers shared status and restores controls after completion',async()=>{
  await tick();assert.equal(elements['cleanup-progress'].hidden,false);assert.equal(elements['cleanup-progress-bar'].value,60);
  assert.match(elements['cleanup-progress-label'].textContent,/almacenamiento/);
  assert.equal(elements.delete.disabled,true);assert.equal(elements['clean-all'].disabled,true);
  progress={...progress,state:'completed',revision:2,completed:5,percent:100,finishedAt:Date.now()};
  for(const listener of listeners)listener({sitekeepCleanupProgress:{newValue:progress}},'session');
  await tick();assert.equal(elements.delete.disabled,false);assert.equal(elements['clean-all'].disabled,false);
  assert.equal(elements['cleanup-progress-bar'].value,100);
});
