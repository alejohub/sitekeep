import {scheduleFromValue,scheduleValue,scheduleText} from '../lib/schedule.js';
import {$,request,perform,showPreview} from '../lib/ui.js';
import {startCleanupProgress} from '../lib/progress-ui.js';
$('version').textContent=`v${chrome.runtime.getManifest().version}`;
let snapshot;
const progress=startCleanupProgress(active=>{
  if(snapshot){snapshot.running=active;setBusy();}
  if(!active)perform(refresh);
});
function setBusy(){
  const s=snapshot;
  $('protect').disabled=!s.host||s.running;
  $('delete').disabled=!s.host||s.protectedSite||s.running;
  $('clean-all').disabled=s.running;
  $('interval').disabled=s.running;
}
async function refresh(){
  snapshot=await request('snapshot');const s=snapshot,host=s.host;
  $('host').textContent=host||'Página no compatible';
  $('status').textContent=host?(s.protectedSite?'Protegido':'No protegido'):'';
  $('status').className=`status${s.protectedSite?' good':''}`;
  $('status').hidden=!host;
  $('count').textContent=host?s.siteCookies:'—';
  $('origins').textContent=host?s.rows.find(r=>r.host===host)?.origins.length??0:'—';
  $('protect').textContent=s.protectedSite?'Quitar protección':'Proteger sitio';
  if(s.progress)progress.render(s.progress);
  s.running=s.progress?progress.isRunning():s.running;
  setBusy();
  $('interval').value=scheduleValue({cleanupSchedule:s.state.schedule});
  $('next').textContent=scheduleText({cleanupSchedule:s.state.schedule},s.nextRun);
}
$('protect').onclick=()=>perform(async()=>{await request('toggle',{host:snapshot.host});await refresh();},$('protect'));
$('delete').onclick=()=>perform(()=>showPreview(snapshot.host,false,refresh),$('delete'));
$('clean-all').onclick=()=>perform(()=>showPreview(null,false,refresh),$('clean-all'));
$('dashboard').onclick=()=>chrome.runtime.openOptionsPage();
$('interval').onchange=()=>perform(async()=>{await request('settings',{schedule:scheduleFromValue($('interval').value)});await refresh();},$('interval'));
chrome.storage.onChanged.addListener((_changes,area)=>{if(area==='local')perform(refresh);});
perform(refresh);
