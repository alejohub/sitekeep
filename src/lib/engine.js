import {inventory} from './compat.js';
import {discoverSiteData,buildCleanupPlan,protectedHost} from './sites.js';
import {readState,saveState} from './state.js';
import {identity,removalDetails,inRemovalScope} from './cookies.js';
import {isProtected} from './domains.js';

export const DATA_TYPES={cache:true,cacheStorage:true,fileSystems:true,indexedDB:true,localStorage:true,serviceWorkers:true};
export async function discover(api){
  const [cookies,tabs,state]=await Promise.all([inventory(api),api.tabs.query({}),readState(api)]);
  return {cookies,rows:discoverSiteData(cookies,tabs,state.protectedSites),state};
}
export async function preview(api,host=null,options={}){
  const {cookies,rows,state}=await discover(api);
  const recentIds=options.recentIds??null;
  const plan=buildCleanupPlan(rows,cookies,state.protectedSites,host,c=>!recentIds||recentIds.has(identity(c)));
  if(recentIds){plan.origins=[];plan.hosts=Object.keys(plan.measured.releasableByHost).sort();}
  const temporalExcluded=recentIds?cookies.filter(c=>!recentIds.has(identity(c))).length:0;
  return {plan,summary:{hosts:plan.hosts,origins:plan.origins,cookieCount:plan.cookies.length,keptProtected:plan.keptProtected,estimatedBytes:plan.measured.releasableBytes,temporalExcluded,types:recentIds?['cookies']:state.protectedSites.length?['cookies']:['cookies',...Object.keys(DATA_TYPES)]}};
}

async function removeCookieSafely(api,candidate,allowedIds,sites,revokedIds){
  const id=identity(candidate),details=removalDetails(candidate);
  if(revokedIds?.has(id))return 'skipped';
  const query={storeId:candidate.storeId,name:candidate.name,partitionKey:{}};
  const current=(await api.cookies.getAll(query)).find(c=>identity(c)===id);
  if(!current || isProtected(current,sites))return 'skipped';
  const scope=await api.cookies.getAll({...query,url:details.url});
  const impacted=scope.filter(c=>inRemovalScope(c,current,details));
  if(!impacted.length || impacted.some(c=>isProtected(c,sites)||!allowedIds.has(identity(c))||revokedIds?.has(identity(c))))return 'skipped';
  const selected=await api.cookies.get(details);
  if(!selected || identity(selected)!==id)return 'skipped';
  if(revokedIds?.has(id))return 'skipped';
  const removed=await api.cookies.remove(details);
  return removed?'deleted':'skipped';
}

// queue serializes protection edits with each irreversible API call.
export async function executeCleanupPlan(api,queue,authorization=null,host=null,source='manual',options={}){
  const result={at:Date.now(),source,sites:0,cookiesDeleted:0,originsCleared:0,skipped:0,failed:0,errors:[]};
  const fresh=await preview(api,host),allowedHosts=new Set(fresh.plan.hosts);
  const hosts=authorization?authorization.hosts.filter(h=>allowedHosts.has(h)):fresh.plan.hosts;
  const originSet=new Set(fresh.plan.origins);
  const origins=authorization?authorization.origins.filter(o=>originSet.has(o)):fresh.plan.origins;
  const cookieIds=new Set(fresh.plan.cookies.map(identity));
  const cookies=authorization?authorization.cookies.filter(c=>cookieIds.has(identity(c))):fresh.plan.cookies;
  const allowedIds=new Set(cookies.map(identity));
  result.sites=hosts.length;
  const progress={total:cookies.length+origins.length,completed:0,cookiesTotal:cookies.length,cookiesCompleted:0,originsTotal:origins.length,originsCompleted:0,phase:cookies.length?'cookies':origins.length?'storage':'finishing'};
  let lastUpdate=-Infinity;
  const publish=async(force=false)=>{
    if(!options.onProgress||(!force&&Date.now()-lastUpdate<200))return;
    lastUpdate=Date.now();
    await options.onProgress({...progress,cookiesDeleted:result.cookiesDeleted,originsCleared:result.originsCleared,deleted:result.cookiesDeleted+result.originsCleared,failed:result.failed,skipped:result.skipped,percent:progress.total?Math.floor(progress.completed*100/progress.total):0});
  };
  await publish(true);
  for(const candidate of cookies){
    try{
      const outcome=await queue(async()=>{
        const state=await readState(api);
        if(options.recentEligible && !(await options.recentEligible(candidate)))return 'skipped';
        return removeCookieSafely(api,candidate,allowedIds,state.protectedSites,options.revokedIds);
      });
      if(outcome==='deleted')result.cookiesDeleted++;else result.skipped++;
    }catch(error){result.failed++;result.errors.push(`Cookie: ${error.message}`);}
    progress.completed++;progress.cookiesCompleted++;await publish();
  }
  if(origins.length&&progress.phase!=='storage'){progress.phase='storage';await publish(true);}
  for(const origin of origins){
    try{
      const cleared=await queue(async()=>{
        const state=await readState(api);
        const hostName=new URL(origin).hostname;
        // Chromium's default storage-key filter can include third-party data
        // embedded under this origin. With any protected site, that collateral
        // cannot be ruled out, so keep all browsingData-managed types.
        if(state.protectedSites.length || protectedHost(hostName,state.protectedSites))return false;
        await api.browsingData.remove({origins:[origin],originTypes:{unprotectedWeb:true}},DATA_TYPES);
        return true;
      });
      if(cleared)result.originsCleared++;else result.skipped++;
    }catch(error){result.failed++;result.errors.push(`${origin}: ${error.message}`);}
    progress.completed++;progress.originsCompleted++;await publish();
  }
  progress.phase='finishing';await publish(true);
  await queue(async()=>{const state=await readState(api);state.history=[result,...state.history].slice(0,30);await saveState(api,state);});
  return result;
}
