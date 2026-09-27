import {normalizeHost,pageHost,domainMatches,applies,isProtected} from './domains.js';
import {estimateBytes,removalDetails,inRemovalScope} from './cookies.js';

export function validateProtectedSites(value){
  if(!Array.isArray(value)||value.some(host=>typeof host!=='string'||normalizeHost(host)!==host))throw new Error('Lista protegida dañada; limpieza bloqueada');
  return [...new Set(value)].sort();
}
export const protectedHost=(host,sites)=>sites.some(site=>domainMatches(host,site));
export function originOf(url){try{const u=new URL(url);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password?u.origin:null;}catch{return null;}}
export function discoverSiteData(cookies,tabs,protectedSites){
  const origins=new Set();
  for(const tab of tabs){const origin=originOf(tab.url);if(origin)origins.add(origin);}
  for(const c of cookies){try{const host=normalizeHost(c.domain);origins.add(`https://${host}`);origins.add(`http://${host}`);}catch{}}
  const rows=new Map();
  for(const origin of origins){const host=pageHost(origin);if(!host)continue;if(!rows.has(host))rows.set(host,{host,origins:[],cookies:0,protected:false});rows.get(host).origins.push(origin);}
  for(const host of protectedSites)if(!rows.has(host))rows.set(host,{host,origins:[],cookies:0,protected:false});
  for(const row of rows.values()){row.origins.sort();row.protected=protectedHost(row.host,protectedSites);row.cookies=cookies.filter(c=>applies(c,row.host)).length;}
  return [...rows.values()].sort((a,b)=>a.host.localeCompare(b.host));
}
export function buildCleanupPlan(rows,cookies,sites,host=null,eligible=()=>true){
  const selected=rows.filter(row=>!protectedHost(row.host,sites)&&(!host||domainMatches(row.host,host)));
  const allowedCookies=cookies.filter(c=>{try{return eligible(c)&&!isProtected(c,sites)&&selected.some(row=>applies(c,row.host));}catch{return false;}});
  const allowedSet=new Set(allowedCookies),bySelector=new Map();
  for(const c of cookies){const key=JSON.stringify([c.storeId,c.name]);if(!bySelector.has(key))bySelector.set(key,[]);bySelector.get(key).push(c);}
  const safeCookies=allowedCookies.filter(c=>{try{const details=removalDetails(c),group=bySelector.get(JSON.stringify([c.storeId,c.name]));return !group.some(other=>other!==c&&!allowedSet.has(other)&&inRemovalScope(other,c,details));}catch{return false;}});
  const totalMeasuredBytes=cookies.reduce((sum,c)=>sum+estimateBytes(c),0);
  const protectedMeasuredBytes=cookies.filter(c=>isProtected(c,sites)).reduce((sum,c)=>sum+estimateBytes(c),0);
  const releasableByHost=Object.create(null);
  for(const c of safeCookies){const hosts=selected.filter(row=>applies(c,row.host)).map(row=>row.host);if(hosts.length){const key=hosts.sort((a,b)=>a.length-b.length||a.localeCompare(b))[0];releasableByHost[key]=(releasableByHost[key]||0)+estimateBytes(c);}}
  const releasableBytes=Object.values(releasableByHost).reduce((sum,bytes)=>sum+bytes,0);
  return {hosts:selected.map(r=>r.host),origins:[...new Set(selected.flatMap(r=>r.origins))],cookies:safeCookies,keptProtected:rows.filter(r=>r.protected).length,measured:{totalMeasuredBytes,protectedMeasuredBytes,releasableBytes,releasableByHost}};
}
