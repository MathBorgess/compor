import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {basename} from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createServer} from 'node:net';
import {chromium} from 'playwright-core';
import {isolateFixtureHmr} from './fixture-hmr.mjs';
const browserPath=process.env.BROWSER_EXECUTABLE_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const userId=id(1),projectId=id(2),requestId=id(3),pieceId=id(4),assetId=id(5),otherPiece=id(6),marker=`compor-studio-chat:${userId}:${projectId}:conversation:${pieceId}`;
const apiKey=`sk-synthetic-${'x'.repeat(30)}`,staleText='A proposta está pronta e aguarda sua confirmação.';
const receipt='Imagem gerada e adicionada a este post · versão 2.';
const failure='A imagem foi gerada, mas não foi possível confirmar sua aplicação à nova versão. Consulte as imagens dessa versão para recuperá-la; não haverá nova geração automática.';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4AWJiYGBgAAAAAP//XRcpzQAAAAZJREFUAwAADwADJDd96QAAAABJRU5ErkJggg==','base64');

async function serveReceiptFixture(t) {
 const fixture=await mkdtemp(new URL('../pages/studio-image-receipt-test-',import.meta.url));t.after(()=>rm(fixture,{recursive:true,force:true}));
 await writeFile(new URL('index.jsx',`file://${fixture}/`),`'use client';
import {useEffect,useRef,useState} from 'react';import StudioChat from '../../studio/studio-chat';
import {createStudioState,selectVersion,selectDraft,prepareAdjustment,parseStudioState,recordSavedVersion} from '../../lib/studio-state.ts';
const content={headline:'Post de origem',price:'',date:'',caption:'',captionOrigin:'user'};
function initial(userId='${userId}',projectId='${projectId}',restore=false){if(restore&&typeof window!=='undefined'){try{const old=JSON.parse(sessionStorage.getItem('receipt-test-state'));if(old?.userId===userId&&old?.projectId===projectId)return parseStudioState(old);}catch{}}let s=selectVersion(createStudioState({userId,projectId}),{pieceId:'${otherPiece}',version:2,latestVersion:2,content:{...content,headline:'Outro post'}});s=selectVersion(s,{pieceId:'${pieceId}',version:2,latestVersion:2,content});return prepareAdjustment(s,{requestId:'${requestId}',messageId:'${id(7)}',instruction:'Gere uma imagem',createdAt:'2026-11-05T00:00:00.000Z',eventId:'${id(8)}'});}
export default function Fixture(){const[state,setState]=useState(initial),[withSave,setWithSave]=useState(false),current=useRef(state),counts=useRef({image:0}),tools=useRef({execute:async()=>{throw Error('unexpected tool');}});useEffect(()=>{const next=initial('${userId}','${projectId}',true);current.current=next;setState(next);setWithSave(localStorage.getItem('receipt-test-save')==='true');},[]);function change(fn){const next=fn(current.current);current.current=next;setState(next);sessionStorage.setItem('receipt-test-state',JSON.stringify(next));return next;}function scope(user,project){const next=initial(user,project,true);current.current=next;setState(next);}
async function saveVersion({pieceId,baseVersion,expectedLatestVersion}){const version=expectedLatestVersion+1;change(s=>recordSavedVersion(s,{pieceId,baseVersion,version,content,eventId:crypto.randomUUID()}));return {status:'completed',pieceId,version};}
async function loadBase({baseVersion}){return baseVersion===2&&!window.__sourceUnavailable?{file:new Blob([Uint8Array.from(atob('${png.toString('base64')}'),byte=>byte.charCodeAt(0))],{type:'image/png'})}:null;}
return <main><button onClick={()=>change(s=>selectDraft(s,{pieceId:'${otherPiece}',baseVersion:2}))}>Outro post</button><button onClick={()=>change(s=>selectDraft(s,{pieceId:'${pieceId}',baseVersion:2}))}>Post de origem</button><button onClick={()=>scope('${id(10)}','${projectId}')}>Outra conta</button><button onClick={()=>scope('${userId}','${id(11)}')}>Outro projeto</button><button onClick={()=>scope('${userId}','${projectId}')}>Escopo original</button><div hidden={state.selection?.pieceId!=='${pieceId}'}><StudioChat state={state} conversationId="${pieceId}" getState={()=>current.current} change={change} flush={async()=>{}} tools={tools} hasApiKey={true} getApiKey={()=>'${apiKey}'} prepareImageVersion={withSave?saveVersion:undefined} loadBase={loadBase} onUseImage={async()=>{counts.current.image++;if(window.__receiptMode==='throw')throw Error('synthetic private error');if(window.__receiptMode==='false')return false;return new Promise(resolve=>{window.__releaseImage=()=>resolve(true);});}}/></div><output data-testid="counts">{JSON.stringify(counts.current)}</output></main>;}`);
 const socket=createServer();await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));const origin=`http://127.0.0.1:${port}`;
 let startup='';const child=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','-p',String(port),'-H','127.0.0.1'],{stdio:['ignore','pipe','pipe'],env:{...process.env,APP_ORIGIN:origin}});for(const stream of[child.stdout,child.stderr])stream.on('data',chunk=>{startup=(startup+chunk).slice(-6000);});t.after(async()=>{if(child.exitCode===null&&child.signalCode===null){child.kill('SIGTERM');await once(child,'exit');}});
 const until=Date.now()+30000;for(;;){try{if((await fetch(`${origin}/${basename(fixture)}`)).ok)break;}catch{}if(Date.now()>until)throw Error(`fixture indisponível: ${startup}`);await new Promise(resolve=>setTimeout(resolve,100));}
 return {origin, fixturePath:`/${basename(fixture)}`};
}

