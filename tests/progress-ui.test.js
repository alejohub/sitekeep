import test from 'node:test';
import assert from 'node:assert/strict';
import {startCleanupProgress,RESULT_VISIBLE_MS} from '../src/lib/progress-ui.js';
import {PROGRESS_KEY} from '../src/lib/job.js';
import {perform} from '../src/lib/ui.js';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(initial={state:'idle',revision:0}){
  const ids=['cleanup-progress','cleanup-progress-label','cleanup-progress-bar','cleanup-progress-stats','cleanup-progress-counts','notice','dialog-actions','clean-all','clean-recent','dry-recent','delete','protect','settings','interval','recent-hours'];
  const elements=Object.fromEntries(ids.map(id=>[id,{id,hidden:true,disabled:false,textContent:'',children:[]}]));
  elements['dialog-actions'].children=[{className:'danger',disabled:false}];
  let time=10000,status=initial,timerId=0;const timers=new Map(),listeners=new Set(),busyChanges=[];
  const clock={now:()=>time,setTimeout(fn,delay){const id=++timerId;timers.set(id,{fn,at:time+delay});return id;},clearTimeout(id){timers.delete(id);}};
  globalThis.document={getElementById:id=>elements[id]??null};
  globalThis.chrome={runtime:{sendMessage:async message=>{assert.equal(message.type,'status');return {ok:true,data:status};}},storage:{onChanged:{addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn)}}};
  const ui=startCleanupProgress(active=>{busyChanges.push(active);if(!active)for(const id of ['clean-all','delete','settings'])elements[id].disabled=false;},chrome,clock);
  return {ui,elements,timers,busyChanges,emit(p){status=p;for(const fn of listeners)fn({[PROGRESS_KEY]:{newValue:p}},'session');},async advance(n){time+=n;for(const [id,timer] of [...timers])if(timer.at<=time){timers.delete(id);await timer.fn();}await tick();}};
}
const active={state:'running',operationId:'synthetic',revision:1,phase:'cookies',startedAt:9000,total:10,completed:3,percent:30,cookiesDeleted:2,originsCleared:0,skipped:1,failed:0};
for(const page of ['popup','dashboard'])test(`${page}: reopening recovers active operation, completion shows 100 then hides`,async()=>{
  const f=fixture(active);
  try{
    await tick();assert.equal(f.elements['cleanup-progress'].hidden,false);
    assert.equal(f.elements['cleanup-progress-bar'].value,30);
    assert.equal(f.elements['delete'].disabled,true);assert.equal(f.elements['clean-all'].disabled,true);
    assert.equal(f.elements['dialog-actions'].children[0].disabled,true);
    f.emit({...active,state:'completed',phase:'done',revision:2,completed:10,percent:100,finishedAt:10000});
    assert.equal(f.elements['cleanup-progress'].hidden,false);assert.equal(f.elements['cleanup-progress-bar'].value,100);
    assert.deepEqual(f.busyChanges,[true,false]);assert.equal(f.elements['delete'].disabled,false);
    await f.advance(RESULT_VISIBLE_MS);
    assert.equal(f.elements['cleanup-progress'].hidden,true);assert.equal(f.timers.size,0);
    assert.match(f.elements.notice.textContent,/2 cookies eliminadas/);
  }finally{f.ui.stop();}
});
test('old terminal checkpoint occupies no space when page reopens',async()=>{
  const f=fixture({...active,state:'completed',revision:2,completed:10,percent:100,finishedAt:1000});
  try{await tick();assert.equal(f.elements['cleanup-progress'].hidden,true);assert.equal(f.timers.size,0);}finally{f.ui.stop();}
});
test('partial errors remain explicit and fatal interruption hides after brief result',async()=>{
  const f=fixture(active);
  try{
    await tick();f.emit({...active,state:'completed',revision:2,failed:1,completed:10,percent:100,finishedAt:10000});
    assert.match(f.elements['cleanup-progress-label'].textContent,/con errores/);assert.match(f.elements.notice.textContent,/1 fallidas/);
    f.emit({...active,state:'failed',revision:3,interrupted:true,finishedAt:10000});
    assert.match(f.elements.notice.textContent,/no se reanudó/);assert.equal(f.elements['cleanup-progress-bar'].value,30);
    await f.advance(RESULT_VISIBLE_MS);assert.equal(f.elements['cleanup-progress'].hidden,true);
  }finally{f.ui.stop();}
});
test('stale snapshot cannot regress active progress or re-enable conflicting actions',async()=>{
  const f=fixture(active);
  try{
    await tick();f.emit({...active,revision:3,completed:6,percent:60});f.ui.render({...active,revision:2,percent:30});
    assert.equal(f.elements['cleanup-progress-bar'].value,60);
    await perform(async()=>{},f.elements['clean-all']);
    assert.equal(f.elements['clean-all'].disabled,true);
  }finally{f.ui.stop();}
});
test('worker interruption can recover an older checkpoint without leaving UI busy',async()=>{
  const f=fixture({...active,revision:20,completed:7,percent:70});
  try{
    await tick();f.emit({...active,state:'failed',revision:12,interrupted:true,finishedAt:10000});
    assert.equal(f.ui.isRunning(),false);assert.match(f.elements.notice.textContent,/interrumpió/);
    f.ui.render({...active,revision:21});assert.equal(f.ui.isRunning(),false);
    f.emit({...active,operationId:'new-operation',revision:13,startedAt:10001});
    assert.equal(f.ui.isRunning(),true);
  }finally{f.ui.stop();}
});
