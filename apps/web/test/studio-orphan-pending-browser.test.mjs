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
const userId=id(1),projectId=id(2),previousId=id(3),pieceId=id(4);
const apiKey=`sk-synthetic-${'x'.repeat(30)}`;

test('pedido local pendente sem marcador exige consulta explícita e fonte original',{skip:!existsSync(browserPath),timeout:90000},async t=>{
 const fixture=await mkdtemp(new URL('../app/studio-busy-test-',import.meta.url));t.after(()=>rm(fixture,{recursive:true,force:true}));
 await writeFile(new URL('page.jsx',`file://${fixture}/`),`'use client';
import {useRef,useState} from 'react';import StudioChat from '../studio-chat';
import {createStudioState,createPost,prepareAdjustment,editDraft,updateBrief} from '../../lib/studio-state.ts';
function initial(){let s=createPost(createStudioState({userId:'${userId}',projectId:'${projectId}'}),{pieceId:'${pieceId}'});s=updateBrief(s,{offer:'Minha oferta preservada'});s=editDraft(s,{field:'headline',value:'Meu rascunho preservado'});s=prepareAdjustment(s,{requestId:'${previousId}',messageId:'${id(5)}',instruction:'Pedido anterior pendente',createdAt:'2026-11-05T00:00:00.000Z',eventId:'${id(6)}'});return s;}
export default function Fixture(){const[key,setKey]=useState(''),[source,setSource]=useState('byok'),[state,setState]=useState(initial),current=useRef(state),counts=useRef({change:0,flush:0,tools:0,image:0});const tools=useRef({execute:async()=>{counts.current.tools++;throw Error('unexpected tool');}});function change(fn){counts.current.change++;const next=fn(current.current);current.current=next;setState(next);return next;}return <main><label>Chave de teste<input type="password" value={key} onChange={e=>setKey(e.target.value)}/></label><label>Fonte<select value={source} onChange={e=>setSource(e.target.value)}><option value="byok">Chave própria</option><option value="default">IA do Compor</option></select></label><output data-testid="snapshot">{JSON.stringify(state)}</output><output data-testid="effects">{JSON.stringify(counts.current)}</output><StudioChat credentialSource={source} conversationId={'${pieceId}'} state={state} getState={()=>current.current} change={change} flush={async()=>{counts.current.flush++;}} tools={tools} hasApiKey={source==='default'||Boolean(key)} getApiKey={()=>key} onUseImage={()=>{counts.current.image++;}} loadReference={async()=>null}/></main>;}`);
 const socket=createServer();await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));const origin=`http://127.0.0.1:${port}`;
 let startup='';const child=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','-p',String(port),'-H','127.0.0.1'],{stdio:['ignore','pipe','pipe'],env:{...process.env,APP_ORIGIN:origin}});for(const stream of[child.stdout,child.stderr])stream.on('data',chunk=>{startup=(startup+chunk).slice(-6000);});t.after(async()=>{if(child.exitCode===null&&child.signalCode===null){child.kill('SIGTERM');await once(child,'exit');}});
 const until=Date.now()+30000;for(;;){try{if((await fetch(`${origin}/${basename(fixture)}`)).ok)break;}catch{}if(Date.now()>until)throw Error(`fixture indisponível: ${startup}`);await new Promise(resolve=>setTimeout(resolve,100));}
 const browser=await chromium.launch({executablePath:browserPath,headless:true});t.after(()=>browser.close());const page=await browser.newPage();page.setDefaultTimeout(6000);const calls=[],errors=[],external=[];let result={status:'unknown',retryAutomatically:false},hold=null,release;
 await page.addInitScript(()=>{if(!sessionStorage.getItem('test-initialized')){sessionStorage.clear();localStorage.clear();sessionStorage.setItem('test-initialized','1');}});
 page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{if(!request.url().startsWith(origin))external.push(request.url());});
 await page.route('**/api/**',async route=>{
  const request=route.request(),body=request.postDataJSON();calls.push({path:new URL(request.url()).pathname,body});
  if(hold)await hold;
  return route.fulfill({status:200,json:result});
 });
 await page.goto(`${origin}/${basename(fixture)}`);await page.getByLabel('Chave de teste').fill(apiKey);
 const before=await page.getByTestId('snapshot').innerText();
 const prompt=page.getByText('Uma tentativa anterior está pendente, mas a fonte original da IA não foi preservada nesta aba.',{exact:true});
 const button=page.getByRole('button',{name:'Consultar usando minha chave OpenAI',exact:true});
 await prompt.waitFor();await button.waitFor();assert.equal(calls.length,0);
 await button.click();await page.getByText('Não foi possível confirmar esta tentativa. Use a fonte e a chave originais; nenhuma ação foi repetida.',{exact:true}).waitFor();
 assert.equal(calls.length,1);assert.equal(calls[0].path,'/api/studio/chat');assert.equal(calls[0].body.op,'inspect_pending');assert.equal(calls[0].body.requestId,previousId);
 const marker=`compor-studio-chat:${userId}:${projectId}:conversation:${pieceId}`;
 for(const raw of [JSON.stringify({requestId:null,previousAttemptKey:previousId,credentialSource:'byok'}),'{invalid-json',JSON.stringify({requestId:42}),JSON.stringify({requestId:'not-a-uuid',previousAttemptKey:null})]){
  await page.evaluate(({marker,raw})=>sessionStorage.setItem(marker,raw),{marker,raw});await page.reload();await page.getByLabel('Chave de teste').fill(apiKey);await prompt.waitFor();
  assert.equal(await page.evaluate(marker=>sessionStorage.getItem(marker),marker),raw,'marcador sem pendência utilizável é preservado');assert.equal(calls.length,1,'nenhuma consulta ocorre automaticamente');
  assert.equal(await page.getByTestId('snapshot').innerText(),before);
 }
 await page.evaluate(marker=>sessionStorage.removeItem(marker),marker);await page.reload();await page.getByLabel('Chave de teste').fill(apiKey);await prompt.waitFor();
 result={status:'failed',error:'provider_usage_limit',retryAutomatically:false};await button.click();await page.getByText('A OpenAI informou que o limite de uso foi atingido. Verifique o faturamento e os limites da sua organização OpenAI.',{exact:true}).waitFor();
 result={status:'action_required',retryAutomatically:false};await button.click();await page.getByText('Esta tentativa aguarda uma ação. Abra a aba original para recuperar o contexto; nenhuma ação foi executada.',{exact:true}).waitFor();
 result={status:'action_required',action:{name:'compor_novo_post',args:{}},actionBinding:'synthetic',retryAutomatically:false};await button.click();await page.getByText('Não foi possível confirmar esta tentativa. Use a fonte e a chave originais; nenhuma ação foi repetida.',{exact:true}).waitFor();
 result={status:'completed',retryAutomatically:false};await button.click();await page.getByText('A consulta encontrou uma resposta concluída. Abra a aba original para recuperar o contexto antes de continuar. Nenhuma ação foi repetida.',{exact:true}).waitFor();
 await page.getByLabel('Fonte').selectOption('default');result={status:'failed',error:'provider_usage_limit',retryAutomatically:false};await page.getByRole('button',{name:'Consultar usando IA do Compor',exact:true}).click();await page.getByText('A IA do Compor está indisponível por limite de uso. Você pode conectar sua chave OpenAI ou continuar editando.',{exact:true}).waitFor();
 assert.equal(calls.length,6);assert.ok(calls.every(call=>call.path==='/api/studio/chat'&&call.body.op==='inspect_pending'&&call.body.requestId===previousId&&call.body.conversationId===pieceId));assert.equal(Object.hasOwn(calls.at(-1).body,'apiKey'),false);
 assert.equal(await page.getByTestId('snapshot').innerText(),before);assert.deepEqual(JSON.parse(await page.getByTestId('effects').innerText()),{change:0,flush:0,tools:0,image:0});
 await page.getByLabel('Fonte').selectOption('byok');
 result={status:'unknown',retryAutomatically:false};await button.click();await page.getByText('Não foi possível confirmar esta tentativa. Use a fonte e a chave originais; nenhuma ação foi repetida.',{exact:true}).waitFor();
 assert.equal(calls.length,7);assert.equal(await page.getByTestId('snapshot').innerText(),before);
 hold=new Promise(resolve=>{release=resolve;});result={status:'action_required',retryAutomatically:false};await button.evaluate(element=>{element.click();element.click();});
 await page.waitForFunction(()=>document.querySelector('[role="status"]')?.textContent?.includes('trabalhando'));await page.getByLabel('Fonte').selectOption('default');release();hold=null;
 await page.getByRole('button',{name:'Consultar usando IA do Compor',exact:true}).waitFor();await page.waitForTimeout(300);
 assert.equal(calls.length,8,'dois cliques não iniciam duas consultas');assert.equal(await page.getByTestId('snapshot').innerText(),before);assert.deepEqual(JSON.parse(await page.getByTestId('effects').innerText()),{change:0,flush:0,tools:0,image:0});
 await page.evaluate(({marker,previousId})=>sessionStorage.setItem(marker,JSON.stringify({requestId:previousId,previousAttemptKey:null,imageProtocolVersion:1})),{marker,previousId});
 await page.reload();await page.getByLabel('Chave de teste').fill(apiKey);await page.getByRole('button',{name:'Consultar esta tentativa',exact:true}).waitFor();
 assert.equal(calls.length,8,'marcador legado preserva o fluxo existente sem consulta automática');
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
});
