import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { chromium } from 'playwright-core';
import { stopApp, waitForApp } from './wait-for-app.mjs';

const browserPath=process.env.BROWSER_EXECUTABLE_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const fixture=new URL('../app/exploration-rejection-test/',import.meta.url);
const userId='00000000-0000-4000-8000-000000000001',projectId='00000000-0000-4000-8000-000000000003';
const source=`'use client';
import {useState} from 'react';
import {useExplorationLoop} from '../use-exploration-loop';
import {createStudioState,updateBrief} from '../../lib/studio-state';
export default function Page(){const [state]=useState(()=>updateBrief(createStudioState({userId:'${userId}',projectId:'${projectId}'}),{offer:'Aula de cerâmica'}));const [key,setKey]=useState('sk-synthetic-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx');const loop=useExplorationLoop({userId:'${userId}',projectId:'${projectId}',state,getState:()=>state,hasApiKey:true,getApiKey:()=>key,isAuthenticated:()=>true,enabled:true});return <><button onClick={()=>setKey('sk-synthetic-yyyyyyyyyyyyyyyyyyyyyyyyyyyyyy')}>Trocar chave</button><button onClick={loop.resume}>Retomar</button><output>{loop.status}</output></>};`;
const marker=`compor-exploration-pending:${userId}`,pause=`compor-exploration-rejected:${userId}`;

test('recusa confirmada pausa até retomada explícita, inclusive após resposta perdida e recarga', {skip:!existsSync(browserPath),timeout:60000}, async t=>{
  assert.equal(existsSync(fixture),false);await mkdir(fixture);await writeFile(new URL('page.tsx',fixture),source);
  const socket=createServer();await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));const origin=`http://127.0.0.1:${port}`;
  let logs='';const child=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--webpack','-p',String(port),'-H','127.0.0.1'],{stdio:['ignore','pipe','pipe'],env:{...process.env,SUPABASE_URL:'',SUPABASE_PUBLISHABLE_KEY:''}});for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{logs=(logs+chunk).slice(-5000);});
  let browser;t.after(async()=>{try{await browser?.close();}finally{try{await stopApp(child);}finally{await rm(fixture,{recursive:true,force:true});}}});
  await waitForApp({url:`${origin}/exploration-rejection-test`,child,signal:t.signal,diagnostics:()=>logs});browser=await chromium.launch({executablePath:browserPath,headless:true});
  for(const mode of ['confirmed','lost','mismatched']) {
    const context=await browser.newContext();const posts=[],keys=[];
    await context.route('**/api/studio/references/signals',route=>route.fulfill({json:{signals:[]}}));
    await context.route('**/api/studio/explorations**',async route=>{
      const request=route.request(),path=new URL(request.url()).pathname;
      if(path.endsWith('/status'))return route.fulfill({json:{status:'active'}});
      if(path.endsWith('/signals'))return route.fulfill({json:{signals:[]}});
      if(request.method()==='GET')return route.fulfill({json:{images:posts.length?[{id:posts[0].requestId,project_id:projectId,state:mode==='lost'?'rejected':'unknown'}]:[]}});
      const body=request.postDataJSON();posts.push(body);keys.push(request.headers()['x-compor-openai-key']);
      if(posts.length>1)return route.fulfill({status:502,json:{status:'unknown',requestId:body.requestId,retryAutomatically:false}});
      if(mode==='lost')return route.abort('failed');
      return route.fulfill({status:401,json:{status:'rejected',requestId:mode==='mismatched'?'00000000-0000-4000-8000-000000000099':body.requestId,retryAutomatically:false}});
    });
    const page=await context.newPage();await page.goto(`${origin}/exploration-rejection-test`);
    if(mode==='lost') {
      await page.getByText(/Não foi possível confirmar a exploração/).waitFor();
      assert.notEqual(await page.evaluate(key=>localStorage.getItem(key),marker),null);
      await page.reload();
    }
    if(mode==='mismatched') {
      await page.getByText(/resultado da exploração não foi confirmado/i).waitFor();
      assert.notEqual(await page.evaluate(key=>localStorage.getItem(key),marker),null);
      assert.equal(await page.evaluate(key=>localStorage.getItem(key),pause),null);
      assert.equal(posts.length,1,'resposta com ID divergente nunca libera a pendência');
    } else {
      await page.getByText(/A chave foi recusada/).waitFor();
      assert.equal(await page.evaluate(key=>localStorage.getItem(key),marker),null);
      assert.equal(await page.evaluate(key=>localStorage.getItem(key),pause),'1');
      await page.reload();await page.getByText(/A chave foi recusada/).waitFor();
      assert.equal(posts.length,1,'recarga não retoma a geração');
      await page.getByRole('button',{name:'Trocar chave'}).click();await page.waitForTimeout(1000);
      assert.equal(posts.length,1,'trocar a chave não retoma automaticamente');
      await page.getByRole('button',{name:'Retomar'}).click();await page.getByText(/resultado da exploração não foi confirmado/i).waitFor();
      assert.equal(posts.length,2,'retomada explícita permite nova tentativa');assert.notEqual(posts[0].requestId,posts[1].requestId);
      assert.equal(keys[0],'sk-synthetic-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx');assert.equal(keys[1],'sk-synthetic-yyyyyyyyyyyyyyyyyyyyyyyyyyyyyy');
    }
    await context.close();
  }
});