test('receipt confirma aplicação aguardada sem alterar o agente; escopo e falha não regeneram imagem',{skip:!existsSync(browserPath),timeout:90000},async t=>{
 const {origin,fixturePath}=await serveReceiptFixture(t);
 const completedPollStarted=Promise.withResolvers(),releaseCompletedPoll=Promise.withResolvers(),completedPollDelivered=Promise.withResolvers();
 const browser=await chromium.launch({executablePath:browserPath,headless:true});t.after(async()=>{releaseCompletedPoll.resolve();await browser.close();});const page=await browser.newPage();page.setDefaultTimeout(6000);const calls=[],errors=[],external=[];let polls=0,imageReplies=[],imageReadiness='ready',holdCompletedPoll=false,stableProposal=false,closureConfirmed=false,retryRejected=false;
 await isolateFixtureHmr(page,fixturePath);
 await page.addInitScript(({marker,requestId})=>{if(sessionStorage.getItem(marker)===null)sessionStorage.setItem(marker,JSON.stringify({requestId,previousAttemptKey:null,imageProtocolVersion:1,imageContext:{pieceId:'00000000-0000-4000-8000-000000000004',baseVersion:2}}));},{marker,requestId});
 page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{if(!request.url().startsWith(origin))external.push(request.url());});
 await page.route('**/api/**',async route=>{
  const request=route.request(),url=new URL(request.url()),body=request.method()==='POST'?request.postDataJSON():null;calls.push({path:url.pathname,body,query:Object.fromEntries(url.searchParams)});
  if(url.pathname==='/api/studio/chat'){
   if(body.op===undefined&&body.message==='Pode gerar a imagem de novo?'){
    if(retryRejected)return route.fulfill({status:409,json:{status:'failed',error:'project_busy',failurePhase:'before_submission',requestId:body.requestId,retryAutomatically:false}});
    return route.fulfill({json:{status:'completed',text:'Novo pedido recebido.'}});
   }
   assert.equal(body.op,'poll');const first=++polls===1,held=!first&&holdCompletedPoll;
   if(held){holdCompletedPoll=false;completedPollStarted.resolve();await releaseCompletedPoll.promise;}
   await route.fulfill({status:202,json:first?{status:'consent_required',attemptId:id(12),prompt:'Proposta sintética',actionBinding:stableProposal?`renewed-binding-${calls.length}`:'synthetic-binding',declineBinding:'synthetic-decline',...(stableProposal?{imageActionId:id(13),proposal:{prompt:'Proposta sintética',operation:'edit',baseImageId:pieceId,referenceIds:[]}}:{})}:{status:'completed',text:staleText}});
   if(held)completedPollDelivered.resolve();return;
  }
  if(url.pathname==='/api/agent/image'){
   assert.equal(Object.hasOwn(body,'apiKey'),false);
   assert.equal(request.headers()['x-compor-openai-key'],apiKey);
   assert.equal(request.headers()['content-type'],'application/vnd.compor.byok+json');
   const next=imageReplies.shift();
   if(next==='refused')return route.fulfill({json:{status:'failed',closureReason:'provider_rejected_429',providerOutcome:'retryable',retryAutomatically:false}});
   if(next==='unknown')return route.fulfill({status:502,json:{error:'result_unknown',retryAutomatically:false}});
   return route.fulfill(next?{status:200,json:{status:next}}:{status:202,json:{status:'accepted',assetId}});
  }
  if(url.pathname==='/api/agent/image/hold')return route.fulfill({json:{screen:'result_unknown',sameProject:true,projectId,projectTitle:'Oficina sintética'}});
  if(url.pathname==='/api/agent/image/close')return route.fulfill({json:{status:'closed'}});
  if(url.pathname==='/api/agent/image/reconcile-closed')return route.fulfill({json:closureConfirmed?{status:'confirmed',outcome:'failed_image_attempt'}:{status:'unverified'}});
  if(url.pathname==='/api/agent/image/status'){
   assert.deepEqual(Object.keys(body).sort(),['actionBinding','attemptId','pieceId','projectId','version']);
   assert.equal(request.headers()['x-compor-openai-key'],undefined,'consulta de prontidão não carrega credencial');
   assert.equal(request.headers()['content-type'],'application/json');
   return route.fulfill({json:{status:imageReadiness}});
  }
  if(url.pathname==='/api/images')return route.fulfill({contentType:'image/png',body:png});
  throw Error('unexpected API');
 });
 await page.goto(origin+fixturePath);await page.getByRole('button',{name:'Consultar esta tentativa',exact:true}).click();await page.waitForFunction(()=>typeof window.__releaseImage==='function');
 assert.equal(await page.getByText(receipt,{exact:true}).count(),0,'a resposta da API não basta antes da aplicação local');assert.equal(polls,1);
 await page.getByRole('button',{name:'Outro post',exact:true}).click();await page.evaluate(()=>window.__releaseImage());
 await page.waitForFunction(text=>JSON.parse(sessionStorage.getItem('receipt-test-state')??'null')?.messages.some(message=>message.text===text),staleText);
 assert.equal(await page.getByText(staleText,{exact:true}).isVisible(),false,'a resposta do post de origem fica oculta no outro post');
 assert.equal(await page.getByText(receipt,{exact:true}).count(),0,'o receipt da origem não pertence ao post aberto depois');
 await page.getByRole('button',{name:'Post de origem',exact:true}).click();await page.getByText(receipt,{exact:true}).waitFor();assert.equal(await page.getByText(staleText,{exact:true}).count(),1,'a resposta original não foi reescrita');
 const saved=JSON.parse(await page.evaluate(marker=>sessionStorage.getItem(marker),marker));assert.deepEqual(saved.imageReceipt,{userId,projectId,requestId,pieceId,version:2,assetId});assert.equal(saved.requestId,null);assert.equal(calls.filter(c=>c.path==='/api/agent/image').length,1);assert.deepEqual(calls.find(c=>c.path==='/api/images').query,{projectId,pieceId,version:'2',assetId});
 const beforeReload=calls.length;await page.reload();await page.getByText(receipt,{exact:true}).waitFor();assert.equal(calls.length,beforeReload,'reload conserva só metadados e não consulta nem gera');
 await page.getByRole('button',{name:'Outra conta',exact:true}).click();assert.equal(await page.getByText(receipt,{exact:true}).count(),0);await page.getByRole('button',{name:'Outro projeto',exact:true}).click();assert.equal(await page.getByText(receipt,{exact:true}).count(),0);
 await page.evaluate(({marker,saved,projectId})=>sessionStorage.setItem(marker,JSON.stringify({...saved,imageReceipt:{...saved.imageReceipt,projectId}})),{marker,saved,projectId:id(11)});await page.getByRole('button',{name:'Escopo original',exact:true}).click();assert.equal(await page.getByText(receipt,{exact:true}).count(),0,'metadados copiados de outro escopo são rejeitados');
 for(const mode of['false','throw']){
  await page.evaluate(()=>{sessionStorage.clear();localStorage.clear();});polls=0;await page.reload();await page.evaluate(mode=>{window.__receiptMode=mode;},mode);const start=calls.length;
  await page.getByRole('button',{name:'Consultar esta tentativa',exact:true}).click();await page.getByText(failure,{exact:true}).waitFor();
  assert.equal(await page.getByText(receipt,{exact:true}).count(),0);assert.equal(polls,1,'aplicação incerta não avança o fluxo');assert.equal(calls.slice(start).filter(c=>c.path==='/api/agent/image').length,1);assert.equal(await page.getByRole('button',{name:'Confirmar geração de imagem',exact:true}).count(),0);
  assert.equal(JSON.parse(await page.evaluate(marker=>sessionStorage.getItem(marker),marker)).imageReceipt,undefined);await page.waitForTimeout(2200);assert.equal(calls.length,start+3,'falha de aplicação não repete geração, fetch ou poll');
  polls=0;await page.reload();await page.getByRole('button',{name:'Consultar esta tentativa',exact:true}).click();await page.getByText('Esta tentativa precisa ser verificada antes de continuar.').waitFor();await page.getByRole('button',{name:'Verificar envio anterior',exact:true}).waitFor();
  assert.equal(calls.slice(start).filter(c=>c.path==='/api/agent/image').length,1,'recarregar e consultar a proposta não repetem uma geração incerta');
 }
 await page.evaluate(()=>{sessionStorage.clear();localStorage.clear();});polls=0;imageReplies=['busy'];holdCompletedPoll=true;await page.reload();await page.evaluate(()=>{window.__receiptMode='ok';delete window.__releaseImage;});const beforeBusy=calls.length;
 await page.getByRole('button',{name:'Consultar esta tentativa',exact:true}).click();await page.getByText('Há outra operação de imagem em andamento na sua conta.',{exact:true}).waitFor();
 await page.waitForFunction(()=>typeof window.__releaseImage==='function');await page.evaluate(()=>window.__releaseImage());await page.getByText(receipt,{exact:true}).waitFor();
 assert.deepEqual(calls.slice(beforeBusy).map(c=>c.path).slice(0,4),['/api/studio/chat','/api/agent/image','/api/agent/image/status','/api/agent/image'],'só envia a imagem novamente após verificar a prontidão');
 await completedPollStarted.promise;assert.equal(polls,2);assert.equal(JSON.parse(await page.evaluate(marker=>sessionStorage.getItem(marker),marker)).requestId,requestId,'o receipt aparece antes da conclusão do poll');
 releaseCompletedPoll.resolve();await completedPollDelivered.promise;
 await page.waitForFunction(marker=>JSON.parse(sessionStorage.getItem(marker)??'null')?.requestId===null,marker);
 await page.getByText(staleText,{exact:true}).waitFor();assert.equal(polls,2,'o cenário só termina depois do poll final e da persistência terminal');
 await page.evaluate(()=>{sessionStorage.clear();localStorage.clear();});polls=0;imageReplies=['busy'];imageReadiness='waiting_planning';await page.reload();const beforePersistent=calls.length;
 await page.getByRole('button',{name:'Consultar esta tentativa',exact:true}).click();
 await page.getByText(/A espera foi pausada/).waitFor({timeout:35000});
 assert.deepEqual(calls.slice(beforePersistent).map(c=>c.path),[
  '/api/studio/chat','/api/agent/image',...Array(4).fill('/api/agent/image/status'),
 ],'planejamento persistente consulta apenas a prontidão e encerra a espera');
 await page.getByRole('button',{name:'Consultar esta tentativa',exact:true}).waitFor();
 assert.match(await page.getByText(/A espera foi pausada/).innerText(),/planejamento de referências/);
 imageReadiness='ready';
 polls=0;const beforeReady=calls.length;
 await page.getByRole('button',{name:'Consultar esta tentativa',exact:true}).click();
 await page.waitForFunction(()=>typeof window.__releaseImage==='function');
 assert.deepEqual(calls.slice(beforeReady).map(c=>c.path),[
  '/api/studio/chat','/api/agent/image/status','/api/agent/image','/api/images',
 ],'a mesma tentativa consulta a reserva antes de reenviar anexos');
 await page.evaluate(()=>window.__releaseImage());
 await page.getByText(staleText,{exact:true}).waitFor();
 await page.evaluate(()=>{sessionStorage.clear();localStorage.clear();});polls=0;imageReplies=['blocked'];await page.reload();const beforeBlocked=calls.length;
 await page.getByRole('button',{name:'Consultar esta tentativa',exact:true}).click();await page.getByText('Não conseguimos confirmar se a imagem foi gerada. Seu post foi preservado.',{exact:true}).waitFor();
 assert.equal(await page.evaluate(user=>localStorage.getItem(`compor-image-submission:${user}`),userId),null,'bloqueio anterior não marca esta requisição como enviada');
 await page.waitForTimeout(1800);assert.equal(calls.slice(beforeBlocked).filter(c=>c.path==='/api/agent/image').length,1,'resultado desconhecido anterior não é repetido automaticamente');
 const targetKey=`compor-image-target:${userId}:${projectId}:${requestId}`;
 await page.evaluate(({marker,requestId,pieceId})=>{
  localStorage.clear();sessionStorage.clear();localStorage.setItem('receipt-test-save','true');
  sessionStorage.setItem(marker,JSON.stringify({requestId,previousAttemptKey:null,imageProtocolVersion:2,imageContext:{pieceId,baseVersion:2}}));
 },{marker,requestId,pieceId});
 polls=0;await page.reload();
 const withoutId=calls.length;
 await page.getByRole('button',{name:'Consultar esta tentativa',exact:true}).click();
 await page.getByText(/O servidor ainda não confirmou o vínculo/).waitFor();
 assert.deepEqual(calls.slice(withoutId).map(call=>call.path),['/api/studio/chat']);
 assert.equal(await page.evaluate(key=>localStorage.getItem(key),targetKey),null);
 stableProposal=true;polls=0;imageReplies=['blocked'];await page.reload();
 const beforePrepared=calls.length;
 await page.getByRole('button',{name:'Consultar esta tentativa',exact:true}).click();
 await page.getByText('Não conseguimos confirmar se a imagem foi gerada. Seu post foi preservado.',{exact:true}).waitFor();
 const prepared=JSON.parse(await page.evaluate(key=>localStorage.getItem(key),targetKey));
 assert.deepEqual({...prepared,artworkDigest:prepared.artworkDigest.length},{actionId:id(13),pieceId,sourceVersion:2,version:3,artworkDigest:64});
 const first=()=>calls.slice(beforePrepared).filter(c=>c.path==='/api/agent/image');
 assert.equal(first().length,1);
 assert.deepEqual(first()[0].body.artworkInput.source,{pieceId,version:2});
 polls=0;await page.evaluate(()=>{window.__sourceUnavailable=true;});
 await page.getByRole('button',{name:'Consultar esta tentativa',exact:true}).click();
 await page.getByText('Não foi possível reconstruir o material da proposta. Verifique o envio anterior.',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Verificar envio anterior',exact:true}).waitFor();
 assert.equal(first().length,1,'sem a origem revisada só permite verificar a reserva');
 polls=0;imageReplies=['busy'];await page.reload();
 assert.equal(first().length,1,'recarregar não retoma a geração');
 await page.getByRole('button',{name:'Consultar esta tentativa',exact:true}).click();
 await page.getByText('Há outra operação de imagem em andamento na sua conta.',{exact:true}).waitFor();
 await page.waitForFunction(()=>typeof window.__releaseImage==='function');
 await page.evaluate(()=>window.__releaseImage());
 await page.getByText('Imagem gerada e adicionada a este post · versão 3.',{exact:true}).waitFor();
 await page.waitForFunction(key=>localStorage.getItem(key)===null,targetKey);
 const resumed=first().map(call=>call.body);
 assert.deepEqual(resumed.map(body=>body.version),[3,3,3],'a retomada e o busy usam a primeira versão reservada');
 assert.deepEqual(resumed.map(body=>body.artworkInput),Array(3).fill(resumed[0].artworkInput),'a edição sempre envia os mesmos bytes da versão de origem');
 assert.notEqual(resumed[0].actionBinding,resumed[1].actionBinding,'a prova renovada não muda a identidade estável');
 assert.deepEqual(await page.evaluate(pieceId=>JSON.parse(sessionStorage.getItem('receipt-test-state')).drafts.filter(d=>d.pieceId===pieceId).map(d=>d.baseVersion),pieceId),[2,3]);
 stableProposal=false;
 await page.evaluate(({marker,requestId,pieceId})=>{localStorage.clear();sessionStorage.clear();sessionStorage.setItem(marker,JSON.stringify({requestId,previousAttemptKey:null,imageContext:{pieceId,baseVersion:2}}));},{marker,requestId,pieceId});
 polls=0;await page.reload();const beforeLegacy=calls.length;await page.getByRole('button',{name:'Consultar esta tentativa',exact:true}).click();
 await page.getByText(/Esta tentativa começou antes da proteção de reenvio/).waitFor();
 assert.equal(calls.slice(beforeLegacy).filter(c=>c.path==='/api/agent/image').length,0,'tentativa antiga ambígua não pode disparar uma nova geração');
 for(const imageResult of ['refused','unknown']){
  await page.evaluate(()=>{localStorage.clear();sessionStorage.clear();});
  polls=0;imageReplies=[imageResult];closureConfirmed=false;retryRejected=true;
  await page.reload();
  const retryStart=calls.length;
  await page.getByRole('button',{name:'Consultar esta tentativa',exact:true}).click();
  const retry=page.getByRole('button',{name:imageResult==='refused'?'Tentar de novo':'Encerrar e tentar de novo',exact:true});
  const steps=()=>calls.slice(retryStart).filter(call=>call.body?.message==='Pode gerar a imagem de novo?'||['/api/agent/image','/api/agent/image/close','/api/agent/image/reconcile-closed'].includes(call.path));
  const submitCalls=()=>steps().filter(call=>call.path==='/api/studio/chat');
  await retry.click();
  await page.getByText('Não foi possível confirmar o encerramento. Sua tentativa foi preservada.',{exact:true}).waitFor();
  assert.equal(submitCalls().length,0,'sem confirmação exata não há novo pedido');
  assert.equal(await page.evaluate(userId=>localStorage.getItem(`compor-image-submission:${userId}`),userId),requestId);
  closureConfirmed=true;
  await retry.click();
  await page.getByText('Este pedido não foi enviado à OpenAI porque outro pedido deste projeto ainda precisa ser consultado. Seu trabalho foi preservado.',{exact:true}).waitFor();
  assert.equal(await retry.isVisible(),true,'uma recusa anterior ao envio preserva a opção de retry');
  assert.equal(await page.evaluate(userId=>localStorage.getItem(`compor-image-submission:${userId}`),userId),null);
  assert.equal(await page.evaluate(requestId=>JSON.parse(sessionStorage.getItem('receipt-test-state')).adjustments.find(item=>item.id===requestId).status,requestId),'failed');
  retryRejected=false;
  await retry.click();
  await page.getByText('Novo pedido recebido.',{exact:true}).waitFor();
  await retry.waitFor({state:'detached'});
  assert.equal(submitCalls().length,2);
  assert.equal(new Set([requestId,...submitCalls().map(call=>call.body.requestId)]).size,3);
  assert.ok(submitCalls().every(call=>!call.body.previousAttemptKey));
  assert.equal(steps().filter(call=>call.path==='/api/agent/image').length,1,'retry explícito pede outro turno sem reenviar a geração antiga');
  assert.ok(steps().filter(call=>call.path.endsWith('/reconcile-closed')).every(call=>call.body.requestId===requestId));
  assert.equal(steps().filter(call=>call.path==='/api/agent/image/close').length,imageResult==='unknown'?3:0);
 }
 assert.equal(await page.evaluate(()=>JSON.stringify([Object.entries(localStorage),Object.entries(sessionStorage)])).then(value=>value.includes('sk-synthetic')),false);assert.doesNotMatch(await page.locator('body').innerText(),/synthetic private error|sk-synthetic/);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
});

