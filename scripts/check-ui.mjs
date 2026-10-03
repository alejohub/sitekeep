import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.SITEKEEP_NODE_MODULES?resolve(process.env.SITEKEEP_NODE_MODULES,'playwright'):'playwright');
const root=resolve('.');
const server=createServer(async(req,res)=>{if(req.url==='/favicon.ico'){res.writeHead(204);res.end();return;}try{const path=resolve(root,'.'+req.url.split('?')[0]);if(!path.startsWith(root+sep))throw Error('path');const data=await readFile(path);res.setHeader('Content-Type',({'.js':'text/javascript','.html':'text/html','.css':'text/css'})[extname(path)]??'application/octet-stream');res.end(data);}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser;
try{
 browser=await chromium.launch(process.env.SITEKEEP_BROWSER?{executablePath:process.env.SITEKEEP_BROWSER,headless:true}:{channel:'msedge',headless:true});
 for(const view of ['popup','options']){
  const page=await browser.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.stack));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.addInitScript(()=>{
   const f=globalThis.fixture={progress:{state:'idle',revision:0},protected:false,granted:false,messages:[],listeners:[],opened:false};
   const row=()=>({host:'synthetic.test',cookies:2,origins:['https://synthetic.test'],protected:f.protected,releasableBytes:f.protected?0:123});
   const check=(self,owner)=>{if(self!==owner)throw new TypeError('Illegal invocation');};
   const runtime={getManifest(){check(this,runtime);return {version:'0.1.1'};},async sendMessage(m){check(this,runtime);f.messages.push(m);let data;
    if(m.type==='status')data=f.progress;
    else if(m.type==='toggle'){f.protected=!f.protected;data=true;}
    else if(m.type==='settings')data=true;
    else if(m.type==='preview')data={token:'fake',hosts:f.protected?[]:['synthetic.test'],cookieCount:f.protected?0:2,estimatedBytes:f.protected?0:123,keptProtected:f.protected?1:0,temporalExcluded:0,types:['cookies']};
    else if(m.type==='clean')throw Error('Destructive execution forbidden in UI fixture');
    else data={host:'synthetic.test',protectedSite:f.protected,siteCookies:2,rows:[row()],state:{protectedSites:f.protected?['synthetic.test']:[],schedule:{mode:'disabled'},history:[]},totalCookies:2,measured:{releasableBytes:row().releasableBytes},running:f.progress.state==='running',progress:f.progress};
    return {ok:true,data};},openOptionsPage(){check(this,runtime);f.opened=true;}};
   const local={async get(){check(this,local);return {};},async set(){check(this,local);}};
   const onChanged={addListener(fn){check(this,onChanged);f.listeners.push(fn);},removeListener(fn){check(this,onChanged);f.listeners=f.listeners.filter(x=>x!==fn);}};
   const permissions={async contains(){check(this,permissions);return f.granted;},async request(){check(this,permissions);return f.granted;},onRemoved:{addListener(){}}};
   const history={async search(){check(this,history);return [{url:'https://synthetic.test/'}];},async getVisits(){check(this,history);return [{visitId:'1',visitTime:Date.now()-100,transition:'link'}];},onVisited:{addListener(){}},onVisitRemoved:{addListener(){}}};
   globalThis.chrome={runtime,storage:{local,onChanged},permissions,history};
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/src/${view}/index.html`);
  await page.waitForFunction(()=>document.querySelector('#notice').textContent===''&&(document.querySelector('#host')?.textContent==='synthetic.test'||document.querySelector('#rows')?.children.length===1));
  // Uses real Window timers, including cancellation, polling and terminal hiding.
  await page.evaluate(async()=>{
   const {startCleanupProgress}=await import('/src/lib/progress-ui.js');const p=startCleanupProgress();
   fixture.progress={state:'running',operationId:'native-timers',revision:1,startedAt:Date.now(),phase:'cookies',total:2,completed:0};
   p.render(fixture.progress);
   const calls=fixture.messages.filter(m=>m.type==='status').length;
   await new Promise(r=>setTimeout(r,550));
   if(fixture.messages.filter(m=>m.type==='status').length<=calls)throw Error('Progress poll did not run');
   p.render({state:'completed',operationId:'native-timers',revision:2,startedAt:Date.now(),finishedAt:Date.now(),total:2,completed:2,percent:100});
   await new Promise(r=>setTimeout(r,1600));
   if(!document.querySelector('#cleanup-progress').hidden)throw Error('Terminal progress did not hide');p.stop();fixture.progress={state:'idle',revision:0};
   document.querySelector('#notice').textContent='';for(const listener of fixture.listeners)listener({sitekeepState:{newValue:{}}},'local');
  });
  await page.waitForTimeout(50);
  if(view==='options'){
   await page.click('#refresh');await page.waitForTimeout(50);
   assert.equal(await page.locator('#metrics > *').count(),5);
   await page.fill('#search','absent');assert.equal(await page.locator('#rows > *').count(),0);
   await page.fill('#search','');await page.selectOption('#filter','protected');assert.equal(await page.locator('#rows > *').count(),0);
   await page.selectOption('#filter','all');
   await page.selectOption('#sort','visits');await page.waitForTimeout(50);
   assert.match(await page.locator('#ranking-status').textContent(),/acceso al historial/);
   await page.evaluate(()=>fixture.granted=true);await page.click('#history-permission');await page.waitForTimeout(50);
   assert.match(await page.locator('#ranking-status').textContent(),/Visitas registradas/);
   await page.locator('#rows button').first().click();await page.waitForTimeout(50);
   assert.equal(await page.locator('#rows button.danger').isDisabled(),true);
   await page.locator('#rows button').first().click();await page.waitForTimeout(50);
   await page.selectOption('#recent-hours','2');await page.click('#dry-recent');await page.waitForTimeout(50);
   assert.equal(await page.evaluate(()=>fixture.messages.findLast(m=>m.type==='preview').recentHours),2);
   await page.locator('#dialog-actions button').last().click();
   await page.click('#clean-recent');await page.waitForTimeout(50);
   assert.equal(await page.evaluate(()=>fixture.messages.findLast(m=>m.type==='preview').recentHours),2);
   await page.locator('#dialog-actions button').last().click();
  }else{
   assert.equal(await page.locator('#count').textContent(),'2');assert.equal(await page.locator('#origins').textContent(),'1');
   await page.click('#protect');await page.waitForTimeout(50);assert.equal(await page.locator('#delete').isDisabled(),true);
   await page.click('#protect');await page.waitForTimeout(50);assert.equal(await page.locator('#delete').isDisabled(),false);
   await page.click('#delete');await page.waitForTimeout(50);
   assert.equal(await page.evaluate(()=>fixture.messages.findLast(m=>m.type==='preview').host),'synthetic.test');
   await page.locator('#dialog-actions button').last().click();
   await page.selectOption('#interval','1440');await page.waitForTimeout(50);
   assert.equal(await page.evaluate(()=>fixture.messages.some(m=>m.type==='settings')),true);
   await page.click('#dashboard');assert.equal(await page.evaluate(()=>fixture.opened),true);
  }
  await page.click('#clean-all');await page.waitForTimeout(50);
  assert.deepEqual(await page.evaluate(()=>{const m=fixture.messages.findLast(m=>m.type==='preview');return [m.host,m.recentHours];}),[null,null]);
  await page.locator('#dialog-actions button').last().click();
  assert.equal(await page.evaluate(()=>fixture.messages.some(m=>m.type==='clean')),false);
  assert.equal(await page.locator('#notice').textContent(),'');
  assert.deepEqual(errors,[]);
  console.log(`${view}: OK — native timers, initial load, refresh/state, protection, preview and controls; zero console/page errors`);
  await page.close();
 }
}finally{await browser?.close();await new Promise(r=>server.close(r));}
