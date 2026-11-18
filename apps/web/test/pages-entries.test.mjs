import test from 'node:test';
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
import {relative,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import config from '../next.config.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
test('cada implementação HTTP tem exatamente uma entrada Pages, a mesma URL pública e a duração declarada',async()=>{
  const impl=resolve(root,'handlers'),entries=resolve(root,'pages/api');
  const sources=(await readdir(impl,{recursive:true})).filter(p=>p.endsWith('/route.ts'));
  const files=(await readdir(entries,{recursive:true})).filter(p=>p.endsWith('.ts'));
  assert.equal(sources.length,46);assert.equal(files.length,46);
  const rewrites=await config.rewrites();
  const paths=new Set();
  for(const file of files) {
    const entry=resolve(entries,file);const source=await readFile(entry,'utf8');
    const f=source.match(/import \* as methods from '([^']+)';/)?.[1];assert.ok(f);
    const handler=resolve(dirname(entry),f);
    const privatePath='/api/'+file.slice(0,-3);
    const publicPath=rewrites.find(r=>r.destination===privatePath)?.source??privatePath;
    assert.equal('/'+relative(impl,handler).replace(/\/route\.ts$/,''),publicPath);
    assert.ok(source.includes('pagesRoute('+JSON.stringify(publicPath).replaceAll('"',"'")+', methods)'));
    assert.ok(source.includes('bodyParser: false, responseLimit: false'));
    assert.equal(source.match(/maxDuration: (\d+)/)?.[1],(await readFile(handler,'utf8')).match(/export const maxDuration\s*=\s*(\d+)/)?.[1]);
    paths.add(publicPath);
  }
  assert.equal(paths.size,sources.length);
});
