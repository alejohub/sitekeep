import test from 'node:test';
import assert from 'node:assert/strict';
import {watchLastNormalWindow} from '../src/lib/last-window.js';

function event(){const listeners=[];return {addListener:fn=>listeners.push(fn),removeListener:fn=>{const index=listeners.indexOf(fn);if(index>=0)listeners.splice(index,1);},emit:async value=>{for(const fn of [...listeners])await fn(value);}};}
test('last normal window survives service worker restart and fires once',async()=>{
  let saved={},windows=[{id:1,type:'normal'}],calls=0;
  const api={storage:{session:{get:async()=>saved,set:async data=>Object.assign(saved,structuredClone(data))}},windows:{getAll:async()=>windows,onCreated:event(),onRemoved:event()}};
  const stop=watchLastNormalWindow(api,async()=>calls++);
  for(let i=0;i<5;i++)await Promise.resolve();
  stop();windows=[];
  const stop2=watchLastNormalWindow(api,async()=>calls++);
  await api.windows.onRemoved.emit(1);await api.windows.onRemoved.emit(1);
  assert.equal(calls,1);assert.deepEqual(saved.lastNormalWindowState,{ids:[],fired:true});
  assert.ok(!JSON.stringify(saved).includes('url'));
  stop2();
});
