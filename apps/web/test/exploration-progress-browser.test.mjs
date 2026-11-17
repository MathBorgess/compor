import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {chromium} from 'playwright-core';

const browserPath=process.env.BROWSER_EXECUTABLE_PATH;
const userId='00000000-0000-4000-8000-000000000001',projectId='00000000-0000-4000-8000-000000000003';
const source=`
import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import ReferencePanel from './app/studio-reference-panel.tsx';
import ExplorationGallery from './app/exploration-gallery.tsx';
import {useExplorationLoop} from './app/use-exploration-loop.ts';
import {createStudioState,updateBrief} from './lib/studio-state.ts';
import './app/style.css';
import './app/studio-shell.css';
import './app/studio-guided.css';
function Screen(){
 const [state]=useState(()=>updateBrief(createStudioState({userId:'${userId}',projectId:'${projectId}'}),{offer:'Oficina de cerâmica'}));
 const loop=useExplorationLoop({userId:'${userId}',projectId:'${projectId}',state,getState:()=>state,hasApiKey:true,getApiKey:()=>'sk-synthetic-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',isAuthenticated:()=>true,enabled:true});
 return <div className="compor-studio" data-guided="true"><ReferencePanel projectWide={true} proposalStatus={loop.status} proposalPhase={loop.phase} proposalProgress={loop.progress} proposalsRunning={!loop.blocked&&!loop.paused} onPauseProposals={loop.pause} onRequestProposals={loop.resume} proposalsDisabled={!loop.blocked&&!loop.paused}
 search={<p>Busca de referências</p>} upload={<p>Upload</p>} selection={<p>Seleção</p>} conversation={<p>Conversa preservada</p>}
 proposals={<ExplorationGallery projectId="${projectId}" completed={loop.completed} phase={loop.phase} countdown={loop.countdown} selectedIds={[]} onUseReference={async()=>{}}/>}/></div>;
}createRoot(document.getElementById('root')).render(<Screen/>);`;

async function fixture(t,viewport){
 const bundle=await build({stdin:{contents:source,loader:'jsx',resolveDir:fileURLToPath(new URL('../',import.meta.url))},bundle:true,write:false,outdir:'/tmp/compor-exploration-progress',format:'esm',platform:'browser',target:'es2022',jsx:'automatic',external:['/studio/*'],define:{'process.env.NODE_ENV':'"test"'}});
 const script=bundle.outputFiles.find(file=>file.path.endsWith('.js')).text,css=bundle.outputFiles.find(file=>file.path.endsWith('.css')).text;
 const server=createServer((req,res)=>{if(req.url==='/fixture.js'){res.setHeader('content-type','text/javascript');res.end(script);}else if(req.url==='/fixture.css'){res.setHeader('content-type','text/css');res.end(css);}else {res.setHeader('content-type','text/html');res.end('<!doctype html><html lang="pt-BR"><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body style="margin:0"><div id="root"></div><script type="module" src="/fixture.js"></script></body></html>');}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({executablePath:browserPath,headless:true});
 t.after(async()=>{await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
 const page=await browser.newPage({viewport});page.setDefaultTimeout(5000);
 const errors=[];page.on('pageerror',error=>errors.push(error.message));t.after(()=>assert.deepEqual(errors,[]));
 const pending=[],posts=[];
 await page.route('**/api/studio/references/signals',route=>route.fulfill({json:{signals:[]}}));
 await page.route('**/api/studio/explorations**',route=>{
  const request=route.request(),path=new URL(request.url()).pathname;
  if(path.endsWith('/status'))return route.fulfill({json:{status:'active'}});
  if(path.endsWith('/signals'))return route.fulfill({json:{signals:[]}});
  if(request.method()==='GET')return route.fulfill({json:{images:posts.map((post,index)=>({id:post.requestId,project_id:projectId,state:post.state,ordinal:index+1,created_at:'2026-11-17T12:00:00Z',batch_id:post.batch.id,batch_position:post.batch.position}))}});
  const body=request.postDataJSON();posts.push({...body,state:'running'});pending.push(route);
 });
 await page.clock.install();
 await page.goto('http://127.0.0.1:'+server.address().port);
 await page.getByRole('combobox',{name:'Fonte',exact:true}).selectOption('compor');
 return {page,posts,pending};
}

for(const viewport of [{width:1440,height:1024},{width:390,height:844}]){
 test('espera de imagem mostra posição e tempo sem prometer sucesso nem reenviar em '+viewport.width,{skip:!browserPath||!existsSync(browserPath),timeout:30000},async t=>{
  const {page,posts,pending}=await fixture(t,viewport);
  const progress=page.locator('.reference-exploration-status');
  await progress.getByText('Aguardando imagem 1 de 3.').waitFor();
  assert.equal(posts.length,1);
  assert.equal(await page.getByText('Nenhuma exploração encontrada neste projeto.').isVisible(),false,'a primeira imagem pendente não parece uma busca vazia');
  const progressBox=await progress.boundingBox(),galleryBox=await page.locator('.studio-exploration-gallery').boundingBox();
  assert.ok(progressBox.y<galleryBox.y,'o andamento aparece antes das imagens anteriores');
  await page.getByRole('timer',{name:'Tempo de espera da imagem'}).waitFor();
  await page.clock.fastForward(65000);
  await progress.getByText('A espera está longa. Ainda não recebemos o resultado; o pedido não foi repetido.').waitFor();
  assert.match(await progress.getByRole('timer').innerText(),/1min 5s/);
  assert.equal(await progress.getByRole('timer').getAttribute('aria-live'),'off','o relógio não anuncia cada segundo');
  assert.equal(posts.length,1,'passar tempo não repete uma operação paga');
  await page.getByRole('button',{name:'Comentar seleção',exact:true}).click();
  assert.equal(await progress.isVisible(),true,'o andamento permanece visível na conversa');
  await page.getByRole('button',{name:'Voltar às imagens',exact:true}).click();
  posts[0].state='completed';await pending.shift().fulfill({json:{status:'completed',requestId:posts[0].requestId}});
  await progress.getByText('Aguardando imagem 2 de 3.').waitFor();
  assert.equal(posts.length,2);assert.match(await progress.getByRole('timer').innerText(),/^Tempo de espera: [0-4]s$/,'a segunda imagem não herda o tempo da primeira');
  posts[1].state='unknown';await pending.shift().fulfill({status:502,json:{status:'unknown',requestId:posts[1].requestId,retryAutomatically:false}});
  await progress.getByText(/resultado da exploração não foi confirmado/i).waitFor();
  assert.equal(await progress.getByRole('timer').count(),0,'resultado incerto encerra o relógio');
  const marker=await page.evaluate(key=>localStorage.getItem(key),'compor-exploration-pending:'+userId);
  assert.equal(JSON.parse(marker).requestId,posts[1].requestId);
  await page.clock.fastForward(120000);assert.equal(posts.length,2,'unknown não inicia a terceira imagem');
  await page.getByRole('button',{name:'Pedir 3 propostas',exact:true}).click();
  await progress.getByText(/exploração anterior ainda não foi confirmada/i).waitFor();
  assert.equal(posts.length,2,'retomar consulta o recibo incerto e não envia outra geração');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
 });
}
