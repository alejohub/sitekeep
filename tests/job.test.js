import test from 'node:test';
import assert from 'node:assert/strict';
import {createCleanupJob,PROGRESS_KEY} from '../src/lib/job.js';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(initial){
  let saved=initial,time=1000;const writes=[];
  const api={storage:{session:{get:async()=>({[PROGRESS_KEY]:saved}),set:async data=>{saved=structuredClone(data[PROGRESS_KEY]);writes.push(saved);}}}};
  return {api,writes,now:()=>time,advance:n=>time+=n,saved:()=>saved};
}
test('central job starts at zero, checkpoints aggregates and ends at 100 even for empty plan',async()=>{
  const f=fixture(),job=createCleanupJob(f.api,f.now);
  await job.start('manual',async onProgress=>{
    assert.equal((await job.status()).percent,0);
    await onProgress({total:3,completed:0,phase:'cookies',cookiesTotal:1,originsTotal:2});
    f.advance(200);
    await onProgress({total:3,completed:1,percent:33,phase:'cookies',cookiesCompleted:1,cookiesDeleted:1,deleted:1});
    f.advance(200);
    await onProgress({total:3,completed:3,percent:100,phase:'storage',originsCompleted:2,originsCleared:1,deleted:2,failed:1});
    return {};
  });
  const final=await job.status();
  assert.equal(final.state,'completed');assert.equal(final.completed,3);assert.equal(final.percent,100);assert.equal(final.failed,1);
  assert.ok(final.operationId);assert.equal(f.writes[0].completed,0);
  for(let i=1;i<f.writes.length;i++)assert.ok(f.writes[i].completed>=f.writes[i-1].completed);
  const reopened=createCleanupJob(f.api,f.now);assert.equal((await reopened.status()).operationId,final.operationId);
  await reopened.start('automatic',async()=>({}));
  assert.equal((await reopened.status()).total,0);assert.equal((await reopened.status()).percent,100);
});
test('job refuses simultaneous starts before any API work and releases lock after failure',async()=>{
  const f=fixture(),job=createCleanupJob(f.api,f.now);let finish,secondCalls=0;
  const running=job.start('manual',()=>new Promise(resolve=>{finish=resolve;}));
  while(!finish)await tick();
  await assert.rejects(job.start('recent',()=>{secondCalls++;}),/en curso/);
  assert.equal(secondCalls,0);finish({});await running;
  await assert.rejects(job.start('manual',async()=>{throw Error('synthetic');}));
  assert.equal((await job.status()).state,'failed');assert.equal(job.isRunning(),false);
  await job.start('manual',async()=>({}));assert.equal((await job.status()).state,'completed');
});
test('worker restart reports interruption and does not replay destructive work',async()=>{
  const f=fixture({state:'running',operationId:'synthetic',source:'manual',phase:'storage',revision:9,total:8,completed:3,percent:37,startedAt:500,privateHost:'private.test'});
  const restarted=createCleanupJob(f.api,f.now),status=await restarted.status();
  assert.equal(status.state,'failed');assert.equal(status.interrupted,true);
  assert.equal(status.completed,3);assert.equal(status.percent,37);
  assert.equal(status.revision,10);assert.equal(status.finishedAt,1000);
  assert.ok(!JSON.stringify(f.saved()).includes('private.test'));
  assert.equal(restarted.isRunning(),false);
});
test('many cookie steps do not cause per-cookie storage checkpoints',async()=>{
  const f=fixture(),job=createCleanupJob(f.api,f.now);
  await job.start('manual',async onProgress=>{
    for(let n=0;n<=1000;n++){
      f.advance(1);
      await onProgress({total:1000,completed:n,percent:Math.floor(n/10),cookiesCompleted:n,cookiesDeleted:n,phase:'cookies',cookieValue:'never persist',host:'private.test'});
    }
    return {};
  });
  assert.ok(f.writes.length<=9);
  assert.equal(f.saved().cookiesCompleted,1000);
  assert.ok(!JSON.stringify(f.saved()).includes('private.test'));
  assert.ok(!JSON.stringify(f.saved()).includes('never persist'));
});
test('failure writing the initial checkpoint prevents destructive work',async()=>{
  let calls=0;const api={storage:{session:{get:async()=>({}),set:async()=>{throw Error('session unavailable');}}}};
  const job=createCleanupJob(api);
  await assert.rejects(job.start('manual',async()=>{calls++;}),/unavailable/);
  assert.equal(calls,0);assert.equal((await job.status()).state,'failed');
});
