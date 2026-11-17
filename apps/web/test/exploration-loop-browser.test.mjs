import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { chromium } from 'playwright-core';
import { stopApp, waitForApp } from './wait-for-app.mjs';

const browserPath=process.env.BROWSER_EXECUTABLE_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const fixture=new URL('../app/exploration-loop-test/',import.meta.url);
const userId='00000000-0000-4000-8000-000000000001',projectId='00000000-0000-4000-8000-000000000003',pieceId='00000000-0000-4000-8000-000000000004';
const source=`'use client';
import {useState,StrictMode} from 'react';
import {useExplorationLoop} from '../use-exploration-loop';
import {createStudioState,updateBrief,createPost,prepareAdjustment,settleAdjustment,addMessage,REFERENCE_SELECTION_EVENT} from '../../lib/studio-state';
const at=()=>new Date().toISOString(),uid=()=>crypto.randomUUID();
function ask(value){const requestId=uid(),asked=prepareAdjustment(createPost(value,{pieceId:'${pieceId}'}),{requestId,messageId:uid(),instruction:REFERENCE_SELECTION_EVENT,origin:'system',createdAt:at(),eventId:uid()});return settleAdjustment(asked,{requestId,status:'completed',result:{messageId:uid(),text:'Posso seguir pela tipografia serifada?'},createdAt:at(),eventId:uid()});}
function Demo(){const [connected,setConnected]=useState(true),[enabled,setEnabled]=useState(true);const [state,setState]=useState(()=>updateBrief(createStudioState({userId:'${userId}',projectId:'${projectId}'}),{offer:'Aula de cerâmica'}));const loop=useExplorationLoop({userId:'${userId}',projectId:'${projectId}',state,getState:()=>state,hasApiKey:connected,getApiKey:()=>connected?'sk-synthetic-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx':'',isAuthenticated:()=>connected,enabled});return <><button onClick={()=>setState(value=>updateBrief(value,{offer:'Oficina de gravura'}))}>Mudar briefing</button><button onClick={()=>setConnected(false)}>Desconectar</button><button onClick={()=>setConnected(true)}>Reconectar</button><button onClick={()=>setEnabled(false)}>Sair da exploração</button><button onClick={()=>setEnabled(true)}>Voltar à exploração</button><button onClick={loop.pause}>Pausar</button><button onClick={loop.resume}>Retomar</button><button onClick={()=>setState(ask)}>Pergunta da seleção</button><button onClick={()=>setState(value=>addMessage(value,{id:uid(),role:'user',conversationId:'references',text:'Pode seguir',createdAt:at()}))}>Responder no chat</button><output>{loop.status}</output>{loop.awaitingFeedback && <p>Aguardando decisão sobre duas rodadas</p>}</>};export default function Page(){return <StrictMode><Demo/></StrictMode>};`;
async function referenceSignals(context){await context.route('**/api/studio/references/signals',route=>route.fulfill({json:{signals:[]}}));}
async function until(fn, predicate, timeout=6000){const end=Date.now()+timeout;for(;;){const result=await fn();if(predicate(result))return result;if(Date.now()>end)throw Error('estado não observado');await new Promise(resolve=>setTimeout(resolve,25));}}

