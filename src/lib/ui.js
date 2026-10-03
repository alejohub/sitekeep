import {formatEstimate} from './space.js';
export const $=id=>document.getElementById(id);
export const date=value=>value?new Date(value).toLocaleString('es'):'—';
let cleanupBusy=false;
export function setCleanupBusy(value){cleanupBusy=value;}
const cleanupControl=button=>button.className==='danger'||['clean-all','clean-recent','dry-recent','delete','settings','interval','recent-hours','protect'].includes(button.id);
export function node(tag,text,className){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;}
export async function request(type,data={}){const response=await chrome.runtime.sendMessage({type,...data});if(!response?.ok)throw new Error(response?.error||'No se pudo contactar con SiteKeep');return response.data;}
export async function perform(action,button){if(button)button.disabled=true;try{await action();}catch(error){$('notice').textContent=error.message;}finally{if(button)button.disabled=cleanupBusy&&cleanupControl(button);}}
export function makeButton(label,action,className='secondary'){const button=node('button',label,className);button.type='button';button.onclick=()=>perform(action,button);return button;}
export function showDialog(title,body,actions=[]){$('dialog-title').textContent=title;$('dialog-body').replaceChildren(...body);$('dialog-actions').replaceChildren(...actions,makeButton('Cerrar',()=>$('dialog').close()));$('dialog').showModal();}
export async function showPreview(host=null,dry=false,refresh=()=>{},recentHours=null){
  const p=await request('preview',{host,recentHours});
  const body=[node('p',`${p.hosts.length} sitios y ${p.cookieCount} cookies candidatos a limpieza. Espacio medible liberable: ${formatEstimate(p.estimatedBytes)}. ${p.keptProtected} sitios protegidos se conservan.`),node('p',recentHours!==null?`Solo cookies observadas o cambiadas por SiteKeep en las últimas ${recentHours} horas. ${p.temporalExcluded} cookies sin observación válida en ese periodo quedan fuera; caché y almacenamiento quedan fuera.`:p.keptProtected?`Tipos: cookies. Caché y almacenamiento se conservan mientras haya sitios protegidos, por seguridad ante datos incrustados de terceros.`:`Tipos: ${p.types.join(', ')}. La estimación solo incluye cookies; Chromium no proporciona aquí tamaños fiables de caché y almacenamiento por origen.`)];
  const list=node('div');list.className='preview-list';list.append(...p.hosts.map(h=>node('div',h)));body.push(makeButton('Ver sitios que se limpiarán',()=>{list.hidden=!list.hidden;}));list.hidden=true;body.push(list);
  const actions=dry?[]:[makeButton('Borrar datos',async()=>{$('dialog').close();const r=await request('clean',{token:p.token,host,recentHours});await refresh();$('notice').textContent=`Limpieza: ${r.cookiesDeleted} cookies y ${r.originsCleared} orígenes procesados; ${r.skipped} omitidos; ${r.failed} errores.`;},'danger')];
  showDialog(dry?'Dry run':'Confirmar limpieza',body,actions);
}
