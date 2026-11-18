import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { chromium } from 'playwright-core';
import { stopApp, waitForApp } from './wait-for-app.mjs';

const browserPath=process.env.BROWSER_EXECUTABLE_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const fixture=new URL('../pages/exploration-audience-test/',import.meta.url);
const userId='00000000-0000-4000-8000-000000000001',projectId='00000000-0000-4000-8000-000000000003';
const source=`'use client';
import {useEffect,useState} from 'react';
import {useExplorationLoop} from '../../studio/use-exploration-loop';
import {createStudioState,parseStudioState,updateBrief} from '../../lib/studio-state';
import type {StudioState} from '../../lib/studio-domain';
export default function Page(){
 const [state,setState]=useState<StudioState|null>(null);
 useEffect(()=>{const next=structuredClone(createStudioState({userId:'${userId}',projectId:'${projectId}'})),mode=new URLSearchParams(location.search).get('mode');next.brief.offer='Oficina de cerâmica';next.brief.audience='Criadores que trabalham à noite';if(mode==='both')next.persona.audience=next.brief.audience;if(mode==='conflict')next.persona.audience='Iniciantes interessados em atividades manuais';setState(parseStudioState(next));},[]);
 const loop=useExplorationLoop({userId:'${userId}',projectId:'${projectId}',state,getState:()=>state,hasApiKey:true,getApiKey:()=>'sk-synthetic-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',isAuthenticated:()=>true,enabled:true});
 return <><output>{loop.status}</output><button onClick={()=>setState(value=>value?updateBrief(value,{audience:value.persona.audience}):value)}>Usar público da persona</button></>;
}`;

test('exploração usa público único e aguarda a escolha quando estados antigos divergem', {skip:!existsSync(browserPath),timeout:60000},async t=>{
 assert.equal(existsSync(fixture),false);await mkdir(fixture);await writeFile(new URL('index.tsx',fixture),source);
 const socket=createServer();await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));const origin=`http://127.0.0.1:${port}`;
 let logs='';const child=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','-p',String(port),'-H','127.0.0.1'],{stdio:['ignore','pipe','pipe'],env:{...process.env,SUPABASE_URL:'',SUPABASE_PUBLISHABLE_KEY:''}});for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{logs=(logs+chunk).slice(-5000);});
 let browser;t.after(async()=>{try{await browser?.close();}finally{try{await stopApp(child);}finally{await rm(fixture,{recursive:true,force:true});}}});
 await waitForApp({url:`${origin}/exploration-audience-test`,child,signal:t.signal,diagnostics:()=>logs});browser=await chromium.launch({executablePath:browserPath,headless:true});
 for(const mode of ['brief_only','both','conflict']) {
  const context=await browser.newContext(),posts=[],external=[];
  await context.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url());if(url.origin!==origin){external.push(url.origin);return route.abort();}
   if(url.pathname==='/api/studio/explorations/status')return route.fulfill({json:{status:'active'}});
   if(url.pathname==='/api/studio/explorations/signals'||url.pathname==='/api/studio/references/signals')return route.fulfill({json:{signals:[]}});
   if(url.pathname==='/api/studio/explorations'&&request.method()==='POST'){const body=request.postDataJSON();posts.push(body);return route.fulfill({status:502,json:{status:'unknown',requestId:body.requestId,retryAutomatically:false}});}
   if(url.pathname.startsWith('/api/'))throw Error(`API inesperada: ${url.pathname}`);
   return route.continue();
  });
  const page=await context.newPage();await page.goto(`${origin}/exploration-audience-test?mode=${mode}`);if(mode==='conflict'){await page.getByText('Escolha qual público usar na faixa de contexto.',{exact:true}).waitFor();assert.equal(posts.length,0);await page.getByRole('button',{name:'Usar público da persona',exact:true}).click();}await page.getByText(/resultado da exploração não foi confirmado/i).waitFor();
  assert.equal(posts.length,1);const prompt=posts[0].prompt,match=prompt.match(/Contexto do projeto: (.+?)\. O público/);
  assert.ok(match,'contexto estruturado permanece identificável');const data=JSON.parse(match[1]);
  assert.equal(data.publico,mode==='conflict'?'Iniciantes interessados em atividades manuais':'Criadores que trabalham à noite');
  assert.equal('publico_da_persona' in data,false);assert.equal('publico_ou_observacoes_do_briefing' in data,false);
  assert.match(prompt,/não invente a origem dos dados/);assert.match(prompt,/Hipóteses não são evidência de público real/);assert.match(prompt,/divergências não devem ser resolvidas por suposição/);assert.deepEqual(external,[]);
  await context.close();
 }
});
