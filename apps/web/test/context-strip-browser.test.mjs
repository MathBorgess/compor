import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {chromium} from 'playwright-core';

const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const source=`
import './context-strip.css';
import './studio-shell.css';
import './studio-reference-workspace.css';
import './studio-reference-chat.css';
import {useState} from 'react';import {createRoot} from 'react-dom/client';import ContextStrip from './context-strip';import StudioShell from './studio-shell';import {createStudioState,parseStudioState,updateBrief,updateOfferFacts} from '../lib/studio-state';
const initial=structuredClone(createStudioState({userId:'${id(1)}',projectId:'${id(2)}'}));initial.brief.offer='Oficina de cerâmica';initial.brief.audience='Público do briefing';initial.persona.audience='Público da persona';initial.offerFacts=[{id:'${id(3)}',label:'Preço',value:'R$ 180',status:'confirmed'},{id:'${id(4)}',label:'Data',value:'18 de novembro',status:'pending'},{id:'${id(5)}',label:'Local',value:'Endereço reservado',status:'omitted'}];
function Fixture(){const[state,setState]=useState(()=>parseStudioState(initial)),[editing,setEditing]=useState(false);return <><StudioShell stage="studio" projectTitle="Tempo de criar" context={<ContextStrip state={state} onBrief={patch=>setState(value=>updateBrief(value,patch))} onFacts={facts=>setState(value=>updateOfferFacts(value,facts))}/>} canvas={<section><h2>{editing?'Seu post preservado':'Escolha suas referências'}</h2><button type="button" onClick={()=>setEditing(value=>!value)}>{editing?'Escolher mais referências':'Voltar ao post'}</button><p>Uma ideia já em desenvolvimento.</p></section>}/><output data-testid="state" hidden>{JSON.stringify(state)}</output></>;}createRoot(document.getElementById('root')).render(<Fixture/>);`;

test('faixa do contexto edita por teclado, pede a escolha de público e distingue fatos sem esconder o post',async t=>{
  const compiled=await build({stdin:{contents:source,sourcefile:'context-strip-fixture.tsx',resolveDir:fileURLToPath(new URL('../studio/',import.meta.url)),loader:'tsx'},bundle:true,external:['/studio/*'],write:false,format:'iife',platform:'browser',jsx:'automatic',outfile:'/tmp/context-strip-fixture.js'});
  const script=compiled.outputFiles.find(file=>file.path.endsWith('.js')).contents,css=compiled.outputFiles.find(file=>file.path.endsWith('.css')).contents;
  const server=createServer(async(request,response)=>{
    if(request.url==='/fixture.js'){response.setHeader('Content-Type','text/javascript');return response.end(script);}
    if(request.url==='/fixture.css'){response.setHeader('Content-Type','text/css');return response.end(css);}
    if(request.url?.startsWith('/studio/')){try{response.setHeader('Content-Type',request.url.endsWith('.svg')?'image/svg+xml':request.url.endsWith('.ttf')?'font/ttf':'application/octet-stream');return response.end(await readFile(new URL(`../public${request.url}`,import.meta.url)));}catch{response.statusCode=404;return response.end();}}
    response.setHeader('Content-Type','text/html');response.end('<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><style>body{margin:0}</style><div id="root"></div><script src="/fixture.js"></script></html>');
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve));});
  const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE_PATH,headless:true});t.after(()=>browser.close());
  const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[];page.setDefaultTimeout(10000);
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const strip=page.getByRole('region',{name:'Contexto do projeto',exact:true});await strip.waitFor();
  assert.equal(await page.getByRole('status').innerText(),'Escolha o público na faixa para retomar as propostas de imagens.');
  const audienceSummary=strip.locator('summary').filter({hasText:'Escolha qual descrição usar'});await audienceSummary.focus();await audienceSummary.press('Enter');
  await page.getByRole('button',{name:'Usar público da persona',exact:true}).press('Enter');
  await page.waitForFunction(()=>JSON.parse(document.querySelector('[data-testid="state"]').textContent).brief.audience==='Público da persona');
  const audience=page.getByLabel('Público do projeto',{exact:true});assert.equal(await audience.inputValue(),'Público da persona');
  await audience.fill('Pessoas interessadas em trabalhos manuais');
  let state=JSON.parse(await page.getByTestId('state').textContent());assert.equal(state.brief.audience,state.persona.audience);assert.equal(state.brief.audience,'Pessoas interessadas em trabalhos manuais');
  await strip.locator('details[open] summary').click();
  const offerSummary=strip.locator('summary').filter({hasText:'Oficina de cerâmica'});await offerSummary.focus();await offerSummary.press('Enter');
  await page.getByLabel('Oferta',{exact:true}).fill('Oficina com argila natural');
  await strip.locator('details[open] summary').click();
  await strip.locator('summary').filter({hasText:'Fatos da oferta'}).click();
  assert.equal(await strip.locator('.studio-context-fact[data-status="confirmed"]').count(),1);assert.equal(await strip.locator('.studio-context-fact[data-status="pending"]').count(),1);assert.equal(await strip.locator('.studio-context-fact[data-status="omitted"]').count(),1);
  await page.getByLabel('Estado do fato 2',{exact:true}).selectOption('confirmed');await page.getByRole('button',{name:'Salvar fato 2',exact:true}).click();
  state=JSON.parse(await page.getByTestId('state').textContent());assert.equal(state.offerFacts[1].status,'confirmed');assert.equal(state.offerFacts[2].value,'Endereço reservado');assert.equal(state.offerFacts[2].status,'omitted');
  await page.getByRole('button',{name:'Adicionar fato',exact:true}).click();await page.getByLabel('Nome do fato 4',{exact:true}).fill('Material');await page.getByLabel('Texto do fato 4',{exact:true}).fill('Todos os materiais incluídos');await page.getByRole('button',{name:'Salvar fato 4',exact:true}).click();
  assert.equal(JSON.parse(await page.getByTestId('state').textContent()).offerFacts[3].status,'pending','editar texto não confirma por silêncio');
  await strip.locator('details[open] summary').click();
  await page.getByRole('button',{name:'Voltar ao post',exact:true}).click();await page.getByRole('heading',{name:'Seu post preservado',exact:true}).waitFor();assert.equal(await strip.isVisible(),true);
  await page.getByRole('button',{name:'Escolher mais referências',exact:true}).click();assert.equal(await strip.isVisible(),true);assert.equal(JSON.parse(await page.getByTestId('state').textContent()).brief.offer,'Oficina com argila natural');
  for(const [width,name] of [[1440,'desktop'],[390,'mobile']]){
    await page.setViewportSize({width,height:960});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    assert.ok(await strip.locator('summary').evaluateAll(elements=>elements.every(element=>element.getBoundingClientRect().height>=44)));
    await page.screenshot({path:join(tmpdir(),`compor-studio-visual-context-strip-${name}.png`),fullPage:true});
  }
  assert.deepEqual(errors,[]);
});
