export function watchLastNormalWindow(api,onEmpty){
  if(!api.windows)return ()=>{};
  const normal=new Set();let fired=false,stopped=false,tail=Promise.resolve();
  const session=api.storage?.session;
  const persist=()=>session?.set({lastNormalWindowState:{ids:[...normal],fired}});
  const ready=(async()=>{
    const saved=session?(await session.get('lastNormalWindowState')).lastNormalWindowState:null;
    if(saved){for(const id of saved.ids??[])normal.add(id);fired=!!saved.fired;}
    const windows=await api.windows.getAll({windowTypes:['normal']});
    for(const w of windows)if(w.type==='normal'){normal.add(w.id);fired=false;}
    await persist();
  })();
  // Restore only normal window IDs (no tabs/URLs), so a worker awakened by the
  // final removal can identify its type even when getAll already returns [].
  ready.catch(()=>{});
  const enqueue=operation=>{tail=tail.then(async()=>{await ready;if(!stopped)await operation();}).catch(()=>{});return tail;};
  const created=w=>enqueue(async()=>{if(w.type==='normal'){normal.add(w.id);fired=false;await persist();}});
  const removed=id=>enqueue(async()=>{
    if(!normal.delete(id))return;
    const remaining=await api.windows.getAll({windowTypes:['normal']});
    if(remaining.some(w=>w.type==='normal')||fired){await persist();return;}
    fired=true;await persist();await onEmpty();
  });
  api.windows.onCreated.addListener(created);api.windows.onRemoved.addListener(removed);
  return ()=>{stopped=true;api.windows.onCreated.removeListener?.(created);api.windows.onRemoved.removeListener?.(removed);};
}
