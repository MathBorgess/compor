import test from 'node:test';
import assert from 'node:assert/strict';
import {lstat, mkdir, mkdtemp, readFile, readlink, realpath, rm, symlink, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {setImmediate} from 'node:timers/promises';
import {prepareWorkerTrees} from './worker-trees.mjs';

async function put(root,path,contents=path) {
  await mkdir(dirname(join(root,path)),{recursive:true});
  await writeFile(join(root,path),contents);
}

async function fixture(t) {
  const temporary=await mkdtemp(join(tmpdir(),'compor-worker-trees-'));
  t.after(()=>rm(temporary,{recursive:true,force:true}));
  const source=join(temporary,'source'),run=join(temporary,'run');
  const files=['package.json','package-lock.json','apps/web/package.json','apps/web/package-lock.json',
    'apps/web/app/page.tsx','apps/web/lib/state.ts','apps/web/test/case.test.mjs',
    'apps/web/test/fixtures/example.json','apps/web/public/studio/brand.svg',
    'apps/web/proxy.ts','apps/web/next.config.mjs','apps/web/tsconfig.json','apps/web/next-env.d.ts',
    'packages/tool/package.json','packages/tool/src/index.mjs'];
  await Promise.all(files.map(path=>put(source,path)));
  return {source,run,temporary,files};
}

const inode=stat=>`${stat.dev}:${stat.ino}`;

test('fontes e diretórios de dependências são privados e links relativos ficam no worker', async t=>{
  const {source,run,files}=await fixture(t);
  const dependencies=['node_modules/root-dep/index.js',
    'apps/web/node_modules/tool/bin/cli.js',
    'apps/web/node_modules/tool/node_modules/nested/index.js',
    'packages/tool/node_modules/package-dep/index.js'];
  await Promise.all(dependencies.map(path=>put(source,path)));
  await mkdir(join(source,'apps/web/node_modules/.bin'));
  await symlink('../tool/bin/cli.js',join(source,'apps/web/node_modules/.bin/tool'));
  await symlink('state.ts',join(source,'apps/web/lib/state-link.ts'));
  await prepareWorkerTrees(source,run);
  const workers=[0,1].map(slot=>join(run,'workers',String(slot)));
  for(const path of files) {
    const paths=[source,...workers].map(root=>join(root,path));
    assert.equal(new Set((await Promise.all(paths.map(path=>lstat(path)))).map(inode)).size,3,path);
    await writeFile(paths[1],'alterado apenas no primeiro worker');
    assert.equal(await readFile(paths[0],'utf8'),path);
    assert.equal(await readFile(paths[2],'utf8'),path);
  }
  for(const path of ['node_modules','apps/web/node_modules','apps/web/node_modules/.bin',
    'apps/web/node_modules/tool','apps/web/node_modules/tool/node_modules','packages/tool/node_modules']) {
    const stats=await Promise.all([source,...workers].map(root=>lstat(join(root,path))));
    assert.ok(stats.every(stat=>stat.isDirectory()),path);
    assert.equal(new Set(stats.map(inode)).size,3,path);
  }
  for(const worker of workers) {
    for(const path of dependencies)assert.equal(await readFile(join(worker,path),'utf8'),path);
    const bin=join(worker,'apps/web/node_modules/.bin/tool');
    assert.equal(await readlink(bin),'../tool/bin/cli.js');
    assert.equal(await realpath(bin),join(worker,'apps/web/node_modules/tool/bin/cli.js'));
    assert.equal(await realpath(join(worker,'apps/web/lib/state-link.ts')),join(worker,'apps/web/lib/state.ts'));
  }
  await writeFile(join(workers[0],'apps/web/lib/state-link.ts'),'mudança pelo link privado');
  assert.equal(await readFile(join(source,'apps/web/lib/state.ts'),'utf8'),'apps/web/lib/state.ts');
  assert.equal(await readFile(join(workers[1],'apps/web/lib/state.ts'),'utf8'),'apps/web/lib/state.ts');
});

test('artefatos do Next, Git e caches não entram nas árvores privadas', async t=>{
  const {source,run}=await fixture(t);
  const excluded=['apps/web/.next/dev/cache/manifest.json','apps/web/.git/index',
    'apps/web/.cache/state.json','apps/web/tsconfig.tsbuildinfo','packages/tool/.cache/value',
    'node_modules/.cache/compiled.js','apps/web/node_modules/tool/.next/cache/data'];
  await Promise.all(excluded.map(path=>put(source,path)));
  await prepareWorkerTrees(source,run);
  for(const slot of [0,1])for(const path of excluded) {
    await assert.rejects(lstat(join(run,'workers',String(slot),path)),error=>error.code==='ENOENT');
  }
});

test('link externo rejeita o preparo depois de encerrar as cópias irmãs', async t=>{
  const {source,run,temporary}=await fixture(t);
  const outside=join(temporary,'outside.ts');await writeFile(outside,'fora da origem');
  await symlink(outside,join(source,'apps/web/lib/outside.ts'));
  const leaves=Array.from({length:16},(_,index)=>`apps/web/lib/valid-${index}/a/b/c/d/last.ts`);
  await Promise.all(leaves.map(path=>put(source,path)));
  await assert.rejects(prepareWorkerTrees(source,run),/fora da árvore de origem/);
  // These independent branches must have settled before failure reaches cleanup.
  for(const slot of [0,1])for(const path of leaves) {
    assert.equal(await readFile(join(run,'workers',String(slot),path),'utf8'),path);
  }
  await rm(run,{recursive:true,force:true});
  await setImmediate();
  await assert.rejects(lstat(run),error=>error.code==='ENOENT');
  assert.equal(await readFile(outside,'utf8'),'fora da origem');
});
