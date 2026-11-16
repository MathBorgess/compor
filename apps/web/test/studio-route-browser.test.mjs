import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {chromium} from 'playwright-core';
import {waitForApp,stopApp} from './wait-for-app.mjs';
import {sessionCookie} from './session-cookie.mjs';
import {mockPostCatalog} from './mock-post-catalog.mjs';
import {parseStudioPath,studioPath} from '../lib/studio-route.ts';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const alice=id(1),bob=id(2),project=id(3),other=id(4),piece=id(10);

test('caminhos do estúdio identificam projeto e post e recusam o resto',()=>{
 assert.deepEqual(parseStudioPath('/'),{projectId:null,pieceId:null});
 assert.deepEqual(parseStudioPath(`/projetos/${project}`),{projectId:project,pieceId:null});
 assert.deepEqual(parseStudioPath(`/projetos/${project}/`),{projectId:project,pieceId:null});
 assert.deepEqual(parseStudioPath(`/projetos/${project}/posts/${piece}`),{projectId:project,pieceId:piece});
 assert.deepEqual(parseStudioPath(`/projetos/${project.toUpperCase()}`),{projectId:project,pieceId:null});
 for(const path of ['/projetos','/projetos/abc',`/projetos/${project}/posts`,`/projetos/${project}/posts/x`,`/outro/${project}`,`/projetos/${project}/extra`])
  assert.deepEqual(parseStudioPath(path),{projectId:null,pieceId:null},path);
 assert.equal(studioPath({projectId:null,pieceId:piece}),'/');
 assert.equal(studioPath({projectId:project,pieceId:null}),`/projetos/${project}`);
 assert.equal(studioPath({projectId:project,pieceId:piece}),`/projetos/${project}/posts/${piece}`);
});

let origin,child,browser;const stopping=new AbortController();
before(async()=>{
 const socket=createServer();await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));origin=`http://127.0.0.1:${port}`;
 let logs='';child=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','-p',String(port),'-H','127.0.0.1'],{stdio:['ignore','pipe','pipe'],env:{...process.env,SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test',APP_ORIGIN:origin}});
 for(const stream of [child.stdout,child.stderr])stream.on('data',value=>{logs=(logs+value).slice(-6000);});
 await waitForApp({url:origin,child,signal:stopping.signal,diagnostics:()=>logs,timeoutMs:60000});
 browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE_PATH,headless:true});
});
after(async()=>{stopping.abort();try{await browser?.close();}finally{await stopApp(child);}});

test('a URL acompanha projeto e post, sobrevive à recarga e responde a voltar/avançar',{timeout:90000},async t=>{
 const page=await browser.newPage({viewport:{width:1280,height:900}});t.after(()=>page.context().close());await page.context().addCookies([sessionCookie(origin)]);
 const catalog=await mockPostCatalog(page);const errors=[];page.on('pageerror',error=>errors.push(error.message));
 const session={userId:alice};
 await page.route('**/auth/session',route=>route.fulfill({json:{state:'connected',userId:session.userId}}));
 await page.route('**/api/**',route=>{const path=new URL(route.request().url()).pathname;
  if(path==='/api/posts')return route.fallback();
  if(path==='/api/projects')return route.fulfill({json:{projects:[{id:project,title:'Mentoria ENEM',revision:1},{id:other,title:'Outro projeto',revision:1}]}});
  if(path==='/api/pieces')return route.fulfill({json:{versions:[],posts:[...catalog.records.values()]}});
  if(path==='/api/ai/credential-status')return route.fulfill({json:{defaultAvailable:false}});
  return route.fulfill({status:503,json:{error:'unexpected'}});
 });
 const button=name=>page.getByRole('button',{name,exact:true});
 const message=page.getByRole('textbox',{name:'Sua mensagem',exact:true});
 const path=()=>new URL(page.url()).pathname;
 const projectPath=`/projetos/${project}`;

 await page.goto(origin);await button('Mentoria ENEM Abrir projeto').click();await button('Criar novo post').waitFor();
 assert.equal(path(),projectPath);
 await button('Criar novo post').click();await page.getByRole('textbox',{name:'Nome do post',exact:true}).fill('Live de revisão');
 await page.getByLabel('Objetivo deste post',{exact:true}).fill('Inscrições');await button('Continuar para criação').click();await message.waitFor();
 const postMatch=new RegExp(`^${projectPath}/posts/([0-9a-f-]{36})$`).exec(path());
 assert.ok(postMatch,`URL do post: ${path()}`);const postPath=postMatch[0];

 await page.reload();await message.waitFor();assert.equal(path(),postPath,'recarregar mantém o post aberto');

 await page.goto(`${origin}/projetos/${project}/posts/${id(99)}`);
 await button('Criar novo post').waitFor({timeout:5000});
 assert.equal(path(),projectPath,'post desconhecido retorna à lista mesmo com outro post salvo aberto');
 await page.goto(origin+postPath);await message.waitFor();

 await button('Posts do projeto').click();await button('Criar novo post').waitFor();assert.equal(path(),projectPath);
 await page.goBack();await message.waitFor();assert.equal(path(),postPath,'voltar reabre o post');
 await page.goForward();await button('Criar novo post').waitFor();assert.equal(path(),projectPath,'avançar volta à lista de posts');

 await page.goto(`${origin}/projetos/${project}/posts/${id(99)}`);await button('Criar novo post').waitFor();
 assert.equal(path(),projectPath,'post desconhecido abre a lista de posts do projeto');
 await page.goto(`${origin}/projetos/${id(98)}`);await page.getByText('Este projeto não está disponível na sua conta.',{exact:true}).waitFor();
 assert.equal(path(),'/','projeto de outra conta ou inexistente volta à lista de projetos');

 await page.goto(origin+postPath);await message.waitFor();
 session.userId=bob;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await button('Mentoria ENEM Abrir projeto').waitFor();assert.equal(path(),'/','outra conta não herda o projeto aberto');
 assert.deepEqual(errors,[]);
});

