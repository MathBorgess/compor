import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {waitForApp,stopApp} from './wait-for-app.mjs';
import {sessionCookieHeaders} from './session-cookie.mjs';

test('readiness respeita o prazo mesmo quando o servidor nunca envia headers', {timeout:3000}, async t=>{
  const server=createServer(()=>{});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
  const url=`http://127.0.0.1:${server.address().port}`;
  await assert.rejects(waitForApp({url,child:{exitCode:null,signalCode:null},signal:t.signal,timeoutMs:200,diagnostics:()=> 'diagnóstico preservado'}),/Aplicação indisponível.*diagnóstico preservado/);
});

test('readiness autenticado consome HTML e chunks locais antes de iniciar a navegação', {timeout:3000}, async t=>{
  const requests=[];let htmlComplete=false;
  const server=createServer((request,response)=>{
    requests.push({path:request.url,cookie:request.headers.cookie});
    if(request.url==='/'){
      if(request.headers.cookie!=='sb-example-auth-token=fixture')return response.end('<main class="compor-entry">Entrada leve</main>');
      response.writeHead(200,{'content-type':'text/html'});response.write('<!doctype html>');
      setTimeout(()=>{htmlComplete=true;response.end('<script src="/_next/static/chunks/app.js"></script><link rel="stylesheet" href="/_next/static/app.css"><script src="https://external.invalid/_next/static/foreign.js"></script>');},30);
    }else{
      assert.equal(htmlComplete,true,'o corpo HTML precisa terminar antes da descoberta dos chunks');
      response.writeHead(200,{'content-type':request.url.endsWith('.css')?'text/css':'text/javascript'});response.end('/* fixture pronta */');
    }
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
  const url=`http://127.0.0.1:${server.address().port}`;
  const fetchApi=globalThis.fetch;const foreign=[];
  globalThis.fetch=(target,options)=>{if(new URL(target).origin!==url){foreign.push(String(target));throw Error('external request refused');}return fetchApi(target,options);};
  t.after(()=>{globalThis.fetch=fetchApi;});
  await waitForApp({url,child:{exitCode:null,signalCode:null},signal:t.signal,headers:sessionCookieHeaders(url),nextApp:true,timeoutMs:1000});
  assert.deepEqual(requests.map(request=>request.path).sort(),['/','/_next/static/app.css','/_next/static/chunks/app.js']);
  assert.ok(requests.every(request=>request.cookie==='sb-example-auth-token=fixture'));
  assert.deepEqual(foreign,[],'o preflight não carrega scripts externos');
});

test('HTTP 200 da entrada leve não comprova readiness autenticado', {timeout:3000}, async t=>{
  const server=createServer((_request,response)=>response.end('<main class="compor-entry">Entrada leve</main>'));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
  await assert.rejects(waitForApp({url:`http://127.0.0.1:${server.address().port}`,child:{exitCode:null,signalCode:null},signal:t.signal,nextApp:true,timeoutMs:150}),/HTML do App Router não observado/);
});

test('uma falha de chunk encerra a onda anterior antes de repetir o preparo', {timeout:3000}, async t=>{
  let pages=0,active=0,overlap=false;
  const server=createServer((request,response)=>{
    if(request.url==='/'){
      pages++;if(active)overlap=true;
      return response.end('<script src="/_next/static/fast.js"></script><script src="/_next/static/slow.js"></script>');
    }
    if(request.url.endsWith('fast.js')){response.statusCode=pages===1?404:200;return response.end('/* fixture */');}
    active++;
    setTimeout(()=>{active--;response.end('/* fixture */');},pages===1?200:0);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
  await waitForApp({url:`http://127.0.0.1:${server.address().port}`,child:{exitCode:null,signalCode:null},signal:t.signal,nextApp:true,timeoutMs:1000});
  assert.equal(pages,2);assert.equal(active,0);assert.equal(overlap,false,'o retry não acumula requests da tentativa anterior');
});

for(const stalled of ['body','asset'])test(`readiness mantém o prazo quando ${stalled} nunca termina`, {timeout:3000}, async t=>{
  const server=createServer((request,response)=>{
    if(stalled==='asset'&&request.url==='/')return response.end('<script src="/_next/static/app.js"></script>');
    response.writeHead(200,{'content-type':'text/html'});response.write('corpo parcial');
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
  await assert.rejects(waitForApp({url:`http://127.0.0.1:${server.address().port}`,child:{exitCode:null,signalCode:null},signal:t.signal,nextApp:stalled==='asset',timeoutMs:200,diagnostics:()=> 'prazo preservado'}),/Aplicação indisponível.*prazo preservado/);
});

test('teardown encerra somente o processo criado mesmo se ele ignorar SIGTERM', {timeout:3000}, async t=>{
  const child=spawn(process.execPath,['-e','process.on("SIGTERM",()=>{});setInterval(()=>{},1000);process.stdout.write("ready");'],{stdio:['ignore','pipe','ignore']});
  t.after(()=>stopApp(child,{graceMs:100}));
  await once(child.stdout,'data',{signal:t.signal});
  await stopApp(child,{graceMs:100});
  assert.equal(child.signalCode,'SIGKILL');
});
