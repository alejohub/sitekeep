import {readFile,writeFile,mkdir,readdir,stat} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {renderIcon} from './icon.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const manifest=JSON.parse(await readFile(resolve(root,'manifest.json'),'utf8'));
if(manifest.manifest_version!==3||manifest.name!=='SiteKeep'||!/^\d+\.\d+\.\d+$/.test(manifest.version))throw new Error('Identidad o versión inválida');
if(JSON.stringify(manifest.permissions)!==JSON.stringify(['browsingData','cookies','storage','alarms','tabs']))throw new Error('Permisos inesperados');
if(JSON.stringify(manifest.optional_permissions)!==JSON.stringify(['history']))throw new Error('Permiso opcional inesperado');
await mkdir(resolve(root,'icons'),{recursive:true});
for(const size of [16,32,48,128])await writeFile(resolve(root,`icons/${size}.png`),renderIcon(size));
const files=[];
async function walk(dir){for(const entry of await readdir(dir,{withFileTypes:true})){const path=resolve(dir,entry.name);if(entry.isDirectory())await walk(path);else files.push(path);}}
await walk(resolve(root,'src'));await walk(resolve(root,'scripts'));await walk(resolve(root,'tests'));
for(const path of files.filter(p=>/\.(js|mjs)$/.test(p))){
  const check=spawnSync(process.execPath,['--check',path],{encoding:'utf8'});if(check.status!==0)throw new Error(check.stderr);
  const source=await readFile(path,'utf8');
  for(const match of source.matchAll(/from\s+['"](\.[^'"]+)['"]/g))await stat(resolve(dirname(path),match[1]));
}
for(const path of files.filter(p=>p.endsWith('.html'))){
  const source=await readFile(path,'utf8');if(/<script(?![^>]*src=)/.test(source))throw new Error('Script inline incompatible con CSP');
}
for(const path of [manifest.background.service_worker,manifest.action.default_popup,manifest.options_ui.page,...Object.values(manifest.icons)])await stat(resolve(root,path));
console.log(`SiteKeep build correcto: ${files.length} archivos validados e iconos PNG generados.`);