const adjustText='Quero fundo creme e um novo título';
const submissionKey=`compor-image-submission:${userId}`;
const imageEndpoint='/api/agent/image';
const closedEndpoint=imageEndpoint+'/reconcile-closed';
const closeEndpoint=imageEndpoint+'/close';
const statusEndpoint=imageEndpoint+'/status';
const chatEndpoint='/api/studio/chat';
const initialBinding='synthetic-binding';
const refreshedBinding='synthetic-binding-renewed';

async function deniedImageFixture(t, origin, fixturePath, browser, reason) {
 const page=await browser.newPage();
 t.after(()=>page.close());
 page.setDefaultTimeout(5000);
 const calls=[];
 const external=[];
 const prepareTarget=reason==='busy';
 const control={closedConfirmed:false,readiness:'blocked',holdScreen:'result_unknown',actionBinding:initialBinding};
 await isolateFixtureHmr(page,fixturePath);
 await page.addInitScript(value=>{
  if(value.prepareTarget)localStorage.setItem('receipt-test-save','true');
  sessionStorage.setItem(value.marker,JSON.stringify({
   requestId:value.requestId,previousAttemptKey:null,imageProtocolVersion:value.prepareTarget?2:1,imageContext:{pieceId:value.pieceId,baseVersion:2},
  }));
 },{marker,requestId,pieceId,prepareTarget});
 await page.route('**/*',async route=>{
  const request=route.request();
  const url=new URL(request.url());
  if(url.origin!==origin){external.push(url.origin);return route.abort();}
  if(!url.pathname.startsWith('/api/'))return route.continue();
  const path=url.pathname;
  const body=request.method()==='POST'?request.postDataJSON():null;
  calls.push({path,body});
  if(path===chatEndpoint){
   if(body.op==='poll'&&calls.filter(call=>call.path===imageEndpoint).length<2){
    return route.fulfill({json:{
     status:'consent_required',attemptId:id(12),prompt:'Proposta sintética',actionBinding:control.actionBinding,declineBinding:'synthetic-decline',
     ...(prepareTarget?{imageActionId:id(13),proposal:{prompt:'Proposta sintética',operation:'edit',baseImageId:pieceId,referenceIds:[]}}:{}),
    }});
   }
   if(body.message===adjustText){
    return route.fulfill({json:{status:'completed',text:'Descrição corrigida recebida.'}});
   }
   return route.fulfill({status:409,json:{status:'failed',error:'unexpected_chat_request'}});
  }
  if(path===imageEndpoint){
   if(calls.filter(call=>call.path===path).length===1){
    return route.fulfill({json:reason==='provider_rejected_400'
     ?{status:'failed',closureReason:reason,providerOutcome:'failure',retryAutomatically:false}
     :{status:'failed',error:prepareTarget?'image_busy':'image_blocked'}});
   }
   return route.fulfill({json:{status:'quality_held',qualityReason:'image_quality_rejected',retryAutomatically:false}});
  }
  if(path===closedEndpoint){
   return route.fulfill({json:control.closedConfirmed?{status:'confirmed',outcome:'failed_image_attempt'}:{status:'unverified'}});
  }
  if(path===imageEndpoint+'/hold'){
   return route.fulfill({json:{screen:control.holdScreen,sameProject:true,projectId,projectTitle:'Oficina sintética'}});
  }
  if(path===closeEndpoint)return route.fulfill({json:{status:'closed'}});
  if(path===statusEndpoint)return route.fulfill({json:{status:body.actionBinding===control.actionBinding?control.readiness:'unverified'}});
  return route.abort();
 });
 await page.goto(origin+fixturePath);
 await page.getByRole('button',{name:'Consultar esta tentativa',exact:true}).click();
 return {page,calls,control,external};
}

