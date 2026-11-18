import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {basename} from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createServer} from 'node:net';
import {chromium} from 'playwright-core';
const browserPath=process.env.BROWSER_EXECUTABLE_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const userId=id(1),projectId=id(2),previousId=id(3),pieceId=id(4),marker=`compor-studio-chat:${userId}:${projectId}`;
const apiKey=`sk-synthetic-${'x'.repeat(30)}`,instruction='Ajuste a oferta preservando meu rascunho.';
const busyNotice='Este pedido não foi enviado à OpenAI porque outro pedido deste projeto ainda precisa ser consultado. Seu trabalho foi preservado.';

test('busy termina somente o pedido novo sem perder trabalho; conflito e timeout conservam a pendência',{skip:!existsSync(browserPath),timeout:90000},async t=>{
 const fixture=await mkdtemp(new URL('../pages/studio-busy-test-',import.meta.url));t.after(()=>rm(fixture,{recursive:true,force:true}));
 await writeFile(new URL('index.jsx',`file://${fixture}/`),`'use client';
import {useRef,useState} from 'react';import StudioChat from '../../studio/studio-chat';
import {createStudioState,createPost,prepareAdjustment,settleAdjustment,editDraft,updateBrief} from '../../lib/studio-state.ts';
function initial(){let s=createPost(createStudioState({userId:'${userId}',projectId:'${projectId}'}),{pieceId:'${pieceId}'});s=updateBrief(s,{offer:'Minha oferta preservada'});s=editDraft(s,{field:'headline',value:'Meu rascunho preservado'});s=prepareAdjustment(s,{requestId:'${previousId}',messageId:'${id(5)}',instruction:'Pedido anterior concluído',createdAt:'2026-11-05T00:00:00.000Z',eventId:'${id(6)}'});return settleAdjustment(s,{requestId:'${previousId}',status:'completed',result:{messageId:'${id(7)}',text:'Resposta anterior'},createdAt:'2026-11-05T00:01:00.000Z',eventId:'${id(8)}'});}
export default function Fixture(){const[key,setKey]=useState(''),[state,setState]=useState(initial),current=useRef(state),counts=useRef({change:0,flush:0,tools:0,image:0});const tools=useRef({execute:async()=>{counts.current.tools++;throw Error('unexpected tool');}});function change(fn){counts.current.change++;const next=fn(current.current);current.current=next;setState(next);return next;}return <main><label>Chave de teste<input type="password" value={key} onChange={e=>setKey(e.target.value)}/></label><output data-testid="snapshot">{JSON.stringify(state)}</output><output data-testid="effects">{JSON.stringify(counts.current)}</output><StudioChat state={state} getState={()=>current.current} change={change} flush={async()=>{counts.current.flush++;}} tools={tools} hasApiKey={Boolean(key)} getApiKey={()=>key} onUseImage={()=>{counts.current.image++;}} loadReference={async()=>null}/></main>;}`);
 const socket=createServer();await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));const origin=`http://127.0.0.1:${port}`;
 let startup='';const child=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','-p',String(port),'-H','127.0.0.1'],{stdio:['ignore','pipe','pipe'],env:{...process.env,APP_ORIGIN:origin}});for(const stream of[child.stdout,child.stderr])stream.on('data',chunk=>{startup=(startup+chunk).slice(-6000);});t.after(async()=>{if(child.exitCode===null&&child.signalCode===null){child.kill('SIGTERM');await once(child,'exit');}});
 const until=Date.now()+30000;for(;;){try{if((await fetch(`${origin}/${basename(fixture)}`)).ok)break;}catch{}if(Date.now()>until)throw Error(`fixture indisponível: ${startup}`);await new Promise(resolve=>setTimeout(resolve,100));}
 const browser=await chromium.launch({executablePath:browserPath,headless:true});t.after(()=>browser.close());const page=await browser.newPage();page.setDefaultTimeout(6000);const calls=[],errors=[],external=[];let outcome='busy';
 await page.addInitScript(({marker,previousId})=>sessionStorage.setItem(marker,JSON.stringify({requestId:null,previousAttemptKey:previousId})),{marker,previousId});
 page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{if(!request.url().startsWith(origin))external.push(request.url());});
 await page.route('**/api/**',async route=>{
  const request=route.request(),body=request.postDataJSON();calls.push({path:new URL(request.url()).pathname,body});
  if(outcome==='timeout')return route.abort('failed');
  return route.fulfill({status:409,json:outcome==='busy'?{status:'failed',error:'project_busy',failurePhase:'before_submission',requestId:body.requestId,retryAutomatically:false}:{status:'conflict',retryAutomatically:false}});
 });
 const snapshot=async()=>JSON.parse(await page.getByTestId('snapshot').innerText());
 for(const result of ['busy','conflict','timeout']){
  outcome=result;await page.goto(`${origin}/${basename(fixture)}`);await page.getByLabel('Chave de teste').fill(apiKey);const before=await snapshot(),count=calls.length;
  await page.getByLabel('Sua mensagem').fill(instruction);await page.getByRole('button',{name:'Enviar →',exact:true}).click();
  if(result==='busy')await page.getByText(busyNotice,{exact:true}).waitFor();else await page.getByRole('button',{name:'Consultar esta tentativa',exact:true}).waitFor();
  const after=await snapshot(),newRequest=calls.at(-1).body.requestId,stored=JSON.parse(await page.evaluate(marker=>sessionStorage.getItem(marker),marker));
  assert.equal(calls.length,count+1);assert.equal(calls.at(-1).path,'/api/studio/chat');assert.equal(calls.at(-1).body.op,undefined);assert.equal(calls.at(-1).body.previousAttemptKey,previousId);
  assert.deepEqual(after.drafts,before.drafts);assert.deepEqual(after.brief,before.brief);assert.deepEqual(after.selection,before.selection);assert.deepEqual(after.adjustments.find(item=>item.id===previousId),before.adjustments[0]);assert.deepEqual(after.messages.slice(0,2),before.messages);
  assert.equal(after.adjustments.find(item=>item.id===newRequest).status,result==='busy'?'failed':'pending');assert.equal(after.messages.at(-1).text,instruction);assert.equal(after.messages.at(-1).status,result==='busy'?'failed':'pending');
  assert.equal(stored.requestId,result==='busy'?null:newRequest);assert.equal(stored.previousAttemptKey,previousId);
  await page.getByLabel('Sua mensagem').fill('Outro pedido manual');assert.equal(await page.getByRole('button',{name:'Enviar →',exact:true}).isDisabled(),result!=='busy');
  if(result==='busy')assert.equal(await page.getByRole('button',{name:'Consultar esta tentativa',exact:true}).count(),0);else assert.equal(await page.getByText(busyNotice,{exact:true}).count(),0);
  const effects=JSON.parse(await page.getByTestId('effects').innerText());assert.equal(effects.tools,0);assert.equal(effects.image,0);assert.equal(effects.change,result==='busy'?2:1);
  await page.waitForTimeout(2200);assert.equal(calls.length,count+1,'nenhum retry, poll, ACK ou imagem automático');assert.equal(await page.evaluate(()=>JSON.stringify([Object.entries(localStorage),Object.entries(sessionStorage)])).then(value=>value.includes('sk-synthetic')),false);
 }
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
});
