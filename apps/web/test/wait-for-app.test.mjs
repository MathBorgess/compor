import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {waitForApp,stopApp} from './wait-for-app.mjs';

test('readiness respeita o prazo mesmo quando o servidor nunca envia headers', {timeout:3000}, async t=>{
  const server=createServer(()=>{});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
  const url=`http://127.0.0.1:${server.address().port}`;
  await assert.rejects(waitForApp({url,child:{exitCode:null,signalCode:null},signal:t.signal,timeoutMs:200,diagnostics:()=> 'diagnóstico preservado'}),/Aplicação indisponível.*diagnóstico preservado/);
});

test('teardown encerra somente o processo criado mesmo se ele ignorar SIGTERM', {timeout:3000}, async t=>{
  const child=spawn(process.execPath,['-e','process.on("SIGTERM",()=>{});setInterval(()=>{},1000);process.stdout.write("ready");'],{stdio:['ignore','pipe','ignore']});
  t.after(()=>stopApp(child,{graceMs:100}));
  await once(child.stdout,'data',{signal:t.signal});
  await stopApp(child,{graceMs:100});
  assert.equal(child.signalCode,'SIGKILL');
});
