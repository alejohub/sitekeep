export function formatBytes(value){
  if(!Number.isFinite(value)||value<0)throw new Error('Tamaño inválido');
  if(value<1024)return `${Math.round(value)} B`;
  const units=['KB','MB','GB'];let amount=value,unit=-1;
  do{amount/=1024;unit++;}while(amount>=1024&&unit<units.length-1);
  return `${amount.toFixed(1)} ${units[unit]}`;
}
export function formatEstimate(value){return value===0?'0 B':`≈ ${formatBytes(value)}`;}