function responseFrom(page, path) {
 return page.waitForResponse(response=>new URL(response.url()).pathname===path,{timeout:3500});
}

test('recuperação dirigida de imagem libera descrição e retoma a reserva original',{skip:!existsSync(browserPath),timeout:60000},async t=>{
 const {origin,fixturePath}=await serveReceiptFixture(t);
 const browser=await chromium.launch({executablePath:browserPath,headless:true});
 t.after(()=>browser.close());

 await t.test('400: ajustar exige confirmar a falha e só envia a descrição manual',async t=>{
  const {page,calls,control,external}=await deniedImageFixture(t,origin,fixturePath,browser,'provider_rejected_400');
  const adjust=page.getByRole('button',{name:'Ajustar descrição',exact:true});
  const composer=page.getByRole('textbox',{name:'Sua mensagem',exact:true});
  const send=page.getByRole('button',{name:'Enviar →',exact:true});
  const imageCalls=()=>calls.filter(call=>call.path===imageEndpoint);
  const sent=()=>calls.filter(call=>call.path===chatEndpoint&&call.body.op!=='poll');
  const localSubmission=()=>page.evaluate(key=>localStorage.getItem(key),submissionKey);

  await adjust.waitFor();
  await composer.fill(adjustText);
  assert.equal(await send.isEnabled(),false);
  assert.equal(await localSubmission(),requestId);
  await Promise.all([responseFrom(page,closedEndpoint),adjust.click()]);
  assert.equal(await send.isEnabled(),false,'uma falha não confirmada preserva o bloqueio');
  assert.equal(await localSubmission(),requestId);
  assert.equal(sent().length,0);

  control.closedConfirmed=true;
  await Promise.all([responseFrom(page,closedEndpoint),adjust.click()]);
  await page.waitForFunction(()=>document.activeElement?.getAttribute('placeholder')==='Escreva uma mensagem…');
  await adjust.waitFor({state:'detached'});
  assert.equal(await send.isEnabled(),true);
  assert.equal(await composer.inputValue(),adjustText);
  assert.equal(await localSubmission(),null);
  assert.equal(calls.filter(call=>call.path===closeEndpoint).length,0);
  assert.ok(calls.filter(call=>call.path===closedEndpoint).every(call=>call.body.requestId===requestId));
  assert.equal(imageCalls().length,1);
  assert.equal(sent().length,0,'ajustar não envia o texto nem pede nova geração');

  await send.click();
  await page.getByText('Descrição corrigida recebida.',{exact:true}).waitFor();
  assert.equal(sent().length,1);
  assert.equal(sent()[0].body.message,adjustText);
  assert.notEqual(sent()[0].body.requestId,requestId);
  assert.equal(imageCalls().length,1);
  assert.deepEqual(external,[]);
 });

 for(const reason of ['blocked','busy']){
 await t.test(reason==='busy'
  ?'exploração detectada na consulta de prontidão: protege lease ativo e mantém versão 3'
  :'exploração incerta: fechar e consultar a prontidão mantém a reserva original',async t=>{
  const {page,calls,control,external}=await deniedImageFixture(t,origin,fixturePath,browser,reason);
  const prepared=reason==='busy';
  const close=page.getByRole('button',{name:/^Encerrar(?: e tentar de novo)?$/});
  const confirm=page.getByRole('button',{name:'Confirmar geração de imagem',exact:true});
  const requestedImages=()=>calls.filter(call=>call.path===imageEndpoint);
  const statusReads=()=>calls.filter(call=>call.path===statusEndpoint);
  const closeCalls=()=>calls.filter(call=>call.path===closeEndpoint);
  const noOtherAttempt=()=>{
   assert.equal(calls.filter(call=>call.path===closedEndpoint).length,0,'nenhuma imagem antiga foi enviada');
   assert.ok(calls.filter(call=>call.path===chatEndpoint).every(call=>call.body.op==='poll'&&call.body.requestId===requestId),'a recuperação usa o turno de origem');
  };
  await close.waitFor();
  assert.equal(requestedImages().length,1,'só tentou obter a reserva original');
  assert.equal(await page.evaluate(key=>localStorage.getItem(key),submissionKey),null);
  if(prepared){
   assert.equal(statusReads().length,1,'a primeira consulta descobriu o bloqueio');
   const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),`compor-image-target:${userId}:${projectId}:${requestId}`);
   assert.equal(saved.actionId,id(13));
   assert.equal(saved.sourceVersion,2);
   assert.equal(saved.version,3);
   control.holdScreen='running_with_lease';
  }
  await Promise.all([responseFrom(page,statusEndpoint),close.click()]);
  assert.equal(closeCalls().length,prepared?0:1,'a operação ativa nunca é encerrada');
  assert.equal(requestedImages().length,1,'a prontidão ainda bloqueada impede um envio');
  assert.equal(await confirm.count(),0);
  noOtherAttempt();

  control.holdScreen='result_unknown';
  control.readiness='ready';
  await Promise.all([responseFrom(page,statusEndpoint),close.click()]);
  await confirm.waitFor();
  assert.equal(requestedImages().length,1,'a prontidão não substitui o consentimento explícito');
  assert.equal(closeCalls().length,prepared?1:2);
  assert.ok(closeCalls().every(call=>call.body.projectId===projectId));
  const original=requestedImages()[0].body;
  const reservation=Object.fromEntries(['projectId','pieceId','version','attemptId','actionBinding'].map(key=>[key,original[key]]));
  assert.equal(original.version,prepared?3:2);
  assert.deepEqual(statusReads().map(call=>call.body),Array(prepared?3:2).fill(reservation));

  async function assertUndispatched(message) {
   assert.equal(requestedImages().length,1,message);
   assert.equal(await page.evaluate(key=>localStorage.getItem(key),submissionKey),null);
  }
  assert.equal(original.actionBinding,initialBinding);
  if(prepared){
   control.readiness='unverified';
   await Promise.all([responseFrom(page,statusEndpoint),confirm.click()]);
   await page.getByText('Não foi possível confirmar o encerramento. Sua tentativa foi preservada.',{exact:true}).waitFor();
   assert.deepEqual(statusReads().at(-1).body,reservation,'a confirmação verifica o vínculo que está prestes a usar');
   await assertUndispatched('vínculo não verificado preserva a reserva sem marcar envio');
   control.actionBinding=refreshedBinding;
   control.holdScreen='none';
   control.readiness='ready';
  }

  const consult=page.getByRole('button',{name:'Consultar esta tentativa',exact:true});
  await Promise.all([responseFrom(page,chatEndpoint),consult.click()]);
  await consult.waitFor();
  assert.equal(calls.filter(call=>call.path===chatEndpoint).length,2);
  await assertUndispatched('consultar a mesma proposta não dispara a imagem');

  const expectedReservation=prepared?{...reservation,actionBinding:refreshedBinding}:reservation;
  if(prepared){
   await close.waitFor();
   assert.equal(await confirm.count(),0,'uma prova renovada precisa de nova consulta de prontidão');
   await Promise.all([responseFrom(page,statusEndpoint),close.click()]);
   await confirm.waitFor();
   assert.deepEqual(statusReads().at(-1).body,expectedReservation);
   assert.equal(closeCalls().length,1,'sem bloqueio ativo só se consulta a prontidão');
   await assertUndispatched('a nova prova e a prontidão ainda exigem consentimento');
  }

  await Promise.all([responseFrom(page,statusEndpoint),responseFrom(page,imageEndpoint),confirm.click()]);
  await page.getByText('A revisão de imagem reteve esta proposta. Seu post foi preservado.',{exact:true}).waitFor();
  assert.equal(await confirm.count(),0);
  assert.equal(requestedImages().length,2);
  assert.deepEqual(statusReads().at(-1).body,expectedReservation);
  const expectedImage=prepared?{...original,actionBinding:refreshedBinding}:original;
  assert.deepEqual(requestedImages()[1].body,expectedImage,'retoma a versão e os bytes originais com o vínculo válido');
  if(prepared){
   const versions=await page.evaluate(id=>JSON.parse(sessionStorage.getItem('receipt-test-state')).drafts
    .filter(draft=>draft.pieceId===id).map(draft=>draft.baseVersion),pieceId);
   assert.deepEqual(versions,[2,3],'retomar a reserva não cria outra versão');
  }
  noOtherAttempt();
  assert.deepEqual(external,[]);
 });
 }
});
