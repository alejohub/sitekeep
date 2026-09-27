import {identity} from './cookies.js';
export const RECENT_HOURS=[1,2,24];
export function createRecentCookies(api,now=()=>Date.now()){
  const observations=new Map(),session=api.storage.session;let tail=Promise.resolve(),timer;
  const key=async cookie=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(identity(cookie))))).map(n=>n.toString(16).padStart(2,'0')).join('');
  const prune=()=>{for(const [id,at] of observations)if(at<now()-24*3600000||at>now())observations.delete(id);};
  const ready=(async()=>{if(!session)return;try{const {recentCookieObservations:saved}=await session.get('recentCookieObservations');for(const [id,at] of Object.entries(saved??{}))if(/^[a-f0-9]{64}$/.test(id)&&Number.isFinite(at))observations.set(id,at);prune();}catch{observations.clear();}})();
  const flush=async()=>{await ready;await tail;prune();if(session)await session.set({recentCookieObservations:Object.fromEntries(observations)});};
  return {
    observe(change){const at=now();tail=tail.then(async()=>{await ready;if(!change?.cookie)return;const id=await key(change.cookie);if(change.removed)observations.delete(id);else observations.set(id,at);prune();clearTimeout(timer);timer=setTimeout(()=>flush().catch(()=>{}),300);timer.unref?.();}).catch(()=>{});return tail;},
    async eligible(cookies,hours){if(!RECENT_HOURS.includes(hours))throw new Error('Intervalo temporal inválido');await ready;await tail;const end=now(),start=end-hours*3600000,snapshot=new Map(observations),eligible=new Set();for(let offset=0;offset<cookies.length;offset+=64)await Promise.all(cookies.slice(offset,offset+64).map(async c=>{const at=snapshot.get(await key(c));if(Number.isFinite(at)&&at>=start&&at<=end)eligible.add(identity(c));}));return eligible;},
    flush,
    stop(){clearTimeout(timer);}
  };
}