test('exploração sequencial protege abas, recarga, desconexão e resultado incerto', {skip:!existsSync(browserPath),timeout:150000}, async t=>{
  assert.equal(existsSync(fixture),false);await mkdir(fixture);await writeFile(new URL('page.tsx',fixture),source);
  const socket=createServer();await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));const origin=`http://127.0.0.1:${port}`;
  let logs='';const child=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--webpack','-p',String(port),'-H','127.0.0.1'],{stdio:['ignore','pipe','pipe'],env:{...process.env,SUPABASE_URL:'',SUPABASE_PUBLISHABLE_KEY:''}});for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{logs=(logs+chunk).slice(-5000);});
  let browser;t.after(async()=>{try{await browser?.close();}finally{try{await stopApp(child);}finally{await rm(fixture,{recursive:true,force:true});}}});
  await waitForApp({url:`${origin}/exploration-loop-test`,child,signal:t.signal,diagnostics:()=>logs});browser=await chromium.launch({executablePath:browserPath,headless:true});
  const context=await browser.newContext();await referenceSignals(context);const posts=[],pending=[];let releaseFirst;const gate=new Promise(resolve=>{releaseFirst=resolve;});
  await context.route('**/api/studio/explorations**',async route=>{
    if(new URL(route.request().url()).pathname.endsWith('/status'))return route.fulfill({json:{status:'active'}});
    if(new URL(route.request().url()).pathname.endsWith('/signals'))return route.fulfill({json:{signals:[]}});
    const request=route.request();if(request.method()==='GET')return route.fulfill({json:{images:pending.map(item=>({id:item.id,project_id:projectId,state:item.state}))}});
    const body=request.postDataJSON();posts.push(body);const row={id:body.requestId,state:'running'};pending.push(row);
    if(posts.length===1)await gate;
    row.state=posts.length<3?'completed':'unknown';
    try {await route.fulfill({status:row.state==='completed'?200:502,json:{status:row.state,requestId:row.id}});}catch{}
  });
  const a=await context.newPage();await a.goto(`${origin}/exploration-loop-test`);await until(()=>posts.length,n=>n===1);
  const b=await context.newPage();await b.goto(`${origin}/exploration-loop-test`);await b.getByRole('button',{name:'Desconectar'}).waitFor();
  assert.equal(posts.length,1,'segunda aba não inicia uma operação concorrente');await a.getByRole('button',{name:'Mudar briefing'}).click();releaseFirst();
  await a.getByText(/resultado da exploração não foi confirmado/i).waitFor();
  await until(()=>posts.length,n=>n===3);assert.notEqual(posts[0].prompt,posts[1].prompt,'duas primeiras propostas variam');assert.match(posts[1].prompt,/Oficina de gravura/,'novo contexto orienta a proposta seguinte');
  assert.equal(new Set(posts.map(post=>post.requestId)).size,3);assert.equal(posts.length,3);
  await a.reload();await a.getByText(/exploração anterior ainda não foi confirmada/i).waitFor();
  assert.equal(posts.length,3,'recarregar não repete chamada nem inicia novo ID após resultado incerto');
  await context.close();
  const c=await browser.newContext();await referenceSignals(c);const calls=[];let release;const waiting=new Promise(resolve=>{release=resolve;});
  await c.route('**/api/studio/explorations**',async route=>{
    if(new URL(route.request().url()).pathname.endsWith('/status'))return route.fulfill({json:{status:'active'}});
    if(new URL(route.request().url()).pathname.endsWith('/signals'))return route.fulfill({json:{signals:[]}});
    if(route.request().method()==='GET')return route.fulfill({json:{images:calls.map(item=>({id:item.requestId,project_id:projectId,state:'running'}))}});
    const body=route.request().postDataJSON();calls.push(body);await waiting;try{await route.fulfill({json:{status:'completed',requestId:body.requestId}});}catch{}
  });
  const page=await c.newPage();await page.goto(`${origin}/exploration-loop-test`);await until(()=>calls.length,n=>n===1);await page.getByRole('button',{name:'Desconectar'}).click();release();await page.getByText('Conecte sua IA para explorar.').waitFor();
  await page.getByRole('button',{name:'Reconectar'}).click();await page.getByText(/exploração anterior ainda não foi confirmada/i).waitFor();
  assert.equal(calls.length,1,'desconectar impede novos envios e reconexão não repete resultado desconhecido');await c.close();
  const d=await browser.newContext();await referenceSignals(d);const ending=[];let releaseEnd;const held=new Promise(resolve=>{releaseEnd=resolve;});
  await d.route('**/api/studio/explorations**',async route=>{
    if(new URL(route.request().url()).pathname.endsWith('/status'))return route.fulfill({json:{status:'active'}});
    if(new URL(route.request().url()).pathname.endsWith('/signals'))return route.fulfill({json:{signals:[]}});
    if(route.request().method()==='GET')return route.fulfill({json:{images:ending.map(item=>({id:item.requestId,project_id:projectId,state:'running'}))}});
    const body=route.request().postDataJSON();ending.push(body);await held;try{await route.fulfill({json:{status:'completed',requestId:body.requestId}});}catch{}
  });
  const closing=await d.newPage();await closing.goto(`${origin}/exploration-loop-test`);await until(()=>ending.length,n=>n===1);await closing.close();
  const reopened=await d.newPage();await reopened.goto(`${origin}/exploration-loop-test`);await reopened.getByText(/exploração anterior ainda não foi confirmada/i).waitFor();
  assert.equal(ending.length,1,'encerrar a aba não repete uma geração pendente');releaseEnd();await d.close();
  const e=await browser.newContext();await referenceSignals(e);const busy=[];
  await e.route('**/api/studio/explorations**',async route=>{
    if(new URL(route.request().url()).pathname.endsWith('/status'))return route.fulfill({json:{status:'active'}});
    if(new URL(route.request().url()).pathname.endsWith('/signals'))return route.fulfill({json:{signals:[]}});
    if(route.request().method()==='GET')return route.fulfill({json:{images:[]}});
    const body=route.request().postDataJSON();busy.push(body);
    return route.fulfill({status:busy.length===1?409:502,json:{status:busy.length===1?'busy':'unknown',requestId:body.requestId}});
  });
  const retry=await e.newPage();await retry.goto(`${origin}/exploration-loop-test`);
  await retry.getByText(/outra geração está em andamento/i).waitFor();
  assert.equal(await retry.evaluate(key=>localStorage.getItem(key),`compor-exploration-pending:${userId}`),null,'busy confirmado libera somente marcador não reservado');
  await retry.getByText(/resultado da exploração não foi confirmado/i).waitFor({timeout:10000});
  assert.equal(busy.length,2,'busy aguarda e tenta novamente; unknown interrompe');
  assert.notEqual(busy[0].requestId,busy[1].requestId);await e.close();
  const f=await browser.newContext();await referenceSignals(f);const blocked=[];
  await f.route('**/api/studio/explorations**',async route=>{
    if(new URL(route.request().url()).pathname.endsWith('/status'))return route.fulfill({json:{status:'active'}});
    if(new URL(route.request().url()).pathname.endsWith('/signals'))return route.fulfill({json:{signals:[]}});
    if(route.request().method()==='GET')return route.fulfill({json:{images:[]}});
    const body=route.request().postDataJSON();blocked.push(body);return route.fulfill({status:409,json:{status:'blocked',requestId:body.requestId}});
  });
  const blockedPage=await f.newPage();await blockedPage.goto(`${origin}/exploration-loop-test`);
  await blockedPage.getByText(/geração anterior com resultado desconhecido/i).waitFor();
  assert.equal(blocked.length,1,'blocked para a sequência');
  assert.equal(await blockedPage.evaluate(key=>localStorage.getItem(key),`compor-exploration-pending:${userId}`),null);await f.close();
  const g=await browser.newContext();await referenceSignals(g);const batches=[];
  await g.addInitScript(()=>{const real=Date.now.bind(Date);let offset=0;Date.now=()=>real()+offset;window.advanceTestClock=amount=>{offset+=amount;};});
  await g.route('**/api/studio/explorations**',async route=>{
    if(new URL(route.request().url()).pathname.endsWith('/status'))return route.fulfill({json:{status:'active'}});
    if(new URL(route.request().url()).pathname.endsWith('/signals'))return route.fulfill({json:{signals:[]}});
    if(route.request().method()==='GET')return route.fulfill({json:{images:[]}});
    const body=route.request().postDataJSON();batches.push(body);
    return route.fulfill({status:batches.length===4?502:200,json:{status:batches.length===4?'unknown':'completed',requestId:body.requestId}});
  });
  const batchPage=await g.newPage();await batchPage.goto(`${origin}/exploration-loop-test`);
  await batchPage.getByText(/próximo lote em/i).waitFor();assert.equal(batches.length,3);
  assert.deepEqual(batches.map(item=>item.batch.position),[1,2,3]);assert.equal(new Set(batches.map(item=>item.batch.id)).size,1);
  await batchPage.getByRole('button',{name:'Pausar'}).click();await batchPage.evaluate(()=>window.advanceTestClock(30000));
  await batchPage.getByRole('button',{name:'Retomar'}).click();await batchPage.getByText(/próximo lote em/i).waitFor();
  assert.equal(batches.length,3,'pausa congela a espera e não dispara um novo lote');
  await batchPage.evaluate(()=>window.advanceTestClock(16000));await batchPage.getByText(/resultado da exploração não foi confirmado/i).waitFor();
  assert.equal(batches.length,4);assert.equal(batches[3].batch.position,1);assert.notEqual(batches[3].batch.id,batches[0].batch.id);
  await g.close();
  const h=await browser.newContext();await referenceSignals(h);const departed=[];let finish,departedConfirmed=false;const inFlight=new Promise(resolve=>{finish=resolve;});
  await h.route('**/api/studio/explorations**',async route=>{
    if(new URL(route.request().url()).pathname.endsWith('/status'))return route.fulfill({json:{status:'active'}});
    if(new URL(route.request().url()).pathname.endsWith('/signals'))return route.fulfill({json:{signals:[]}});
    if(route.request().method()==='GET')return route.fulfill({json:{images:departedConfirmed?departed.map(item=>({id:item.requestId,project_id:projectId,state:'completed'})):[]}});
    const body=route.request().postDataJSON();departed.push(body);await inFlight;await route.fulfill({json:{status:'completed',requestId:body.requestId}});departedConfirmed=true;
  });
  const leaving=await h.newPage();await leaving.goto(`${origin}/exploration-loop-test`);await until(()=>departed.length,n=>n===1);
  await leaving.getByRole('button',{name:'Sair da exploração'}).click();finish();
  await until(()=>departedConfirmed,Boolean);
  assert.notEqual(await leaving.evaluate(key=>localStorage.getItem(key),`compor-exploration-pending:${userId}`),null,'sair preserva o recibo até a consulta');
  await leaving.getByRole('button',{name:'Voltar à exploração'}).click();
  await leaving.getByText('A tentativa anterior foi confirmada. Peça propostas para continuar.').waitFor();
  assert.equal(await leaving.evaluate(key=>localStorage.getItem(key),`compor-exploration-pending:${userId}`),null,'GET da tentativa confirma o recibo');
  await leaving.waitForTimeout(500);assert.equal(departed.length,1,'consultar ao voltar não inicia outro pedido');await h.close();

  const late=await browser.newContext();await referenceSignals(late);const latePosts=[];let finishThird,thirdConfirmed=false;const thirdHeld=new Promise(resolve=>{finishThird=resolve;});
  await late.addInitScript(()=>{const real=Date.now.bind(Date);let offset=0;Date.now=()=>real()+offset;window.advanceTestClock=amount=>{offset+=amount;};});
  await late.route('**/api/studio/explorations**',async route=>{
    const path=new URL(route.request().url()).pathname;
    if(path.endsWith('/status'))return route.fulfill({json:{status:'active'}});
    if(path.endsWith('/signals'))return route.fulfill({json:{signals:[]}});
    if(route.request().method()==='GET')return route.fulfill({json:{images:thirdConfirmed?[{id:latePosts[2].requestId,project_id:projectId,state:'completed'}]:[]}});
    const body=route.request().postDataJSON();latePosts.push(body);
    if(latePosts.length===3)await thirdHeld;
    const result=await route.fulfill({status:latePosts.length===4?502:200,json:{status:latePosts.length===4?'unknown':'completed',requestId:body.requestId}});if(latePosts.length===3)thirdConfirmed=true;return result;
  });
  const returning=await late.newPage();await returning.goto(`${origin}/exploration-loop-test`);await until(()=>latePosts.length,n=>n===3);
  await returning.getByRole('button',{name:'Sair da exploração'}).click();await returning.getByText('Exploração disponível na tela de referências.').waitFor();finishThird();
  await until(()=>thirdConfirmed,Boolean);
  assert.notEqual(await returning.evaluate(key=>localStorage.getItem(key),`compor-exploration-pending:${userId}`),null);
  const batchKey=`compor-exploration-batch:${userId}:${projectId}`;
  await returning.evaluate(()=>window.advanceTestClock(30000));await returning.getByRole('button',{name:'Voltar à exploração'}).click();
  await returning.getByText('A tentativa anterior foi confirmada. Peça propostas para continuar.').waitFor();
  const reconciled=JSON.parse(await returning.evaluate(key=>localStorage.getItem(key),batchKey));assert.equal(reconciled.completed,3);
  assert.equal(latePosts.length,3,'consulta ao retornar não inicia o próximo lote');
  await returning.getByRole('button',{name:'Retomar'}).click();
  await returning.getByText(/próximo lote em/i).waitFor();assert.equal(latePosts.length,3,'tempo fora da tela não inicia o próximo lote');
  await returning.evaluate(()=>window.advanceTestClock(12000));await returning.waitForTimeout(1000);assert.equal(latePosts.length,3,'a espera continua visível até passar o intervalo');
  await returning.evaluate(()=>window.advanceTestClock(4000));await returning.getByText(/resultado da exploração não foi confirmado/i).waitFor({timeout:10000});
  assert.equal(latePosts.length,4);assert.equal(latePosts[3].batch.position,1);await late.close();

  const i=await browser.newContext();await referenceSignals(i);const unattended=[];
  await i.addInitScript(()=>{const real=Date.now.bind(Date);let offset=0;Date.now=()=>real()+offset;window.advanceTestClock=amount=>{offset+=amount;};});
  await i.route('**/api/studio/explorations**',async route=>{
    if(new URL(route.request().url()).pathname.endsWith('/status'))return route.fulfill({json:{status:'active'}});
    if(new URL(route.request().url()).pathname.endsWith('/signals'))return route.fulfill({json:{signals:[]}});
    if(new URL(route.request().url()).pathname.endsWith('/resume'))return route.fulfill({json:{status:'resumed'}});
    if(route.request().method()==='GET')return route.fulfill({json:{images:[]}});
    const body=route.request().postDataJSON();unattended.push(body);
    return route.fulfill({status:unattended.length===7?502:200,json:{status:unattended.length===7?'unknown':'completed',requestId:body.requestId}});
  });
  const quiet=await i.newPage();await quiet.goto(`${origin}/exploration-loop-test`);await quiet.getByText(/próximo lote em/i).waitFor();
  assert.equal(unattended.length,3);await quiet.evaluate(()=>window.advanceTestClock(16000));
  await quiet.getByText('Aguardando decisão sobre duas rodadas').waitFor();assert.equal(unattended.length,6);
  await quiet.reload();await quiet.getByText('Aguardando decisão sobre duas rodadas').waitFor();
  await quiet.evaluate(({userId,projectId,imageId})=>localStorage.setItem(`compor-exploration-selected:${userId}:${projectId}:${imageId}`,'1'),{userId,projectId,imageId:unattended[0].requestId});
  await quiet.waitForTimeout(300);assert.equal(unattended.length,6,'selecionar depois da pausa e recarregar não retomam a geração');
  await quiet.getByRole('button',{name:'Retomar'}).click();await quiet.getByText(/resultado da exploração não foi confirmado/i).waitFor();
  assert.equal(unattended.length,7,'somente o pedido explícito retoma');await i.close();

  const j=await browser.newContext();await referenceSignals(j);const reviewed=[];let feedback=[];
  await j.addInitScript(()=>{const real=Date.now.bind(Date);let offset=0;Date.now=()=>real()+offset;window.advanceTestClock=amount=>{offset+=amount;};});
  await j.route('**/api/studio/explorations**',async route=>{
    if(new URL(route.request().url()).pathname.endsWith('/status'))return route.fulfill({json:{status:'active'}});
    if(new URL(route.request().url()).pathname.endsWith('/signals'))return route.fulfill({json:{signals:feedback}});
    if(route.request().method()==='GET')return route.fulfill({json:{images:[]}});
    const body=route.request().postDataJSON();reviewed.push(body);return route.fulfill({json:{status:'completed',requestId:body.requestId}});
  });
  const engaged=await j.newPage();await engaged.goto(`${origin}/exploration-loop-test`);await engaged.getByText(/próximo lote em/i).waitFor();
  feedback=[{id:crypto.randomUUID(),projectId,imageId:reviewed[0].requestId,action:'comment',comment:'Gostei desta composição',supersedes:null,createdAt:new Date().toISOString(),plan:null}];
  await engaged.evaluate(()=>window.advanceTestClock(16000));await until(()=>reviewed.length,n=>n===6,15000);
  await engaged.getByText(/próximo lote em/i).waitFor();assert.equal(await engaged.getByText('Aguardando decisão sobre duas rodadas').count(),0,'comentário sobre imagem daquele lote reinicia a contagem');
  await engaged.evaluate(()=>window.advanceTestClock(16000));await engaged.getByText('Aguardando decisão sobre duas rodadas').waitFor();
  assert.equal(reviewed.length,9);await j.close();

  const k=await browser.newContext();await referenceSignals(k);const selected=[];
  await k.addInitScript(()=>{const real=Date.now.bind(Date);let offset=0;Date.now=()=>real()+offset;window.advanceTestClock=amount=>{offset+=amount;};});
  await k.route('**/api/studio/explorations**',async route=>{
    if(new URL(route.request().url()).pathname.endsWith('/status'))return route.fulfill({json:{status:'active'}});
    if(new URL(route.request().url()).pathname.endsWith('/signals'))return route.fulfill({json:{signals:[]}});
    if(route.request().method()==='GET')return route.fulfill({json:{images:[]}});
    const body=route.request().postDataJSON();selected.push(body);return route.fulfill({status:selected.length===7?502:200,json:{status:selected.length===7?'unknown':'completed',requestId:body.requestId}});
  });
  const chooser=await k.newPage();await chooser.goto(`${origin}/exploration-loop-test`);await chooser.getByText(/próximo lote em/i).waitFor();
  await chooser.evaluate(({userId,projectId,imageId})=>localStorage.setItem(`compor-exploration-selected:${userId}:${projectId}:${imageId}`,'1'),{userId,projectId,imageId:selected[0].requestId});
  await chooser.evaluate(()=>window.advanceTestClock(16000));await until(()=>selected.length,n=>n===6,15000);
  await chooser.getByText(/próximo lote em/i).waitFor();assert.equal(await chooser.getByText('Aguardando decisão sobre duas rodadas').count(),0,'selecionar imagem do lote reinicia a contagem');
  await chooser.evaluate(()=>window.advanceTestClock(16000));await chooser.getByText(/resultado da exploração não foi confirmado/i).waitFor();
  assert.equal(selected.length,7);await k.close();

  const l=await browser.newContext();await referenceSignals(l);const remote=[];let resumeBlocked=true,resumes=0;
  await l.route('**/api/studio/explorations**',async route=>{
    const path=new URL(route.request().url()).pathname;
    if(path.endsWith('/status'))return route.fulfill({json:{status:'active'}});
    if(path.endsWith('/signals'))return route.fulfill({json:{signals:[]}});
    if(path.endsWith('/resume')){resumes++;return route.fulfill({json:{status:resumeBlocked?'blocked':'resumed'}});}
    if(route.request().method()==='GET')return route.fulfill({json:{images:[]}});
    const body=route.request().postDataJSON();remote.push(body);
    return route.fulfill({status:remote.length===1?409:502,json:{status:remote.length===1?'awaiting_feedback':'unknown',requestId:body.requestId,retryAutomatically:false}});
  });
  const gated=await l.newPage();await gated.goto(`${origin}/exploration-loop-test`);await gated.getByText('Aguardando decisão sobre duas rodadas').waitFor();
  assert.equal(await gated.evaluate(key=>localStorage.getItem(key),`compor-exploration-pending:${userId}`),null,'bloqueio confirmado não mantém marcador de tentativa não reservada');
  await gated.getByRole('button',{name:'Retomar'}).click();await until(()=>resumes,n=>n===1);assert.equal(remote.length,1,'servidor bloqueado não libera geração');
  await gated.reload();await gated.getByText('Aguardando decisão sobre duas rodadas').waitFor();resumeBlocked=false;
  await gated.getByRole('button',{name:'Retomar'}).click();await gated.getByText(/resultado da exploração não foi confirmado/i).waitFor();
  assert.equal(resumes,2);assert.equal(remote.length,2);await l.close();

  const m=await browser.newContext();await referenceSignals(m);let serverPaused=true;const shared=[];
  await m.route('**/api/studio/explorations**',async route=>{
    const path=new URL(route.request().url()).pathname;
    if(path.endsWith('/status'))return route.fulfill({json:{status:serverPaused?'awaiting_feedback':'active'}});
    if(path.endsWith('/resume')){serverPaused=false;return route.fulfill({json:{status:'resumed'}});}
    if(path.endsWith('/signals'))return route.fulfill({json:{signals:[]}});
    if(route.request().method()==='GET')return route.fulfill({json:{images:[]}});
    const body=route.request().postDataJSON();shared.push(body);return route.fulfill({status:502,json:{status:'unknown',requestId:body.requestId}});
  });
  const otherDevice=await m.newPage();await otherDevice.goto(`${origin}/exploration-loop-test`);
  await otherDevice.getByText('Aguardando decisão sobre duas rodadas').waitFor();assert.equal(shared.length,0,'gate da conta é observado antes de reservar qualquer imagem');
  await otherDevice.getByRole('button',{name:'Retomar'}).click();await otherDevice.getByText(/resultado da exploração não foi confirmado/i).waitFor();
  assert.equal(shared.length,1);await m.close();

  const n=await browser.newContext();await referenceSignals(n);let forbiddenPosts=0;
  await n.route('**/api/studio/explorations**',async route=>{
    const path=new URL(route.request().url()).pathname;
    if(path.endsWith('/status'))return route.fulfill({status:503,json:{error:'unavailable'}});
    if(path.endsWith('/signals'))return route.fulfill({json:{signals:[]}});
    if(route.request().method()==='POST')forbiddenPosts++;
    return route.fulfill({json:{images:[]}});
  });
  const offlineGate=await n.newPage();await offlineGate.goto(`${origin}/exploration-loop-test`);
  await offlineGate.getByText(/Não foi possível confirmar a exploração/).waitFor();assert.equal(forbiddenPosts,0,'falha de leitura do gate bloqueia novas gerações');await n.close();

  const o=await browser.newContext();await referenceSignals(o);const answered=[];let gates=0,comments=[];
  await o.addInitScript(()=>{const real=Date.now.bind(Date);let offset=0;Date.now=()=>real()+offset;window.advanceTestClock=amount=>{offset+=amount;};});
  await o.route('**/api/studio/explorations**',async route=>{
    const path=new URL(route.request().url()).pathname;
    if(path.endsWith('/status')){gates++;return route.fulfill({json:{status:'active'}});}
    if(path.endsWith('/signals'))return route.fulfill({json:{signals:comments}});
    if(route.request().method()==='GET')return route.fulfill({json:{images:[]}});
    const body=route.request().postDataJSON();answered.push(body);
    return route.fulfill({status:answered.length===7?502:200,json:{status:answered.length===7?'unknown':'completed',requestId:body.requestId}});
  });
  const asking=await o.newPage(),idle=async()=>{for(let turn=0;turn<3;turn++){await asking.waitForTimeout(800);await asking.evaluate(()=>window.advanceTestClock(16000));}await asking.waitForTimeout(2000);};
  await asking.goto(`${origin}/exploration-loop-test`);await asking.getByText(/próximo lote em/i).waitFor();assert.equal(answered.length,3);
  await asking.getByRole('button',{name:'Pergunta da seleção'}).click();await asking.getByText('A exploração aguarda sua resposta no chat.').waitFor();
  await idle();assert.equal(answered.length,3,'a pergunta do turno de seleção segura o próximo lote');
  comments=[{id:crypto.randomUUID(),projectId,imageId:answered[0].requestId,action:'comment',comment:'Gostei desta composição',supersedes:null,createdAt:new Date().toISOString(),plan:null}];
  let observed=gates;await asking.getByRole('button',{name:'Responder no chat'}).click();await until(()=>gates,n=>n>observed);
  await asking.evaluate(()=>window.advanceTestClock(16000));await until(()=>answered.length,n=>n===6,15000);
  await asking.getByText(/próximo lote em/i).waitFor();assert.equal(answered.length,6,'mensagem no chat retoma a exploração');
  await asking.getByRole('button',{name:'Pergunta da seleção'}).click();await asking.getByText('A exploração aguarda sua resposta no chat.').waitFor();
  await idle();assert.equal(answered.length,6,'nova pergunta volta a segurar o lote');
  observed=gates;await asking.getByRole('button',{name:'Retomar'}).click();await until(()=>gates,n=>n>observed);
  await asking.evaluate(()=>window.advanceTestClock(16000));await asking.getByText(/resultado da exploração não foi confirmado/i).waitFor({timeout:10000});
  assert.equal(answered.length,7,'pedido explícito retoma a exploração');await o.close();
});

