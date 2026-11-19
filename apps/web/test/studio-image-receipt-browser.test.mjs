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

test('receipt confirma aplicação aguardada sem alterar o agente; escopo e falha não regeneram imagem',{skip:!existsSync(browserPath),timeout:90000},async t=>{
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
 const completedPollStarted=Promise.withResolvers(),releaseCompletedPoll=Promise.withResolvers(),completedPollDelivered=Promise.withResolvers();
 const browser=await chromium.launch({executablePath:browserPath,headless:true});t.after(async()=>{releaseCompletedPoll.resolve();await browser.close();});const page=await browser.newPage();page.setDefaultTimeout(6000);const calls=[],errors=[],external=[];let polls=0,imageReplies=[],imageReadiness='ready',holdCompletedPoll=false,stableProposal=false;
 await isolateFixtureHmr(page,`/${basename(fixture)}`);
 await page.addInitScript(({marker,requestId})=>{if(sessionStorage.getItem(marker)===null)sessionStorage.setItem(marker,JSON.stringify({requestId,previousAttemptKey:null,imageProtocolVersion:1,imageContext:{pieceId:'00000000-0000-4000-8000-000000000004',baseVersion:2}}));},{marker,requestId});
 page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{if(!request.url().startsWith(origin))external.push(request.url());});
 await page.route('**/api/**',async route=>{
  const request=route.request(),url=new URL(request.url()),body=request.method()==='POST'?request.postDataJSON():null;calls.push({path:url.pathname,body,query:Object.fromEntries(url.searchParams)});
  if(url.pathname==='/api/studio/chat'){
   assert.equal(body.op,'poll');const first=++polls===1,held=!first&&holdCompletedPoll;
   if(held){holdCompletedPoll=false;completedPollStarted.resolve();await releaseCompletedPoll.promise;}
   await route.fulfill({status:202,json:first?{status:'consent_required',attemptId:id(12),prompt:'Proposta sintética',actionBinding:stableProposal?`renewed-binding-${calls.length}`:'synthetic-binding',declineBinding:'synthetic-decline',...(stableProposal?{imageActionId:id(13),proposal:{prompt:'Proposta sintética',operation:'edit',baseImageId:pieceId,referenceIds:[]}}:{})}:{status:'completed',text:staleText}});
   if(held)completedPollDelivered.resolve();return;
  }
  if(url.pathname==='/api/agent/image'){
   assert.equal(Object.hasOwn(body,'apiKey'),false);
   assert.equal(request.headers()['x-compor-openai-key'],apiKey);
   assert.equal(request.headers()['content-type'],'application/vnd.compor.byok+json');
   const next=imageReplies.shift();return route.fulfill(next?{status:200,json:{status:next}}:{status:202,json:{status:'accepted',assetId}});
  }
  if(url.pathname==='/api/agent/image/status'){
   assert.deepEqual(Object.keys(body).sort(),['actionBinding','attemptId','pieceId','projectId','version']);
   assert.equal(request.headers()['x-compor-openai-key'],undefined,'consulta de prontidão não carrega credencial');
   assert.equal(request.headers()['content-type'],'application/json');
   return route.fulfill({json:{status:imageReadiness}});
  }
  if(url.pathname==='/api/images')return route.fulfill({contentType:'image/png',body:png});
  throw Error('unexpected API');
 });
 await page.goto(`${origin}/${basename(fixture)}`);await page.getByRole('button',{name:'Consultar esta tentativa',exact:true}).click();await page.waitForFunction(()=>typeof window.__releaseImage==='function');
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
 await page.getByRole('button',{name:'Consultar esta tentativa',exact:true}).click();await page.getByText(/Uma geração anterior tem resultado incerto/).waitFor();
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
 await page.getByText(/Uma geração anterior tem resultado incerto/).waitFor();
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
 assert.equal(await page.evaluate(()=>JSON.stringify([Object.entries(localStorage),Object.entries(sessionStorage)])).then(value=>value.includes('sk-synthetic')),false);assert.doesNotMatch(await page.locator('body').innerText(),/synthetic private error|sk-synthetic/);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
});
