import {deflateSync} from 'node:zlib';

export function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) {
    c ^= byte;
    for (let i = 0; i < 8; i++) c = (c >>> 1) ^ ((c & 1) ? 0xedb88320 : 0);
  }
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const name = Buffer.from(type), length = Buffer.alloc(4), crc = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, crc]);
}

// A shield and check distinguish SiteKeep from the cookie-shaped reference icon.
const shield=[[.5,.05],[.88,.18],[.84,.58],[.72,.78],[.5,.95],[.28,.78],[.16,.58],[.12,.18]];
function inside(x,y,points){let hit=false;for(let i=0,j=points.length-1;i<points.length;j=i++){
  const a=points[i],b=points[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])hit=!hit;
}return hit;}
function segmentDistance(x,y,ax,ay,bx,by){const t=Math.max(0,Math.min(1,((x-ax)*(bx-ax)+(y-ay)*(by-ay))/((bx-ax)**2+(by-ay)**2)));return Math.hypot(x-(ax+t*(bx-ax)),y-(ay+t*(by-ay)));}
function sample(x,y) {
  if(!inside(x,y,shield))return [0,0,0,0];
  const inner=shield.map(([px,py])=>[.5+(px-.5)*.86,.5+(py-.5)*.86]);
  if(!inside(x,y,inner))return [12,83,78,255];
  if(segmentDistance(x,y,.33,.50,.46,.63)<.046||segmentDistance(x,y,.46,.63,.70,.36)<.046)return [255,255,255,255];
  return [40,166,145,255];
}

export function renderIcon(size) {
  const raw = Buffer.alloc(size*(size*4+1)), scale = 8;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const sums = [0,0,0,0];
    for (let sy = 0; sy < scale; sy++) for (let sx = 0; sx < scale; sx++) {
      const color = sample((x+(sx+.5)/scale)/size, (y+(sy+.5)/scale)/size,size);
      for (let i = 0; i < 3; i++) sums[i] += color[i]*color[3]/255;
      sums[3] += color[3];
    }
    const offset = y*(size*4+1)+1+x*4, coverage = sums[3]/(scale*scale);
    for (let i = 0; i < 3; i++) raw[offset+i] = coverage ? Math.round(sums[i]/(sums[3]/255)) : 0;
    raw[offset+3] = Math.round(coverage);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size,0); header.writeUInt32BE(size,4); header[8]=8; header[9]=6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR',header), chunk('IDAT',deflateSync(raw)), chunk('IEND',Buffer.alloc(0))]);
}