const questionFixture=new URL('../app/selection-question-test/',import.meta.url);
const questionSource=`'use client';
import {useState,useEffect} from 'react';
import {useExplorationLoop} from '../use-exploration-loop';
import {createStudioState,updateBrief,createPost,prepareAdjustment,settleAdjustment,addMessage,addReference,removeReference,parseStudioState,REFERENCE_SELECTION_EVENT,type StudioState} from '../../lib/studio-state';
const at=()=>new Date().toISOString(),uid=()=>crypto.randomUUID();
const initial=()=>updateBrief(createStudioState({userId:'${userId}',projectId:'${projectId}'}),{offer:'Aula de cerâmica'});
function ask(value:StudioState){
 value=createPost(value,{pieceId:'${pieceId}'});
 if(!value.references.length)value=addReference(value,{id:uid(),name:'ref.png',mime:'image/png',size:20,width:1,height:1});
 const requestId=uid(),pending=prepareAdjustment(value,{requestId,messageId:uid(),instruction:REFERENCE_SELECTION_EVENT,origin:'system',createdAt:at(),eventId:uid()});
 return settleAdjustment(pending,{requestId,status:'completed',result:{messageId:uid(),text:'Posso seguir pela tipografia serifada?'},createdAt:at(),eventId:uid()});
}
function auto(value:StudioState){return prepareAdjustment(removeReference(updateBrief(value,{offer:'Novo briefing'}),value.references[0].id),{requestId:uid(),messageId:uid(),instruction:REFERENCE_SELECTION_EVENT,origin:'system',createdAt:at(),eventId:uid()});}
function fail(value:StudioState){return settleAdjustment(value,{requestId:value.adjustments[value.adjustments.length-1].id,status:'failed',eventId:uid()});}
export default function Page(){
 const [state,setState]=useState(initial),[loaded,setLoaded]=useState(false);
 useEffect(()=>{const saved=sessionStorage.getItem('question-test-state');setState(saved?parseStudioState(JSON.parse(saved)):ask(initial()));setLoaded(true);},[]);
 useEffect(()=>{if(loaded)sessionStorage.setItem('question-test-state',JSON.stringify(state));},[state,loaded]);
 const loop=useExplorationLoop({userId:'${userId}',projectId:'${projectId}',state,getState:()=>state,hasApiKey:true,getApiKey:()=> 'sk-synthetic-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',isAuthenticated:()=>true,enabled:loaded});
 return <><button onClick={()=>setState(auto)}>Atualizar contexto</button><button onClick={()=>setState(fail)}>Falhar turno</button><button onClick={()=>setState(value=>addMessage(value,{id:uid(),role:'user',conversationId:'references',text:'Pode seguir',createdAt:at()}))}>Responder</button><button onClick={()=>setState(ask)}>Perguntar novamente</button><button onClick={loop.resume}>Retomar</button><output>{loop.status}</output></>;
}`;

