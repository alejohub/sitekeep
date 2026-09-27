import {normalizeHost,pageHost,applies} from '../lib/domains.js';
import {protectedHost,buildCleanupPlan} from '../lib/sites.js';
import {discover,preview,executeCleanupPlan} from '../lib/engine.js';
import {readState,saveState,createQueue} from '../lib/state.js';
import {validateSchedule} from '../lib/schedule.js';
import {watchLastNormalWindow} from '../lib/last-window.js';
import {createRecentCookies,RECENT_HOURS} from '../lib/recent-cookies.js';
import {identity} from '../lib/cookies.js';
import {inventory} from '../lib/compat.js';

const api=chrome,queue=createQueue(),previews=new Map(),ALARM='sitekeep-clean';
const recentCookies=createRecentCookies(api);
let running=false,activeRevoked=null;
async function ensureAlarm(){
  const state=await readState(api);
  if(state.schedule.mode!=='interval'){await api.alarms.clear(ALARM);return;}
  const current=await api.alarms.get(ALARM);
  if(!current || current.periodInMinutes!==state.schedule.interval){
    await api.alarms.create(ALARM,{delayInMinutes:state.schedule.interval,periodInMinutes:state.schedule.interval});
  }
}
async function run(authorization=null,host=null,source='manual',recentHours=null){
  if(running)throw new Error('Ya hay una limpieza en curso');
  running=true;activeRevoked=new Set();
  try{return await executeCleanupPlan(api,queue,authorization,host,source,{revokedIds:activeRevoked,recentEligible:recentHours===null?null:async cookie=>(await recentCookies.eligible([cookie],recentHours)).has(identity(cookie))});}
  finally{running=false;activeRevoked=null;}
}
async function handle(message){
  if(!message || typeof message.type!=='string')throw new Error('Solicitud inválida');
  if(message.type==='snapshot'){
    const [data,active,alarm]=await Promise.all([discover(api),api.tabs.query({active:true,currentWindow:true}),api.alarms.get(ALARM)]);
    const host=pageHost(active[0]?.url),protectedSite=!!host&&protectedHost(host,data.state.protectedSites);
    const siteCookies=host?data.cookies.filter(c=>applies(c,host)).length:0;
    const plan=buildCleanupPlan(data.rows,data.cookies,data.state.protectedSites);
    const rows=data.rows.map(row=>({...row,releasableBytes:plan.measured.releasableByHost[row.host]??0}));
    return {state:data.state,host,protectedSite,siteCookies,rows,totalCookies:data.cookies.length,measured:plan.measured,running,nextRun:alarm?.scheduledTime};
  }
  if(message.type==='toggle'){
    const host=normalizeHost(message.host);
    return queue(async()=>{
      const state=await readState(api),exact=state.protectedSites.includes(host);
      if(!exact && protectedHost(host,state.protectedSites))throw new Error('Este sitio está protegido por un dominio superior. Quítalo desde el dashboard.');
      state.protectedSites=exact?state.protectedSites.filter(h=>h!==host):[...state.protectedSites,host].sort();
      await saveState(api,state);return true;
    });
  }
  if(message.type==='preview'){
    const host=message.host?normalizeHost(message.host):null;
    const recentHours=message.recentHours??null;
    if(recentHours!==null&&!RECENT_HOURS.includes(recentHours))throw new Error('Periodo reciente inválido');
    const recentIds=recentHours===null?null:await recentCookies.eligible(await inventory(api),recentHours);
    const generated=await preview(api,host,{recentIds}),token=crypto.randomUUID();
    previews.set(token,{host,recentHours,at:Date.now(),plan:generated.plan});
    for(const [key,p] of previews)if(Date.now()-p.at>600000)previews.delete(key);
    while(previews.size>32)previews.delete(previews.keys().next().value);
    return {token,recentHours,...generated.summary};
  }
  if(message.type==='clean'){
    const saved=previews.get(message.token),host=message.host?normalizeHost(message.host):null;
    const recentHours=message.recentHours??null;
    if(!saved || saved.host!==host || saved.recentHours!==recentHours || Date.now()-saved.at>600000)throw new Error('Vista previa caducada o de otro alcance. Genera una nueva.');
    previews.delete(message.token);
    return run(saved.plan,host,recentHours===null?'manual':'recent',recentHours);
  }
  if(message.type==='settings'){
    const schedule=validateSchedule(message.schedule);
    await queue(async()=>{const state=await readState(api);state.schedule=schedule;await saveState(api,state);await api.alarms.clear(ALARM);await ensureAlarm();});
    return true;
  }
  throw new Error('Acción desconocida');
}
api.runtime.onMessage.addListener((message,sender,respond)=>{
  if(sender.id!==api.runtime.id || !sender.url?.startsWith(api.runtime.getURL('')))return false;
  handle(message).then(data=>respond({ok:true,data}),error=>respond({ok:false,error:error.message}));return true;
});
api.alarms.onAlarm.addListener(alarm=>{
  if(alarm.name!==ALARM)return;
  readState(api).then(state=>state.schedule.mode==='interval'&&!running?run(null,null,'automatic'):null).catch(()=>{});
});
api.runtime.onStartup.addListener(()=>ensureAlarm().catch(()=>{}));
api.runtime.onInstalled.addListener(()=>ensureAlarm().catch(()=>{}));
ensureAlarm().catch(()=>{});
api.cookies.onChanged.addListener(change=>{
  recentCookies.observe(change);
  if(change?.cookie){const id=identity(change.cookie);activeRevoked?.add(id);for(const saved of previews.values())saved.plan.cookies=saved.plan.cookies.filter(c=>identity(c)!==id);}
});
watchLastNormalWindow(api,async()=>{
  const [state,windows]=await Promise.all([readState(api),api.windows.getAll({windowTypes:['normal']})]);
  if(state.schedule.mode==='lastWindowClosed'&&!windows.some(w=>w.type==='normal')&&!running)await run(null,null,'automatic');
});
