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
import ReferencePanel from './studio/studio-reference-panel.tsx';
import ExplorationGallery from './studio/exploration-gallery.tsx';
import {useExplorationLoop} from './studio/use-exploration-loop.ts';
import {createStudioState,updateBrief} from './lib/studio-state.ts';
import './studio/style.css';
import './studio/studio-shell.css';
import './studio/studio-guided.css';
function Screen(){
 const [project,setProject]=useState(window.startProject||'${projectId}'),[enabled,setEnabled]=useState(!window.startDisabled);
 const [state]=useState(()=>updateBrief(createStudioState({userId:'${userId}',projectId:'${projectId}'}),{offer:'Oficina de cerâmica'}));
 const [credential,setCredential]=useState({source:'byok',epoch:0});
 const loop=useExplorationLoop({userId:'${userId}',projectId:project,state,getState:()=>state,hasApiKey:true,credentialSource:credential.source,credentialEpoch:credential.epoch,getApiKey:()=>credential.source==='byok'?'sk-synthetic-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx':'',isAuthenticated:()=>true,enabled,onCompleted:async()=>{if(window.slowCompletion){window.completionEntered=true;await new Promise(resolve=>{window.releaseCompletion=resolve;});}}});
 return <div className="compor-studio" data-guided="true"><ReferencePanel projectWide={true} proposalStatus={loop.status} proposalPhase={loop.phase} proposalProgress={loop.progress} proposalsRunning={!loop.blocked&&!loop.paused} onPauseProposals={loop.pause} onRequestProposals={loop.resume} proposalsDisabled={!loop.blocked&&!loop.paused}
 search={<p>Busca de referências</p>} upload={<p>Upload</p>} selection={<p>Seleção</p>} conversation={<p>Conversa preservada</p>}
 proposals={window.disableGallery?<p>Galeria simulada</p>:<ExplorationGallery projectId="${projectId}" completed={loop.completed} phase={loop.phase} countdown={loop.countdown} selectedIds={[]} onUseReference={async()=>{}}/>}/><button onClick={()=>setCredential(value=>({source:'default',epoch:value.epoch+1}))}>Trocar para IA do Compor</button><button onClick={()=>setProject('00000000-0000-4000-8000-000000000004')}>Trocar projeto</button><button onClick={()=>setEnabled(false)}>Fechar referências</button><button onClick={loop.resume}>Retomar teste</button><button onClick={()=>{setEnabled(true);void loop.resume();}}>Ativar e retomar</button><button onClick={loop.pause}>Pausar teste</button><output aria-label="estado de pausa">{String(loop.paused)}</output><output aria-label="aguarda feedback">{String(loop.awaitingFeedback)}</output></div>;
}createRoot(document.getElementById('root')).render(<Screen/>);`;

async function fixture(t,viewport,{unreliableAbort=false,feedbackPaused=false,startDisabled=false,thirdReceipt=false,otherProject=false,slowDirect=false,legacyMarker=false}={}){
 const bundle=await build({stdin:{contents:source,loader:'jsx',resolveDir:fileURLToPath(new URL('../',import.meta.url))},bundle:true,write:false,outdir:'/tmp/compor-exploration-progress',format:'esm',platform:'browser',target:'es2022',jsx:'automatic',external:['/studio/*'],define:{'process.env.NODE_ENV':'"test"'}});
 const script=bundle.outputFiles.find(file=>file.path.endsWith('.js')).text,css=bundle.outputFiles.find(file=>file.path.endsWith('.css')).text;
 const server=createServer((req,res)=>{if(req.url==='/fixture.js'){res.setHeader('content-type','text/javascript');res.end(script);}else if(req.url==='/fixture.css'){res.setHeader('content-type','text/css');res.end(css);}else {res.setHeader('content-type','text/html');res.end('<!doctype html><html lang="pt-BR"><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body style="margin:0"><div id="root"></div><script type="module" src="/fixture.js"></script></body></html>');}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({executablePath:browserPath,headless:true});
 t.after(async()=>{await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
 const page=await browser.newPage({viewport});page.setDefaultTimeout(5000);
 if(unreliableAbort)await page.addInitScript(()=>{AbortController.prototype.abort=function(){};});
 if(startDisabled)await page.addInitScript(()=>{window.startDisabled=true;});
 if(feedbackPaused)await page.addInitScript(({userId,projectId})=>{localStorage.setItem(`compor-exploration-batch:${userId}:${projectId}`,JSON.stringify({sequence:6,batchId:'00000000-0000-4000-8000-000000000099',completed:0,nextAt:null,reviewBatches:[],reviewedBatchId:null,awaitingFeedback:true}));},{userId,projectId});
 if(thirdReceipt)await page.addInitScript(({userId,projectId})=>{const batchId='00000000-0000-4000-8000-000000000099',requestId='00000000-0000-4000-8000-000000000098';window.slowCompletion=true;localStorage.setItem(`compor-exploration-batch:${userId}:${projectId}`,JSON.stringify({sequence:2,batchId,completed:2,nextAt:null,reviewBatches:[],reviewedBatchId:null,awaitingFeedback:false}));localStorage.setItem(`compor-exploration-pending:${userId}`,JSON.stringify({projectId,requestId,sequence:2,batchId,position:3,conversationId:'references'}));},{userId,projectId});
 if(slowDirect)await page.addInitScript(({userId,projectId})=>{window.slowCompletion=true;localStorage.setItem(`compor-exploration-batch:${userId}:${projectId}`,JSON.stringify({sequence:2,batchId:'00000000-0000-4000-8000-000000000099',completed:2,nextAt:null,reviewBatches:[],reviewedBatchId:null,awaitingFeedback:false}));},{userId,projectId});
 if(otherProject)await page.addInitScript(({userId,projectId})=>{window.startProject='00000000-0000-4000-8000-000000000004';window.disableGallery=true;localStorage.setItem(`compor-exploration-pending:${userId}`,JSON.stringify({projectId,requestId:'00000000-0000-4000-8000-000000000098',sequence:0,batchId:'00000000-0000-4000-8000-000000000099',position:1,conversationId:'references'}));},{userId,projectId});
 if(legacyMarker)await page.addInitScript(({userId,projectId})=>{window.disableGallery=true;localStorage.setItem(`compor-exploration-pending:${userId}`,JSON.stringify({projectId,requestId:'00000000-0000-4000-8000-000000000098',sequence:0}));},{userId,projectId});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));t.after(()=>assert.deepEqual(errors,[]));
 const pending=[],posts=[],resumes=[],gets=[];
 await page.route('**/api/studio/references/signals',route=>route.fulfill({json:{signals:[]}}));
 await page.route('**/api/studio/explorations**',route=>{
  const request=route.request(),path=new URL(request.url()).pathname;
  if(path.endsWith('/resume')){resumes.push(route);return;}
  if(path.endsWith('/status'))return route.fulfill({json:{status:'active'}});
  if(path.endsWith('/signals'))return route.fulfill({json:{signals:[]}});
  if(request.method()==='GET'){gets.push(request.url());return route.fulfill({json:{images:thirdReceipt?[{id:'00000000-0000-4000-8000-000000000098',project_id:projectId,state:'completed'}]:posts.filter(post=>post.state!=='not_started').map((post,index)=>({id:post.requestId,project_id:projectId,state:post.state,ordinal:index+1,created_at:'2026-11-17T12:00:00Z',batch_id:post.batch.id,batch_position:post.batch.position}))}});}
  const body=request.postDataJSON();posts.push({...body,state:'running'});pending.push(route);
 });
 await page.clock.install();
 await page.goto('http://127.0.0.1:'+server.address().port);
 await page.getByRole('combobox',{name:'Fonte',exact:true}).selectOption('compor');
 return {page,posts,pending,resumes,gets};
}

test('troca de fonte conserva marcador mesmo quando a resposta vence o cancelamento',{skip:!browserPath||!existsSync(browserPath),timeout:30000},async t=>{
 const {page,posts,pending}=await fixture(t,{width:390,height:844},{unreliableAbort:true});
 const progress=page.locator('.reference-exploration-status'),markerKey='compor-exploration-pending:'+userId;
 await progress.getByText('Aguardando imagem 1 de 3.').waitFor();
 const marker=await page.evaluate(key=>localStorage.getItem(key),markerKey);
 await page.getByRole('button',{name:'Trocar para IA do Compor',exact:true}).click();
 await pending.shift().fulfill({json:{status:'completed',requestId:posts[0].requestId}});
 await progress.getByText(/exploração anterior ainda não foi confirmada/i).waitFor();
 assert.equal(await page.evaluate(key=>localStorage.getItem(key),markerKey),marker,'resposta da fonte anterior não liquida o marcador');
 assert.equal(posts.length,1,'a fonte nova não despacha outro pedido');
});

test('reconciliação concluída atualiza a galeria sem iniciar outra imagem',{skip:!browserPath||!existsSync(browserPath),timeout:30000},async t=>{
 const {page,posts,pending}=await fixture(t,{width:390,height:844},{unreliableAbort:true});
 const progress=page.locator('.reference-exploration-status'),gallery=page.getByRole('region',{name:'Explorações de imagem'}),markerKey='compor-exploration-pending:'+userId;
 await progress.getByText('Aguardando imagem 1 de 3.').waitFor();
 await gallery.getByRole('button',{name:'Consultar explorações',exact:true}).waitFor();
 assert.equal(await gallery.getByRole('checkbox',{name:'Escolher imagem 1',exact:true}).count(),0);
 const marker=await page.evaluate(key=>localStorage.getItem(key),markerKey);
 await page.getByRole('button',{name:'Pausar exploração',exact:true}).click();
 posts[0].state='completed';
 await pending.shift().fulfill({json:{status:'completed',requestId:posts[0].requestId}});
 await progress.getByText('Exploração pausada.',{exact:true}).waitFor();
 assert.equal(await page.evaluate(key=>localStorage.getItem(key),markerKey),marker);
 assert.equal(await gallery.getByRole('checkbox',{name:'Escolher imagem 1',exact:true}).count(),0,'a resposta tardia não reconcilia sozinha');
 await page.getByRole('button',{name:'Pedir 3 propostas',exact:true}).click();
 await progress.getByText('A tentativa anterior foi confirmada. Peça propostas para continuar.',{exact:true}).waitFor();
 await gallery.getByRole('checkbox',{name:'Escolher imagem 1',exact:true}).waitFor();
 assert.equal(await gallery.getByRole('checkbox',{name:'Escolher imagem 1',exact:true}).isEnabled(),true,'a imagem recuperada já pode ser escolhida sem refresh manual');
 assert.equal(await page.evaluate(key=>localStorage.getItem(key),markerKey),null);
 assert.equal(posts.length,1,'a reconciliação apenas atualiza a galeria');
 await page.clock.fastForward(120000);
 assert.equal(posts.length,1,'outro envio continua dependendo de novo gesto');
});

test('não envio confirmado após saída sobrevive à recarga e exige reconciliação explícita',{skip:!browserPath||!existsSync(browserPath),timeout:30000},async t=>{
 const {page,posts,pending}=await fixture(t,{width:390,height:844});
 const markerKey='compor-exploration-pending:'+userId;
 await page.getByText('Aguardando imagem 1 de 3.',{exact:true}).waitFor();
 const before=JSON.parse(await page.evaluate(key=>localStorage.getItem(key),markerKey));
 await page.getByRole('button',{name:'Fechar referências',exact:true}).click();
 posts[0].state='not_started';
 await pending.shift().fulfill({status:503,json:{status:'not_started',requestId:posts[0].requestId,retryAutomatically:false}});
 await page.waitForFunction(key=>Boolean(JSON.parse(localStorage.getItem(key))?.notStartedReceipt),markerKey);
 const saved=JSON.parse(await page.evaluate(key=>localStorage.getItem(key),markerKey));
 assert.deepEqual(saved,{...before,notStartedReceipt:{status:'not_started',httpStatus:503,requestId:before.requestId,userId,credentialSource:'byok',retryAutomatically:false}});
 assert.doesNotMatch(JSON.stringify(saved),/sk-synthetic/);
 await page.addInitScript(()=>{window.startDisabled=true;});await page.reload();
 await page.getByRole('combobox',{name:'Fonte',exact:true}).selectOption('compor');
 await page.clock.fastForward(120000);
 assert.deepEqual(JSON.parse(await page.evaluate(key=>localStorage.getItem(key),markerKey)),saved);
 assert.equal(posts.length,1,'recarga não reenvia nem descarta a confirmação');
 await page.getByRole('button',{name:'Ativar e retomar',exact:true}).click();
 await page.getByText('Foi confirmado que o pedido anterior não foi enviado. Peça propostas para tentar novamente.',{exact:true}).waitFor();
 assert.equal(await page.evaluate(key=>localStorage.getItem(key),markerKey),null);
 await page.clock.fastForward(120000);assert.equal(posts.length,1,'reconciliação para antes de novo envio');
 await page.getByRole('button',{name:'Pedir 3 propostas',exact:true}).click();
 await page.getByText('Aguardando imagem 1 de 3.',{exact:true}).waitFor();
 assert.equal(posts.length,2);assert.notEqual(posts[1].requestId,posts[0].requestId);
 assert.equal(posts[1].batch.position,1,'um pedido não enviado não avança o lote');
});

test('troca de fonte preserva origem da confirmação e não a consome automaticamente',{skip:!browserPath||!existsSync(browserPath),timeout:30000},async t=>{
 const {page,posts,pending}=await fixture(t,{width:390,height:844},{unreliableAbort:true});
 const markerKey='compor-exploration-pending:'+userId;
 await page.getByText('Aguardando imagem 1 de 3.',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Trocar para IA do Compor',exact:true}).click();
 posts[0].state='not_started';
 await pending.shift().fulfill({status:503,json:{status:'not_started',requestId:posts[0].requestId,retryAutomatically:false}});
 await page.getByText('O pedido anterior não foi enviado. Peça propostas para consultar essa confirmação.',{exact:true}).waitFor();
 const saved=JSON.parse(await page.evaluate(key=>localStorage.getItem(key),markerKey));
 assert.equal(saved.notStartedReceipt.credentialSource,'byok');assert.equal(saved.notStartedReceipt.userId,userId);
 await page.clock.fastForward(120000);assert.equal(posts.length,1);
 assert.deepEqual(JSON.parse(await page.evaluate(key=>localStorage.getItem(key),markerKey)),saved);
 await page.getByRole('button',{name:'Pedir 3 propostas',exact:true}).click();
 await page.getByText('Foi confirmado que o pedido anterior não foi enviado. Peça propostas para tentar novamente.',{exact:true}).waitFor();
 assert.equal(await page.evaluate(key=>localStorage.getItem(key),markerKey),null);assert.equal(posts.length,1);
});

for(const variant of ['outro ID','retry permitido','HTTP incerto','resultado desconhecido'])test('resposta tardia sem comprovação preserva marcador: '+variant,{skip:!browserPath||!existsSync(browserPath),timeout:30000},async t=>{
 const {page,posts,pending}=await fixture(t,{width:390,height:844});
 const markerKey='compor-exploration-pending:'+userId;
 await page.getByText('Aguardando imagem 1 de 3.',{exact:true}).waitFor();
 const marker=await page.evaluate(key=>localStorage.getItem(key),markerKey);
 await page.getByRole('button',{name:'Fechar referências',exact:true}).click();
 posts[0].state='not_started';
 await pending.shift().fulfill({status:variant==='HTTP incerto'?502:503,json:{status:variant==='resultado desconhecido'?'unknown':'not_started',requestId:variant==='outro ID'?'00000000-0000-4000-8000-000000000098':posts[0].requestId,retryAutomatically:variant==='retry permitido'}});
 await page.getByRole('button',{name:'Ativar e retomar',exact:true}).click();
 await page.getByText('Uma exploração anterior ainda não foi confirmada. Consulte seu estado antes de continuar.',{exact:true}).waitFor();
 assert.equal(await page.evaluate(key=>localStorage.getItem(key),markerKey),marker);
 await page.clock.fastForward(120000);assert.equal(posts.length,1);
});

test('confirmação tardia não sobrescreve marcador substituído',{skip:!browserPath||!existsSync(browserPath),timeout:30000},async t=>{
 const {page,posts,pending}=await fixture(t,{width:390,height:844});
 const markerKey='compor-exploration-pending:'+userId;
 await page.getByText('Aguardando imagem 1 de 3.',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Fechar referências',exact:true}).click();
 const replacement=await page.evaluate(key=>{const value=JSON.parse(localStorage.getItem(key));value.requestId='00000000-0000-4000-8000-000000000098';const raw=JSON.stringify(value);localStorage.setItem(key,raw);return raw;},markerKey);
 posts[0].state='not_started';
 await pending.shift().fulfill({status:503,json:{status:'not_started',requestId:posts[0].requestId,retryAutomatically:false}});
 await page.getByRole('button',{name:'Ativar e retomar',exact:true}).click();
 await page.getByText('Uma exploração anterior ainda não foi confirmada. Consulte seu estado antes de continuar.',{exact:true}).waitFor();
 assert.equal(await page.evaluate(key=>localStorage.getItem(key),markerKey),replacement);assert.equal(posts.length,1);
});

for(const [field,notice] of [
 ['userId','Não foi possível confirmar a origem da resposta. O recibo foi preservado.'],
 ['projectId','Há uma exploração anterior em outro projeto. Abra o projeto de origem para consultar o recibo.'],
 ['conversationId','Há uma exploração anterior em outra conversa. Abra a conversa de origem para consultar o recibo.'],
])test('recibo restaurado preserva isolamento de '+field,{skip:!browserPath||!existsSync(browserPath),timeout:30000},async t=>{
 const {page,posts,pending}=await fixture(t,{width:390,height:844});
 const markerKey='compor-exploration-pending:'+userId;
 await page.getByText('Aguardando imagem 1 de 3.',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Fechar referências',exact:true}).click();
 posts[0].state='not_started';
 await pending.shift().fulfill({status:503,json:{status:'not_started',requestId:posts[0].requestId,retryAutomatically:false}});
 await page.waitForFunction(key=>Boolean(JSON.parse(localStorage.getItem(key))?.notStartedReceipt),markerKey);
 const saved=await page.evaluate(({key,field})=>{const value=JSON.parse(localStorage.getItem(key));(field==='userId'?value.notStartedReceipt:value)[field]='00000000-0000-4000-8000-000000000098';const raw=JSON.stringify(value);localStorage.setItem(key,raw);return raw;},{key:markerKey,field});
 await page.getByRole('button',{name:'Ativar e retomar',exact:true}).click();
 await page.getByText(notice,{exact:true}).waitFor();
 assert.equal(await page.evaluate(key=>localStorage.getItem(key),markerKey),saved);assert.equal(posts.length,1);
});

test('falha ao persistir confirmação conserva a pendência sem inferir não envio',{skip:!browserPath||!existsSync(browserPath),timeout:30000},async t=>{
 const {page,posts,pending}=await fixture(t,{width:390,height:844});
 const markerKey='compor-exploration-pending:'+userId;
 await page.getByText('Aguardando imagem 1 de 3.',{exact:true}).waitFor();
 const marker=await page.evaluate(key=>localStorage.getItem(key),markerKey);
 await page.getByRole('button',{name:'Fechar referências',exact:true}).click();
 await page.evaluate(key=>{const set=Storage.prototype.setItem;Storage.prototype.setItem=function(name,value){if(name===key&&JSON.parse(value).notStartedReceipt)throw new DOMException('synthetic quota','QuotaExceededError');return set.call(this,name,value);};},markerKey);
 posts[0].state='not_started';
 await pending.shift().fulfill({status:503,json:{status:'not_started',requestId:posts[0].requestId,retryAutomatically:false}});
 await page.getByRole('button',{name:'Ativar e retomar',exact:true}).click();
 await page.getByText('Uma exploração anterior ainda não foi confirmada. Consulte seu estado antes de continuar.',{exact:true}).waitFor();
 assert.equal(await page.evaluate(key=>localStorage.getItem(key),markerKey),marker);assert.equal(posts.length,1);
});

for(const label of ['Pausar exploração','Fechar referências','Trocar projeto'])test('resposta tardia preserva recibo após '+label,{skip:!browserPath||!existsSync(browserPath),timeout:30000},async t=>{
 const {page,posts,pending}=await fixture(t,{width:390,height:844},{unreliableAbort:true});
 const markerKey='compor-exploration-pending:'+userId;
 await page.locator('.reference-exploration-status').getByText('Aguardando imagem 1 de 3.').waitFor();
 const marker=await page.evaluate(key=>localStorage.getItem(key),markerKey);
 await page.getByRole('button',{name:label,exact:true}).click();
 await pending.shift().fulfill({json:{status:'completed',requestId:posts[0].requestId}});
 await page.waitForTimeout(200);
 assert.equal(await page.evaluate(key=>localStorage.getItem(key),markerKey),marker,'resposta tardia não remove recibo');
 assert.equal(posts.length,1,'nenhuma nova imagem é enviada');
});

test('pausa durante retomada do gate não é desfeita pela resposta atrasada',{skip:!browserPath||!existsSync(browserPath),timeout:30000},async t=>{
 const {page,posts,resumes}=await fixture(t,{width:390,height:844},{feedbackPaused:true});
 await page.getByText('Aguardando sua decisão sobre as propostas.',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Retomar teste'}).click();
 await page.waitForFunction(()=>document.querySelector('[aria-label="estado de pausa"]')?.textContent==='false');
 for(let attempts=0;attempts<100&&resumes.length===0;attempts++)await page.waitForTimeout(25);
 assert.equal(resumes.length,1);
 await page.getByRole('button',{name:'Pausar teste'}).click();
 await resumes.shift().fulfill({json:{status:'resumed'}});
 await page.waitForTimeout(100);
 assert.equal(await page.getByLabel('estado de pausa').textContent(),'true');
 assert.equal(posts.length,0,'resposta de retomada não inicia imagem depois da pausa');
});

test('habilitar e retomar feedback no mesmo gesto aceita a resposta',{skip:!browserPath||!existsSync(browserPath),timeout:30000},async t=>{
 const {page,posts,resumes}=await fixture(t,{width:390,height:844},{feedbackPaused:true,startDisabled:true});
 await page.getByText('Aguardando sua decisão sobre as propostas.',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Ativar e retomar'}).click();
 for(let attempts=0;attempts<100&&resumes.length===0;attempts++)await page.waitForTimeout(25);
 assert.equal(resumes.length,1);assert.equal(posts.length,0);
 await resumes.shift().fulfill({json:{status:'resumed'}});
 await page.waitForFunction(()=>document.querySelector('[aria-label="aguarda feedback"]')?.textContent==='false');
 for(let attempts=0;attempts<100&&posts.length===0;attempts++)await page.waitForTimeout(25);
 assert.equal(posts.length,1,'um gesto retomou após confirmação do gate');
});

test('callback lento não consome espera visível ao recuperar terceira imagem',{skip:!browserPath||!existsSync(browserPath),timeout:30000},async t=>{
 const {page,posts}=await fixture(t,{width:390,height:844},{thirdReceipt:true});
 await page.waitForFunction(()=>window.completionEntered===true);
 await page.clock.fastForward(20000);
 await page.getByRole('button',{name:'Pausar teste'}).click();
 await page.evaluate(()=>{window.slowCompletion=false;window.releaseCompletion();});
 const batch=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),`compor-exploration-batch:${userId}:${projectId}`);
 assert.equal(batch.nextAt,null);assert.equal(batch.remainingMs,15000,'pausa conserva os 15 segundos antes de mostrar contagem');
 assert.notEqual(await page.evaluate(key=>localStorage.getItem(key),`compor-exploration-pending:${userId}`),null);
 assert.equal(posts.length,0,'recuperação e callback não geram imagem');
});

test('callback lento do POST não consome intervalo antes de exibi-lo',{skip:!browserPath||!existsSync(browserPath),timeout:30000},async t=>{
 const {page,posts,pending}=await fixture(t,{width:390,height:844},{slowDirect:true});
 await page.locator('.reference-exploration-status').getByText('Aguardando imagem 3 de 3.').waitFor();
 await pending.shift().fulfill({json:{status:'completed',requestId:posts[0].requestId}});
 await page.waitForFunction(()=>window.completionEntered===true);await page.clock.fastForward(20000);
 await page.getByRole('button',{name:'Pausar teste'}).click();await page.evaluate(()=>{window.slowCompletion=false;window.releaseCompletion();});
 const batch=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),`compor-exploration-batch:${userId}:${projectId}`);
 assert.equal(batch.nextAt,null);assert.equal(batch.remainingMs,15000);assert.equal(posts.length,1);
 assert.notEqual(await page.evaluate(key=>localStorage.getItem(key),`compor-exploration-pending:${userId}`),null);
});

test('recibo de outro projeto não é consultado nem removido fora do projeto de origem',{skip:!browserPath||!existsSync(browserPath),timeout:30000},async t=>{
 const {page,posts,gets}=await fixture(t,{width:390,height:844},{otherProject:true});
 await page.getByText('Há uma exploração anterior em outro projeto. Abra o projeto de origem para consultar o recibo.',{exact:true}).waitFor();
 assert.equal(gets.length,0);assert.equal(posts.length,0);
 const marker=JSON.parse(await page.evaluate(key=>localStorage.getItem(key),`compor-exploration-pending:${userId}`));assert.equal(marker.projectId,projectId);assert.equal(marker.requestId,'00000000-0000-4000-8000-000000000098');
});

test('marcador legado sem conversa não é atribuído automaticamente a um post',{skip:!browserPath||!existsSync(browserPath),timeout:30000},async t=>{
 const {page,posts,gets}=await fixture(t,{width:390,height:844},{legacyMarker:true});
 await page.getByText('Há uma exploração antiga sem conversa de origem identificada. O recibo foi preservado; procure ajuda para recuperá-lo.',{exact:true}).waitFor();
 assert.equal(gets.length,0);assert.equal(posts.length,0);
 const marker=JSON.parse(await page.evaluate(key=>localStorage.getItem(key),`compor-exploration-pending:${userId}`));assert.equal(marker.requestId,'00000000-0000-4000-8000-000000000098');assert.equal(Object.hasOwn(marker,'conversationId'),false);
});

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
  for(const visualSource of ['search','upload','compor']){
   await page.getByRole('combobox',{name:'Fonte',exact:true}).selectOption(visualSource);
   assert.equal(await progress.getByText('Aguardando imagem 1 de 3.').isVisible(),true,'trocar fonte de referências preserva o andamento');
   assert.match(await progress.getByRole('timer').innerText(),/1min/,'trocar fonte não reinicia o relógio');
   assert.equal(posts.length,1,'trocar fonte de referências não pede outra imagem');
  }
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

for(const action of ['pause','credential']){
 test('pedido pendente conserva recibo e encerra indicador ao '+(action==='pause'?'pausar':'trocar a IA'),{skip:!browserPath||!existsSync(browserPath),timeout:30000},async t=>{
  const {page,posts,pending}=await fixture(t,{width:390,height:844});
  const progress=page.locator('.reference-exploration-status');
  await progress.getByText('Aguardando imagem 1 de 3.').waitFor();
  await page.clock.fastForward(65000);
  const markerKey='compor-exploration-pending:'+userId;
  const marker=await page.evaluate(key=>localStorage.getItem(key),markerKey);
  assert.equal(JSON.parse(marker).requestId,posts[0].requestId);
  await page.getByRole('button',{name:action==='pause'?'Pausar exploração':'Trocar para IA do Compor',exact:true}).click();
  await progress.getByText(action==='pause'?'Exploração pausada.':/exploração anterior ainda não foi confirmada/i).waitFor();
  assert.equal(await progress.getByRole('timer').count(),0,'uma operação interrompida não conserva relógio de atividade');
  assert.equal(await progress.getByText('Aguardando imagem 1 de 3.').count(),0);
  assert.equal(await page.evaluate(key=>localStorage.getItem(key),markerKey),marker,'interromper a observação não descarta o recibo');
  await page.clock.fastForward(120000);assert.equal(posts.length,1,'pausa ou troca de IA não reenviam o pedido');
  // Credential changes already show this blocked message. Wait for the new
  // reconciliation read before changing the fixture's receipt to completed.
  const reconciled=page.waitForResponse(response=>response.request().method()==='GET'&&new URL(response.url()).pathname==='/api/studio/explorations');
  await page.getByRole('button',{name:'Pedir 3 propostas',exact:true}).click();
  const receipt=await (await reconciled).json();
  assert.equal(receipt.images.find(image=>image.id===posts[0].requestId)?.state,'running','a retomada termina a consulta antes da resposta tardia');
  await progress.getByText(/exploração anterior ainda não foi confirmada/i).waitFor();
  assert.equal(posts.length,1,'a retomada consulta a tentativa pendente e permanece bloqueada');
  posts[0].state='completed';await pending.shift().fulfill({json:{status:'completed',requestId:posts[0].requestId}}).catch(()=>{});
  await page.clock.fastForward(120000);
  assert.equal(posts.length,1,'uma resposta tardia da solicitação interrompida não inicia a próxima imagem');
  assert.equal(await progress.getByRole('timer').count(),0);
  assert.equal(await page.evaluate(key=>localStorage.getItem(key),markerKey),marker,'o resultado tardio ainda exige reconciliação explícita');
 });
}
