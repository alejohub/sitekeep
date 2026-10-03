import {$,request,setCleanupBusy} from './ui.js';
import {PROGRESS_KEY} from './job.js';
export const RESULT_VISIBLE_MS=1500;
export function startCleanupProgress(onBusyChange=()=>{},api=chrome,clock={now:()=>Date.now(),setTimeout,clearTimeout}){
  let busy=false,stopped=false,pollTimer,hideTimer,lastRevision=-1,requestRevision=0,lastTerminal=null,lastOperationId=null,lastStartedAt=0,lastState='idle';
  function hide(){if(stopped)return;$('cleanup-progress').hidden=true;}
  function render(progress){
    if(stopped||!progress||!['idle','running','completed','failed'].includes(progress.state))return;
    if(progress.operationId===lastOperationId){
      if(lastState!=='running'&&lastState!=='idle'&&progress.state==='running')return;
      // A worker can recover an older checkpoint than the last live status.
      if((progress.revision??0)<lastRevision&&!(progress.state==='failed'&&progress.interrupted))return;
      lastRevision=Math.max(lastRevision,progress.revision??0);
    }else{
      if(lastOperationId&&(!progress.operationId||(progress.startedAt??0)<lastStartedAt))return;
      lastRevision=progress.revision??0;
    }
    lastOperationId=progress.operationId;lastStartedAt=progress.startedAt??0;lastState=progress.state;requestRevision++;
    clock.clearTimeout(pollTimer);clock.clearTimeout(hideTimer);pollTimer=hideTimer=undefined;
    const active=progress.state==='running';
    setCleanupBusy(active);
    const terminal=progress.state==='completed'||progress.state==='failed';
    const remaining=terminal?Math.max(0,RESULT_VISIBLE_MS-(clock.now()-(progress.finishedAt??0))):0;
    $('cleanup-progress').hidden=!active&&!remaining;
    const phase={preparing:'Preparando limpieza…',cookies:'Limpiando cookies…',storage:'Limpiando caché y almacenamiento…',finishing:'Guardando resultado…'};
    $('cleanup-progress-label').textContent=active?(phase[progress.phase]??'Limpiando…'):progress.state==='failed'?'Limpieza interrumpida':progress.failed?'Limpieza completada con errores':'Limpieza completada';
    $('cleanup-progress-bar').value=progress.percent??0;
    $('cleanup-progress-stats').textContent=active&&progress.phase==='preparing'?'Calculando las operaciones del plan…':`${progress.completed??0} de ${progress.total??0} operaciones procesadas · ${progress.percent??0} %`;
    $('cleanup-progress-counts').textContent=`${progress.cookiesDeleted??0} cookies eliminadas · ${progress.originsCleared??0} orígenes limpiados · ${progress.skipped??0} omitidas · ${progress.failed??0} fallidas`;
    const terminalKey=`${progress.operationId}:${progress.state}:${progress.interrupted===true}`;
    if(terminal&&lastTerminal!==terminalKey){
      lastTerminal=terminalKey;
      const counts=`${progress.cookiesDeleted??0} cookies eliminadas; ${progress.originsCleared??0} orígenes limpiados; ${progress.skipped??0} omitidas; ${progress.failed??0} fallidas.`;
      $('notice').textContent=progress.state==='failed'?`${progress.interrupted?'La limpieza se interrumpió al reiniciar el servicio; no se reanudó.':'No se pudo completar la limpieza.'} Resultado parcial: ${counts}${progress.source==='automatic'?'':' Genera una nueva vista previa.'}`:`Limpieza${progress.failed?' con errores':''}: ${counts}`;
    }
    if(active){
      for(const id of ['clean-all','clean-recent','dry-recent','delete','settings','interval','recent-hours','protect'])if($(id))$(id).disabled=true;
      for(const action of $('dialog-actions')?.children??[])if(action.className==='danger')action.disabled=true;
      pollTimer=clock.setTimeout(poll,500);pollTimer.unref?.();
    }else if(remaining){hideTimer=clock.setTimeout(hide,remaining);hideTimer.unref?.();}
    if(active!==busy){busy=active;onBusyChange(active);}
  }
  async function poll(){
    const before=requestRevision;
    try{const progress=await request('status');if(!stopped&&before===requestRevision)render(progress);}
    catch{if(!stopped&&busy&&before===requestRevision){pollTimer=clock.setTimeout(poll,500);pollTimer.unref?.();}}
  }
  const changed=(changes,area)=>{if(area==='session'&&changes[PROGRESS_KEY])render(changes[PROGRESS_KEY].newValue);};
  api.storage.onChanged.addListener(changed);
  function stop(){stopped=true;requestRevision++;clock.clearTimeout(pollTimer);clock.clearTimeout(hideTimer);api.storage.onChanged.removeListener?.(changed);globalThis.removeEventListener?.('pagehide',stop);}
  globalThis.addEventListener?.('pagehide',stop,{once:true});
  poll();
  return {render,stop,isRunning:()=>busy};
}
