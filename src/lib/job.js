// Aggregate progress only: no hostnames, origins, cookie identities or values.
export const PROGRESS_KEY='sitekeepCleanupProgress';
export const PROGRESS_CHECKPOINT_MS=200;
const COUNTERS=['total','completed','cookiesTotal','cookiesCompleted','originsTotal','originsCompleted','cookiesDeleted','originsCleared','deleted','failed','skipped','percent','revision'];
const empty=()=>({state:'idle',operationId:null,source:null,phase:'idle',startedAt:null,finishedAt:null,interrupted:false,...Object.fromEntries(COUNTERS.map(key=>[key,0]))});
export function createCleanupJob(api,now=()=>Date.now()){
  let current=empty(),lastWrite=-Infinity;
  const session=api.storage.session;
  const persist=async(force=false)=>{
    if(!session||(!force&&now()-lastWrite<PROGRESS_CHECKPOINT_MS))return;
    await session.set({[PROGRESS_KEY]:{...current}});lastWrite=now();
  };
  const ready=(async()=>{
    if(!session)return;
    const saved=(await session.get(PROGRESS_KEY))[PROGRESS_KEY];
    if(!saved||!['idle','running','completed','failed'].includes(saved.state))return;
    current={...empty(),state:saved.state,operationId:typeof saved.operationId==='string'?saved.operationId.slice(0,64):null,
      source:['manual','recent','automatic'].includes(saved.source)?saved.source:null,
      phase:['idle','preparing','cookies','storage','finishing','done'].includes(saved.phase)?saved.phase:'idle',
      startedAt:Number.isFinite(saved.startedAt)?saved.startedAt:null,finishedAt:Number.isFinite(saved.finishedAt)?saved.finishedAt:null,interrupted:saved.interrupted===true};
    for(const key of COUNTERS)if(Number.isSafeInteger(saved[key])&&saved[key]>=0)current[key]=saved[key];
    current.percent=Math.min(100,current.percent);
    if(current.state==='running'){
      current={...current,state:'failed',interrupted:true,finishedAt:now(),revision:current.revision+1};
      await persist(true); // Never replay an interrupted destructive operation.
    }
  })();
  return {
    isRunning:()=>current.state==='running',
    async status(){await ready;return {...current};},
    async start(source,execute){
      await ready;
      if(current.state==='running')throw new Error('Ya hay una limpieza en curso');
      current={...empty(),state:'running',operationId:crypto.randomUUID(),source,phase:'preparing',startedAt:now(),revision:current.revision+1};
      try{
        await persist(true);
        const result=await execute(async progress=>{
          const phaseChanged=progress.phase!==current.phase;
          for(const key of COUNTERS)if(key!=='revision'&&Number.isSafeInteger(progress[key])&&progress[key]>=0)current[key]=progress[key];
          current={...current,phase:progress.phase,revision:current.revision+1};
          // A lost checkpoint must not turn an already executed API step into a retry.
          await persist(phaseChanged).catch(()=>{});
        });
        current={...current,state:'completed',phase:'done',completed:current.total,percent:100,finishedAt:now(),revision:current.revision+1};
        await persist(true).catch(()=>{});
        return result;
      }catch(error){
        current={...current,state:'failed',finishedAt:now(),revision:current.revision+1};
        await persist(true).catch(()=>{});throw error;
      }
    }
  };
}