test('pergunta da seleção resiste a turno automático e recarga, e a retomada vale só para a mesma pergunta',{skip:!existsSync(browserPath),timeout:90000},async t=>{
 assert.equal(existsSync(questionFixture),false);await mkdir(questionFixture);await writeFile(new URL('page.tsx',questionFixture),questionSource);
 const socket=createServer();await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));const origin=`http://127.0.0.1:${port}`;
 let logs='';const child=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--webpack','-p',String(port),'-H','127.0.0.1'],{stdio:['ignore','pipe','pipe'],env:{...process.env,SUPABASE_URL:'',SUPABASE_PUBLISHABLE_KEY:''}});for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{logs=(logs+chunk).slice(-5000);});
 let browser;t.after(async()=>{try{await browser?.close();}finally{try{await stopApp(child);}finally{await rm(questionFixture,{recursive:true,force:true});}}});
 await waitForApp({url:`${origin}/selection-question-test`,child,signal:t.signal,diagnostics:()=>logs});browser=await chromium.launch({executablePath:browserPath,headless:true});
 const context=await browser.newContext();await referenceSignals(context);const posts=[];
 await context.addInitScript(()=>{const real=Date.now.bind(Date);let offset=0;Date.now=()=>real()+offset;window.advanceTestClock=amount=>{offset+=amount;};});
 await context.route('**/api/studio/explorations**',async route=>{
  const path=new URL(route.request().url()).pathname;
  if(path.endsWith('/status'))return route.fulfill({json:{status:'active'}});
  if(path.endsWith('/signals'))return route.fulfill({json:{signals:[]}});
  if(path.endsWith('/resume'))return route.fulfill({json:{status:'resumed'}});
  if(route.request().method()==='GET')return route.fulfill({json:{images:[]}});
  const body=route.request().postDataJSON();posts.push(body);
  return route.fulfill({status:posts.length>3?502:200,json:{status:posts.length>3?'unknown':'completed',requestId:body.requestId}});
 });
 const page=await context.newPage(),waiting=()=>page.getByText('A exploração aguarda sua resposta no chat.').waitFor();
 const staysPaused=async count=>{await waiting();await page.evaluate(()=>window.advanceTestClock(16000));await page.waitForTimeout(1200);assert.equal(posts.length,count);};
 await page.goto(`${origin}/selection-question-test`);await staysPaused(0);
 await page.getByRole('button',{name:'Atualizar contexto',exact:true}).click();await staysPaused(0);
 await page.getByRole('button',{name:'Falhar turno',exact:true}).click();await page.reload();await staysPaused(0);
 await page.getByRole('button',{name:'Responder',exact:true}).click();await page.getByText(/próximo lote em/i).waitFor();assert.equal(posts.length,3,'mensagem da pessoa libera a exploração');
 await page.getByRole('button',{name:'Perguntar novamente',exact:true}).click();await staysPaused(3);
 await page.getByRole('button',{name:'Retomar',exact:true}).click();await page.getByText(/próximo lote em/i).waitFor();
 await page.reload();await page.getByText(/próximo lote em/i).waitFor();assert.equal(posts.length,3,'recarga preserva a retomada explícita da pergunta');
 await page.getByRole('button',{name:'Perguntar novamente',exact:true}).click();await staysPaused(3);
 await page.getByRole('button',{name:'Retomar',exact:true}).click();await page.getByText(/próximo lote em/i).waitFor();await page.evaluate(()=>window.advanceTestClock(16000));
 await page.getByText(/resultado da exploração não foi confirmado/i).waitFor();assert.equal(posts.length,4,'nova pergunta exige uma nova resposta ou retomada explícita');
 await context.close();
});
