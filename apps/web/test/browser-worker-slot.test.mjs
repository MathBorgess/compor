import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp, mkdir, readFile, readdir, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {claimWorker} from './worker-slot.mjs';

async function temporaryRun() {
  const root=await mkdtemp(join(tmpdir(),'compor-worker-slot-'));
  await Promise.all([0,1].map(slot=>mkdir(join(root,'workers',String(slot)),{recursive:true})));
  return root;
}

test('processos concorrentes recebem fontes distintas e o exit libera o slot', {timeout:5000}, async t=>{
  const root=await temporaryRun(),children=[];
  t.after(async()=>{
    await Promise.all(children.map(async child=>{
      if(child.exitCode!==null||child.signalCode!==null)return;
      const exited=once(child,'exit');child.kill('SIGKILL');await exited;
    }));
    await rm(root,{recursive:true,force:true});
  });
  const source=`import {claimWorker} from ${JSON.stringify(new URL('./worker-slot.mjs',import.meta.url).href)};
const lease=claimWorker(process.argv[1]);
process.on('exit',lease.release);
process.on('message',message=>{if(message==='exit')process.exit(0);});
process.send({root:lease.root,slot:lease.slot,pid:process.pid});`;
  function start() {
    const child=spawn(process.execPath,['--input-type=module','-e',source,root],{stdio:['ignore','ignore','pipe','ipc']});
    children.push(child);
    const message=once(child,'message',{signal:t.signal});
    return {child,message};
  }
  const first=start(),second=start();
  const [[left],[right]]=await Promise.all([first.message,second.message]);
  assert.deepEqual([left.slot,right.slot].sort(),[0,1]);
  assert.notEqual(left.root,right.root);
  for(const worker of [left,right]) {
    assert.equal(worker.root,join(root,'workers',String(worker.slot)));
    assert.deepEqual(JSON.parse(await readFile(join(root,'leases',String(worker.slot)),'utf8')),{pid:worker.pid});
  }
  assert.throws(()=>claimWorker(root),/Nenhum worker de navegador livre/);
  const firstExit=once(first.child,'exit');first.child.send('exit');
  assert.deepEqual(await firstExit,[0,null]);
  const reused=claimWorker(root);
  assert.equal(reused.slot,left.slot);
  reused.release();
  const secondExit=once(second.child,'exit');second.child.send('exit');
  assert.deepEqual(await secondExit,[0,null]);
  assert.deepEqual(await readdir(join(root,'leases')),[]);
});

test('release é síncrono e idempotente mesmo depois de outro claim', async t=>{
  const root=await temporaryRun();t.after(()=>rm(root,{recursive:true,force:true}));
  const first=claimWorker(root),other=claimWorker(root);
  assert.equal(first.release(),undefined);
  const next=claimWorker(root);
  assert.equal(next.slot,first.slot);
  first.release();
  assert.deepEqual((await readdir(join(root,'leases'))).sort(),['0','1']);
  assert.throws(()=>claimWorker(root),/Nenhum worker de navegador livre/);
  next.release();next.release();other.release();other.release();
  assert.deepEqual(await readdir(join(root,'leases')),[]);
});

test('slots ocupados não autorizam apagar leases de PIDs antigos', async t=>{
  const root=await temporaryRun();t.after(()=>rm(root,{recursive:true,force:true}));
  await mkdir(join(root,'leases'));
  const metadata='{"pid":0}\n';
  await Promise.all([0,1].map(slot=>writeFile(join(root,'leases',String(slot)),metadata)));
  assert.throws(()=>claimWorker(root),/Nenhum worker de navegador livre/);
  for(const slot of [0,1])assert.equal(await readFile(join(root,'leases',String(slot)),'utf8'),metadata);
});

test('erro de filesystem não é convertido em falta de workers', async t=>{
  const root=await temporaryRun();t.after(()=>rm(root,{recursive:true,force:true}));
  const blocked=join(root,'not-a-directory');await writeFile(blocked,'fixture');
  assert.throws(()=>claimWorker(blocked),error=>error.code==='ENOTDIR');
});
