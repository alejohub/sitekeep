import {validateProtectedSites} from './sites.js';
import {validateSchedule} from './schedule.js';
export const DEFAULT={protectedSites:[],schedule:{mode:'disabled'},history:[]};
export async function readState(api){const {sitekeepState:raw}=await api.storage.local.get('sitekeepState');if(raw===undefined)return structuredClone(DEFAULT);if(!raw||!Array.isArray(raw.history))throw new Error('Configuración dañada; limpieza bloqueada');return {protectedSites:validateProtectedSites(raw.protectedSites),schedule:validateSchedule(raw.schedule),history:raw.history.slice(0,30)};}
export async function saveState(api,state){await api.storage.local.set({sitekeepState:{protectedSites:validateProtectedSites(state.protectedSites),schedule:validateSchedule(state.schedule),history:state.history.slice(0,30)}});}
export function createQueue(){let tail=Promise.resolve();return action=>{const result=tail.then(action);tail=result.catch(()=>{});return result;};}
