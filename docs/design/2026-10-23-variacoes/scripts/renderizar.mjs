import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const base=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const cli=process.env.COMPOR_EXCALIDRAW_CLI || '/Users/matheusborges/.local/share/compor-design-tools/node_modules/.bin/excalidraw';
const manifest=JSON.parse(fs.readFileSync(path.join(base,'quadros.json'),'utf8'));
const log=[];
const only=process.env.COMPOR_FRAMES?.split(',');
for(const scene of manifest) for(const f of scene.frames) {
 if(only && !only.includes(f.id))continue;
 const args=['render',path.join(base,'excalidraw',scene.file),'--frame-id',f.id,'--out',path.join(base,'renders',f.id+'.png'),'--fonts-url','none'];
 const r=spawnSync(cli,args,{encoding:'utf8',env:{...process.env,EXCALIDRAW_NO_UPDATE_NOTIFIER:'1'}});
 if(r.status!==0)throw Error(`${f.id}: ${r.stderr || r.stdout}`);
 const result=JSON.parse(r.stdout);log.push({scene:scene.file,frame:f.id,width:result.width,height:result.height,exitCode:r.status});console.log(f.id+' renderizado');
}
fs.writeFileSync(path.join(base,only?'renderizacao-ajustes.json':'renderizacao.json'),JSON.stringify({cli:'@excalidraw/cli@0.2.0',executedAt:new Date().toISOString(),results:log},null,2));
