import {date} from './ui.js';
const INTERVALS=[1440,4320,10080];
export function validateSchedule(schedule){
  if(!schedule || !['disabled','interval','lastWindowClosed'].includes(schedule.mode))throw new Error('Modo de limpieza inválido');
  if(schedule.mode==='interval'){if(!INTERVALS.includes(schedule.interval))throw new Error('Intervalo inválido');return {mode:'interval',interval:schedule.interval};}
  return {mode:schedule.mode};
}
export function scheduleOf(state){return validateSchedule(state.cleanupSchedule??(state.interval?{mode:'interval',interval:state.interval}:{mode:'disabled'}));}
export function scheduleFromValue(value){return validateSchedule(value==='lastWindowClosed'?{mode:value}:Number(value)?{mode:'interval',interval:Number(value)}:{mode:'disabled'});}
export const scheduleValue=state=>{const s=scheduleOf(state);return s.mode==='interval'?String(s.interval):s.mode==='lastWindowClosed'?s.mode:'0';};
export function scheduleText(state,nextRun){const s=scheduleOf(state);return s.mode==='lastWindowClosed'?'Próxima limpieza: al cerrar todas las ventanas':s.mode==='disabled'?'Limpieza automática desactivada.':`Próxima limpieza: ${date(nextRun)}`;}