test('o histórico preserva o projeto e a URL quando a gravação local falha',{timeout:90000},async t=>{
 const page=await browser.newPage({viewport:{width:1440,height:950}});t.after(()=>page.context().close());await page.context().addCookies([sessionCookie(origin)]);
 const catalog=await mockPostCatalog(page),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/auth/session',route=>route.fulfill({json:{state:'connected',userId:alice}}));
 await page.route('**/api/**',route=>{const path=new URL(route.request().url()).pathname;
  if(path==='/api/posts')return route.fallback();
  if(path==='/api/projects')return route.fulfill({json:{projects:[{id:project,title:'Mentoria ENEM',revision:1}]}});
  if(path==='/api/pieces')return route.fulfill({json:{versions:[],posts:[...catalog.records.values()]}});
  if(path==='/api/ai/credential-status')return route.fulfill({json:{defaultAvailable:false}});
  return route.fulfill({status:503,json:{error:'unexpected'}});
 });
 const button=name=>page.getByRole('button',{name,exact:true});
 await page.goto(origin);await button('Mentoria ENEM Abrir projeto').click();await button('Criar novo post').click();
 await page.getByLabel('Nome do post',{exact:true}).fill('Trabalho preservado');await button('Continuar para criação').click();
 await page.getByRole('textbox',{name:'Sua mensagem',exact:true}).waitFor();const postPath=new URL(page.url()).pathname;
 await button('Começar sem IA, no editor').click();
 await button('Configurações do Post').click();
 await page.evaluate(()=>{
  window.restoreStatePut=IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put=function(...args){if(this.name==='states')throw new DOMException('quota de teste','QuotaExceededError');return window.restoreStatePut.apply(this,args);};
 });
 await page.getByLabel('Objetivo deste post',{exact:true}).fill('Alteração ainda somente nesta aba');
 await page.getByText(/^Não foi possível preservar as alterações\./).waitFor();await button('Fechar configurações do post').click();
 await page.evaluate(()=>window.history.go(-2));
 await page.getByText('Não foi possível preservar o projeto antes de sair.',{exact:true}).waitFor({timeout:5000});
 assert.equal(new URL(page.url()).pathname,postPath,'a navegação recusada restaura a URL do post aberto');
 await button('Configurações do Post').click();
 assert.equal(await page.getByLabel('Objetivo deste post',{exact:true}).inputValue(),'Alteração ainda somente nesta aba');
 await button('Fechar configurações do post').click();
 await page.evaluate(()=>{IDBObjectStore.prototype.put=window.restoreStatePut;delete window.restoreStatePut;});
 await page.goBack();await button('Mentoria ENEM Abrir projeto').waitFor();
 await page.goto(origin+postPath);await button('Configurações do Post').click();
 assert.equal(await page.getByLabel('Objetivo deste post',{exact:true}).inputValue(),'Alteração ainda somente nesta aba','a repetição explícita preserva o trabalho antes de sair');
 assert.deepEqual(errors,[]);
});
