import {scheduleFromValue,scheduleValue,scheduleText} from '../lib/schedule.js';
import {$,date,node,request,perform,makeButton,showPreview} from '../lib/ui.js';
import {createHistoryCache,sortByVisits} from '../lib/history.js';
import {validatePreferences,historyPermission,requestHistoryFromGesture} from '../lib/history-settings.js';
import {formatEstimate} from '../lib/space.js';
import {startCleanupProgress} from '../lib/progress-ui.js';
$('version').textContent=`v${chrome.runtime.getManifest().version}`;
let snapshot,ranking={phase:'idle'},rankingRequest=0,historyTimer;
const progress=startCleanupProgress(active=>{
  if(snapshot){snapshot.running=active;setBusy(active);renderRows();}
  if(!active)perform(refresh);
});
function setBusy(active){for(const id of ['clean-all','clean-recent','dry-recent','settings','interval','recent-hours'])$(id).disabled=active;}
const historyCache=createHistoryCache({search:query=>chrome.history.search(query),getVisits:query=>chrome.history.getVisits(query)});
let historyListening=false;
function historyChanged(){historyCache.clear();clearTimeout(historyTimer);historyTimer=setTimeout(()=>perform(loadRanking),350);}
function attachHistoryListeners(){if(historyListening)return;chrome.history?.onVisited?.addListener(historyChanged);chrome.history?.onVisitRemoved?.addListener(historyChanged);historyListening=true;}
function preferences(){return validatePreferences({sort:$('sort').value,period:$('history-period').value==='all'?'all':Number($('history-period').value)});}
async function savePreferences(){await chrome.storage.local.set({dashboardPreferences:preferences()});}
async function loadPreferences(){const {dashboardPreferences}=await chrome.storage.local.get('dashboardPreferences');const saved=validatePreferences(dashboardPreferences);$('sort').value=saved.sort;$('history-period').value=String(saved.period);}
function rankingControls(){
  const active=$('sort').value==='visits',period=$('history-period').value;
  $('history-period').hidden=!active;$('visits-heading').hidden=!active;$('ranking-status').hidden=!active;
  $('visits-heading').textContent=period==='all'?'Visitas · todo el historial':`Visitas últimos ${period} días`;
  $('history-permission').hidden=!active||ranking.phase!=='permission';
  $('ranking-status').textContent=ranking.phase==='permission'?'El acceso al historial es necesario para ordenar por visitas. Puedes seguir usando la tabla.':ranking.phase==='loading'?'Consultando historial local…':ranking.phase==='error'?'No se pudo consultar el historial. Pulsa Actualizar para reintentar.':ranking.phase==='ready'?`Visitas registradas, incluidas recargas y sincronizadas; subframes excluidos.${ranking.result.truncated||ranking.result.missingTimes?' Recuento parcial (≥).':''}`:'';
}
async function loadRanking(){
  if(!snapshot||$('sort').value!=='visits')return;
  const current=++rankingRequest;ranking={phase:'loading'};renderRows();
  try{
    if(!await historyPermission(chrome.permissions)){ranking={phase:'permission'};renderRows();return;}
    attachHistoryListeners();
    const period=$('history-period').value==='all'?'all':Number($('history-period').value);
    const result=await historyCache.get(snapshot.rows.map(row=>row.host),period);
    if(current!==rankingRequest||$('sort').value!=='visits')return;
    ranking={phase:'ready',result};
  }catch{if(current!==rankingRequest)return;ranking={phase:'error'};}
  renderRows();
}
function renderRows(){
  rankingControls();
  const search=$('search').value.toLowerCase(),filter=$('filter').value,sort=$('sort').value;
  let rows=snapshot.rows.filter(row=>row.host.includes(search)&&(filter==='all'||(filter==='protected')===row.protected));
  rows=sort==='visits'&&ranking.phase==='ready'?sortByVisits(rows,ranking.result.byHostname):rows.sort((a,b)=>sort==='cookies'?b.cookies-a.cookies||a.host.localeCompare(b.host):a.host.localeCompare(b.host));
  $('rows').replaceChildren();$('empty').hidden=rows.length>0;
  for(const row of rows){
    const tr=node('tr'),actions=node('div',undefined,'actions');
    const exact=snapshot.state.protectedSites.includes(row.host);
    const toggle=makeButton(exact?'Quitar protección':row.protected?'Protegido por dominio superior':'Proteger',async()=>{await request('toggle',{host:row.host});await refresh();});
    toggle.disabled=row.protected&&!exact||snapshot.running;
    const clean=makeButton('Borrar datos',()=>showPreview(row.host,false,refresh),'danger');clean.disabled=row.protected||snapshot.running;
    actions.append(toggle,clean);
    tr.append(node('td',row.host,'table-data-cell'),node('td',String(row.cookies),'table-data-cell'),node('td',String(row.origins.length),'table-data-cell'));
    if(sort==='visits')tr.append(node('td',ranking.phase==='ready'?`${ranking.result.truncated||ranking.result.missingTimes?'≥ ':''}${row.visits}`:'—','table-data-cell'));
    const space=node('td',formatEstimate(row.releasableBytes??0),'table-data-cell');
    space.title=row.protected?'Sitio protegido: SiteKeep conserva sus datos.':'Estimación parcial de cookies eliminables; no incluye caché ni almacenamiento sin tamaño fiable.';
    tr.append(space);
    tr.append(node('td',row.protected?'Protegido':'No protegido'),node('td'));
    tr.lastChild.append(actions);$('rows').append(tr);
  }
}
async function refresh(){
  snapshot=await request('snapshot');const s=snapshot;
  $('metrics').replaceChildren();
  for(const [label,value] of [['Sitios conocidos',s.rows.length],['Sitios protegidos',s.state.protectedSites.length],['Sitios eliminables',s.rows.filter(r=>!r.protected).length],['Cookies detectadas',s.totalCookies],['Espacio liberable',formatEstimate(s.measured.releasableBytes)]]){
    const card=node('div',undefined,'card');card.append(node('span',label,'muted'),node('div',String(value),'metric'));$('metrics').append(card);
    if(label==='Espacio liberable')card.title='Estimación de cookies medibles que SiteKeep puede eliminar de forma segura. No incluye caché ni almacenamiento sin tamaño fiable.';
  }
  $('interval').value=scheduleValue({cleanupSchedule:s.state.schedule});
  $('next').textContent=scheduleText({cleanupSchedule:s.state.schedule},s.nextRun);
  if(s.progress)progress.render(s.progress);
  s.running=s.progress?progress.isRunning():s.running;
  setBusy(s.running);
  $('history').replaceChildren(...s.state.history.map(r=>node('li',`${date(r.at)} · ${r.source==='automatic'?'Automática':r.source==='recent'?'Reciente':'Manual'} · ${r.sites} sitios · ${r.cookiesDeleted} cookies · ${r.originsCleared} orígenes · ${r.failed} errores`)));
  if(!s.state.history.length)$('history').append(node('li','Todavía no hay limpiezas.'));
  renderRows();
  if($('sort').value==='visits')await loadRanking();
}
$('refresh').onclick=()=>perform(async()=>{historyCache.clear();await refresh();},$('refresh'));
$('clean-all').onclick=()=>perform(()=>showPreview(null,false,refresh),$('clean-all'));
$('dry-recent').onclick=()=>perform(()=>showPreview(null,true,refresh,Number($('recent-hours').value)),$('dry-recent'));
$('clean-recent').onclick=()=>perform(()=>showPreview(null,false,refresh,Number($('recent-hours').value)),$('clean-recent'));
$('settings').onclick=()=>perform(async()=>{await request('settings',{schedule:scheduleFromValue($('interval').value)});await refresh();},$('settings'));
for(const id of ['search','filter'])$(id).addEventListener('input',()=>{if(snapshot)renderRows();});
$('sort').onchange=()=>{
  // Call request in the direct user gesture, before any await.
  let grant;
  try{grant=$('sort').value==='visits'?requestHistoryFromGesture(chrome.permissions):null;}
  catch{ranking={phase:'permission'};renderRows();return;}
  perform(async()=>{await savePreferences();if(grant){let allowed=false;try{allowed=await grant;}catch{}ranking=allowed?{phase:'loading'}:{phase:'permission'};if(allowed)await loadRanking();else renderRows();}else{rankingRequest++;renderRows();}});
};
$('history-period').onchange=()=>perform(async()=>{await savePreferences();historyCache.clear();await loadRanking();});
$('history-permission').onclick=()=>{let grant;try{grant=requestHistoryFromGesture(chrome.permissions);}catch{ranking={phase:'permission'};renderRows();return;}perform(async()=>{let allowed=false;try{allowed=await grant;}catch{}if(allowed){await loadRanking();}else{ranking={phase:'permission'};renderRows();}});};
chrome.permissions.onRemoved.addListener(removed=>{if(removed.permissions?.includes('history')){historyCache.clear();rankingRequest++;ranking={phase:'permission'};if(snapshot)renderRows();}});
chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes.sitekeepState)perform(refresh);});
perform(async()=>{await loadPreferences();await refresh();});
