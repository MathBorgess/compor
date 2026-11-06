import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {basename} from 'node:path';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {chromium} from 'playwright-core';
import {waitForApp,stopApp} from './wait-for-app.mjs';
const browserPath=process.env.BROWSER_EXECUTABLE_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const userId=id(1),projectId=id(2),requestId=id(3),pieceId=id(4),marker=`compor-studio-chat:${userId}:${projectId}`;
const apiKey=`sk-synthetic-${'x'.repeat(30)}`,story='PRIVATE_PROVIDER_STORY';
const authenticationNotice='A OpenAI recusou a autenticação desta chave. Confira sua chave para consultar a solicitação anterior.';

test('consulta de solicitação anterior é explícita e não executa nem repete efeitos',{skip:!existsSync(browserPath),timeout:90000},async t=>{
 let phase='fixture';t.after(()=>t.diagnostic(`Última etapa da inspeção: ${phase}`));
 const fixture=await mkdtemp(new URL('../app/studio-inspection-test-',import.meta.url));let child,browser;
 t.after(async()=>{try{await browser?.close();}finally{try{await stopApp(child);}finally{await rm(fixture,{recursive:true,force:true});}}});
 await writeFile(new URL('page.jsx',`file://${fixture}/`),`'use client';
import {useEffect,useRef,useState} from 'react';import StudioChat from '../studio-chat';
import {createStudioState,createPost,prepareAdjustment,settleAdjustment} from '../../lib/studio-state.ts';
function initial(){let s=createPost(createStudioState({userId:'${userId}',projectId:'${projectId}'}),{pieceId:'${pieceId}'});s=prepareAdjustment(s,{requestId:'${requestId}',messageId:'${id(5)}',instruction:'Pedido já concluído',createdAt:'2026-11-05T00:00:00.000Z',eventId:'${id(6)}'});return settleAdjustment(s,{requestId:'${requestId}',status:'completed',result:{messageId:'${id(7)}',text:'Resposta já guardada'},createdAt:'2026-11-05T00:01:00.000Z',eventId:'${id(8)}'});}
export default function Fixture(){const[developer,setDeveloper]=useState(true),[key,setKey]=useState(''),[state]=useState(initial),counts=useRef({change:0,flush:0,tools:0,image:0});const tools=useRef({execute:async()=>{counts.current.tools++;throw Error('unexpected tool');}});useEffect(()=>{window.__inspectionCounts=counts.current;},[]);return <main><button onClick={()=>setDeveloper(value=>!value)}>Alternar modo desenvolvedor</button><label>Chave de teste<input type="password" value={key} onChange={e=>setKey(e.target.value)}/></label><output data-testid="snapshot">{JSON.stringify(state)}</output><StudioChat developerMode={developer} state={state} getState={()=>state} change={()=>{counts.current.change++;throw Error('unexpected settle');}} flush={async()=>{counts.current.flush++;}} tools={tools} hasApiKey={Boolean(key)} getApiKey={()=>key} onUseImage={()=>{counts.current.image++;}}/></main>;}`);
 const socket=createServer();await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));const origin=`http://127.0.0.1:${port}`;
 phase='starting Next';
 let startup='';const recordStartup=chunk=>{const output=startup+chunk;startup=output.length>6000?output.slice(0,4500)+output.slice(-1500):output;};
 child=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','-p',String(port),'-H','127.0.0.1'],{stdio:['ignore','pipe','pipe'],env:{...process.env,APP_ORIGIN:origin}});child.stdout.on('data',recordStartup);child.stderr.on('data',recordStartup);
 await waitForApp({url:`${origin}/${basename(fixture)}`,child,signal:t.signal,diagnostics:()=>startup});
 phase='launching browser';
 browser=await chromium.launch({executablePath:browserPath,headless:true});const page=await browser.newPage();page.setDefaultTimeout(6000);const calls=[],errors=[],external=[];let responseStatus='completed',responseErrorCode=null;
 await page.addInitScript(({marker,requestId})=>{if(sessionStorage.getItem(marker)===null)sessionStorage.setItem(marker,JSON.stringify({requestId:null,previousAttemptKey:requestId}));},{marker,requestId});
 page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{if(!request.url().startsWith(origin))external.push(request.url());});
 await page.route('**/api/**',async route=>{
  const request=route.request(),body=request.postDataJSON();calls.push({path:new URL(request.url()).pathname,body});
  return route.fulfill({status:202,json:{status:responseStatus,...(responseErrorCode?{errorCode:responseErrorCode}:{}),attemptId:id(9),sessionId:'sess_verified',turnId:'turn_verified',text:story,actionBinding:apiKey,declineBinding:apiKey,prompt:story,action:{name:'compor_novo_post',args:{projectId,requestId,revision:1,value:story}},usage:{input_tokens:11,output_tokens:13},itemTrace:{observedItems:3,functionCalls:1,outputs:1,omittedItems:0,items:[{type:'function_call',status:'failed',name:'functions.compor_contexto',argumentKeys:['projectId',apiKey],schemaValid:false,arguments:story},{type:'function_call_output',status:'failed',name:'functions.compor_contexto',errorClass:'unavailable',output:{apiKey,story}}]}}});
 });
 phase='opening fixture';await page.goto(`${origin}/${basename(fixture)}`);await page.getByRole('button',{name:'Alternar modo desenvolvedor'}).click();assert.equal(await page.getByRole('button',{name:'Consultar estado',exact:true}).count(),0);await page.getByRole('button',{name:'Alternar modo desenvolvedor'}).click();const consult=page.getByRole('button',{name:'Consultar estado',exact:true});await consult.waitFor();assert.equal(await consult.isDisabled(),true);assert.equal(calls.length,0);
 const before=await page.getByTestId('snapshot').innerText(),stored=await page.evaluate(marker=>sessionStorage.getItem(marker),marker);
 await page.getByLabel('Chave de teste').fill(apiKey);
 for(const status of ['completed','action_required','consent_required','running','unknown']){
  phase=`inspecting ${status}`;responseStatus=status;const count=calls.length;await consult.click();await page.getByText('Esta consulta não executa ações nem inicia uma nova solicitação.').waitFor();
  await page.getByText('Uso informado: 11 tokens de entrada e 13 de saída. Custo final desconhecido.').waitFor();
  if(status==='running')await page.waitForTimeout(2200);
  assert.equal(calls.length,count+1,'cada clique faz somente uma consulta sem timer ou ACK');assert.deepEqual(calls.at(-1),{path:'/api/studio/chat',body:{op:'poll',projectId,requestId,apiKey}});
  assert.equal(await page.getByTestId('snapshot').innerText(),before);assert.deepEqual(await page.evaluate(()=>window.__inspectionCounts),{change:0,flush:0,tools:0,image:0});
  assert.equal(await page.getByRole('heading',{name:'Gerar a arte completa'}).count(),0);assert.doesNotMatch(await page.locator('body').innerText(),/PRIVATE_PROVIDER_STORY|sk-synthetic|sess_verified|turn_verified|functions.compor_contexto/);
 }
 await page.getByText('Diagnóstico técnico',{exact:true}).click();await page.getByText('Ocorrência: ferramenta indisponível.').waitFor();assert.equal(await page.evaluate(marker=>sessionStorage.getItem(marker),marker),stored);
 phase='authentication error';responseErrorCode='provider_http_401';await consult.click();await page.getByText(authenticationNotice,{exact:true}).waitFor();assert.equal(calls.length,6);assert.equal(await page.getByText('Estado da solicitação anterior: não confirmado.',{exact:true}).count(),0);assert.equal(await page.getByTestId('snapshot').innerText(),before);
 phase='untrusted diagnostic';responseErrorCode=`provider_http_401 ${story} ${apiKey}`;await consult.click();await page.getByText('Estado da solicitação anterior: não confirmado.',{exact:true}).waitFor();assert.equal(calls.length,7);assert.equal(await page.getByText(authenticationNotice,{exact:true}).count(),0);assert.doesNotMatch(await page.locator('body').innerText(),/PRIVATE_PROVIDER_STORY|sk-synthetic/);
 phase='reloading completed attempt';const beforeReload=calls.length;await page.reload();await consult.waitFor();assert.equal(await page.getByLabel('Chave de teste').inputValue(),'');assert.equal(await consult.isDisabled(),true);assert.equal(calls.length,beforeReload);assert.equal(await page.getByTestId('snapshot').innerText(),before);
 await page.getByLabel('Chave de teste').fill(apiKey);responseStatus='completed';responseErrorCode=null;await consult.click();await page.getByText('Estado da solicitação anterior: concluída.').waitFor();assert.equal(calls.length,beforeReload+1);assert.equal(calls.at(-1).body.requestId,requestId);assert.equal(await page.getByTestId('snapshot').innerText(),before);
 phase='reloading pending attempt';await page.evaluate(({marker,requestId})=>sessionStorage.setItem(marker,JSON.stringify({requestId,previousAttemptKey:null})),{marker,requestId});await page.reload();await page.getByRole('button',{name:'Alternar modo desenvolvedor'}).click();await page.getByLabel('Chave de teste').fill(apiKey);responseStatus='unknown';responseErrorCode='provider_http_401';const pendingPolls=calls.length;await page.getByRole('button',{name:'Consultar esta tentativa',exact:true}).click();await page.getByText(authenticationNotice,{exact:true}).waitFor();await page.waitForTimeout(2200);assert.equal(calls.length,pendingPolls+1);assert.equal(await page.getByTestId('snapshot').innerText(),before);
 assert.deepEqual(await page.evaluate(()=>window.__inspectionCounts),{change:0,flush:0,tools:0,image:0});assert.equal(await page.evaluate(()=>JSON.stringify([Object.entries(localStorage),Object.entries(sessionStorage)])).then(value=>value.includes('sk-synthetic')),false);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);phase='completed';
});
