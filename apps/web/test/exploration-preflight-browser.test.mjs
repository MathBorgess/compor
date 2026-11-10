import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { chromium } from 'playwright-core';
import { stopApp, waitForApp } from './wait-for-app.mjs';

const browserPath=process.env.BROWSER_EXECUTABLE_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const fixture=new URL('../app/exploration-preflight-test/',import.meta.url);
const userId='00000000-0000-4000-8000-000000000001',projectId='00000000-0000-4000-8000-000000000003';
const source=`'use client';
import {useState} from 'react';
import {useExplorationLoop} from '../use-exploration-loop';
import {createStudioState,updateBrief} from '../../lib/studio-state';
export default function Page(){const [state]=useState(()=>updateBrief(createStudioState({userId:'${userId}',projectId:'${projectId}'}),{offer:'Aula de cerâmica'}));const loop=useExplorationLoop({userId:'${userId}',projectId:'${projectId}',state,getState:()=>state,hasApiKey:true,getApiKey:()=>'sk-synthetic-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',isAuthenticated:()=>true,enabled:true});return <><button onClick={loop.resume}>Retomar</button><output>{loop.status}</output></>};`;
const pendingKey=`compor-exploration-pending:${userId}`,pauseKey=`compor-exploration-not-started:${userId}`;

test('resposta anterior à reserva exige correlação, preserva outros marcadores e aguarda retomada', {skip:!existsSync(browserPath),timeout:90000},async t=>{
 let phase='fixture';const trace=[];t.after(()=>{if(phase!=='completed')t.diagnostic(JSON.stringify({phase,trace,logs}));});
 assert.equal(existsSync(fixture),false);await mkdir(fixture);await writeFile(new URL('page.tsx',fixture),source);
 const socket=createServer();await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));const origin=`http://127.0.0.1:${port}`;
 let logs='';const child=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--webpack','-p',String(port),'-H','127.0.0.1'],{stdio:['ignore','pipe','pipe'],env:{...process.env,SUPABASE_URL:'',SUPABASE_PUBLISHABLE_KEY:''}});for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{logs=(logs+chunk).slice(-5000);});
 let browser;t.after(async()=>{try{await browser?.close();}finally{try{await stopApp(child);}finally{await rm(fixture,{recursive:true,force:true});}}});
 await waitForApp({url:`${origin}/exploration-preflight-test`,child,signal:t.signal,diagnostics:()=>logs});browser=await chromium.launch({executablePath:browserPath,headless:true});
 for(const mode of [400,403,404,413,503,'wrong_id','wrong_flag','wrong_status','unknown','replaced']) {
  const context=await browser.newContext(),posts=[];let release,received;
  const held=new Promise(resolve=>{release=resolve;}),arrived=new Promise(resolve=>{received=resolve;});
  await context.route('**/api/studio/references/signals',route=>route.fulfill({json:{signals:[]}}));
  await context.route('**/api/studio/explorations**',async route=>{
   const request=route.request(),path=new URL(request.url()).pathname;
   if(path.endsWith('/status'))return route.fulfill({json:{status:'active'}});
   if(path.endsWith('/signals'))return route.fulfill({json:{signals:[]}});
   if(request.method()==='GET')return route.fulfill({json:{images:[]}});
   const body=request.postDataJSON();posts.push(body);assert.equal(request.headers()['x-compor-exploration-request-id'],body.requestId);
   if(posts.length>1)return route.fulfill({status:502,json:{status:'unknown',requestId:body.requestId,retryAutomatically:false}});
   received();if(mode==='replaced')await held;
   const status=typeof mode==='number'?mode:mode==='wrong_status'?409:503;
   return route.fulfill({status,json:{status:mode==='unknown'?'unknown':'not_started',requestId:mode==='wrong_id'?'00000000-0000-4000-8000-000000000099':body.requestId,retryAutomatically:mode==='wrong_flag'}});
  });
  const page=await context.newPage();page.on('pageerror',error=>trace.push({mode,error:error.message,stack:error.stack}));page.on('console',message=>{if(message.type()==='error')trace.push({mode,console:message.text()});});phase=`${mode}: opening`;await page.goto(`${origin}/exploration-preflight-test`);phase=`${mode}: waiting first dispatch`;try{await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error(`No initial dispatch in mode ${mode}`)),6000);arrived.then(()=>{clearTimeout(timer);resolve();},error=>{clearTimeout(timer);reject(error);});});}catch(error){trace.push({mode,body:await page.locator('body').innerText()});throw error;}phase=`${mode}: received first dispatch`;
  if(mode==='replaced'){await page.evaluate(key=>localStorage.setItem(key,'outra tentativa'),pendingKey);release();}
  if(typeof mode==='number') {
   await page.getByText(/Não foi possível iniciar a exploração/).waitFor();
   assert.equal(await page.evaluate(key=>localStorage.getItem(key),pendingKey),null);
   assert.equal(await page.evaluate(key=>localStorage.getItem(key),pauseKey),'1');
   phase=`${mode}: reload`;await page.reload();await page.getByText(/Não foi possível iniciar a exploração/).waitFor();assert.equal(posts.length,1);
   phase=`${mode}: resume`;await page.getByRole('button',{name:'Retomar'}).click();await page.getByText(/resultado da exploração não foi confirmado/i).waitFor();
   assert.equal(posts.length,2);assert.notEqual(posts[0].requestId,posts[1].requestId);
  } else {
   await page.getByText(/resultado da exploração não foi confirmado/i).waitFor();
   const pending=await page.evaluate(key=>localStorage.getItem(key),pendingKey);
   assert.notEqual(pending,null);if(mode==='replaced')assert.equal(pending,'outra tentativa');
   assert.equal(await page.evaluate(key=>localStorage.getItem(key),pauseKey),null);assert.equal(posts.length,1,'resposta ambígua ou marcador substituído não autoriza repetição');
  }
  trace.push({mode,posts:posts.length,status:await page.locator('output').innerText()});phase=`${mode}: closing`;await context.close();
 }
 phase='completed';
});
