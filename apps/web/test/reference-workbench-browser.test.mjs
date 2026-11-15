import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {chromium} from 'playwright-core';

const browserPath=process.env.BROWSER_EXECUTABLE_PATH;
const source=`
import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import ReferencePanel from './app/studio-reference-panel.tsx';
import ExplorationGallery from './app/exploration-gallery.tsx';
import './app/studio-shell.css';
import './app/studio-guided.css';
function Screen(){const [requests,setRequests]=useState(0),[scope,setScope]=useState(false),[returned,setReturned]=useState(false);
 return <div className="compor-studio" data-guided="true"><div className="studio-body"><main className="studio-canvas-column">
 <ReferencePanel projectWide={scope} onScope={setScope} continueLabel="Voltar ao post" onContinue={()=>setReturned(true)} onRequestProposals={()=>setRequests(value=>value+1)} proposalsDisabled={requests>0}
 search={<section><h2>Sugestões do Pinterest</h2><p>Permita nesta sessão para carregar prévias.</p><button>Permitir nesta sessão</button></section>}
 upload={<label>Enviar suas imagens<input type="file" accept="image/png,image/jpeg" /></label>}
 proposals={<ExplorationGallery projectId="00000000-0000-4000-8000-000000000003" completed={0} selectedIds={[]} onUseReference={async()=>{}}/>}
 selection={<section className="reference-selection-tray"><h2>Sua seleção</h2><p>2 do projeto · 1 deste post</p></section>}
 conversation={<section className="studio-chat-panel"><div className="studio-chat-messages">Conversa preservada sobre as referências</div><form className="studio-chat-composer"><textarea aria-label="Mensagem ao Compor" /></form></section>}/>
 <output id="requests">{requests}</output><output id="returned">{String(returned)}</output>
 </main></div></div>;
}createRoot(document.getElementById('root')).render(<Screen/>);`;

async function fixture(t,viewport){
 const bundle=await build({stdin:{contents:source,loader:'jsx',resolveDir:fileURLToPath(new URL('../',import.meta.url))},bundle:true,write:false,outdir:'/tmp/compor-reference-workbench',format:'esm',platform:'browser',target:'es2022',jsx:'automatic',external:['/studio/*'],define:{'process.env.NODE_ENV':'"test"'}});
 const script=bundle.outputFiles.find(file=>file.path.endsWith('.js')).text,css=bundle.outputFiles.find(file=>file.path.endsWith('.css')).text;
 const server=createServer((req,res)=>{if(req.url==='/fixture.js'){res.setHeader('content-type','text/javascript');res.end(script);}else if(req.url==='/fixture.css'){res.setHeader('content-type','text/css');res.end(css);}else {res.setHeader('content-type','text/html');res.end('<!doctype html><html lang="pt-BR"><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body style="margin:0"><div id="root"></div><script type="module" src="/fixture.js"></script></body></html>');}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({executablePath:browserPath,headless:true});
 t.after(async()=>{await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
 const page=await browser.newPage({viewport});page.setDefaultTimeout(5000);
 const errors=[];page.on('pageerror',error=>errors.push(error.message));t.after(()=>assert.deepEqual(errors,[]));
 await page.route('**/api/studio/explorations?*',route=>route.fulfill({json:{images:[1,2,3].map(ordinal=>({id:`00000000-0000-4000-8000-${String(ordinal).padStart(12,'0')}`,project_id:'00000000-0000-4000-8000-000000000003',ordinal,state:'completed',created_at:'2026-11-15T12:00:00.000Z',batch_id:'00000000-0000-4000-8000-000000000004',batch_position:ordinal})),nextBeforeOrdinal:null}}));
 await page.route('**/api/studio/explorations/image?*',route=>route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC','base64')}));
 await page.goto('http://127.0.0.1:'+server.address().port);
 return page;
}
const options={skip:!browserPath||!existsSync(browserPath),timeout:30000};

for(const viewport of [{width:1440,height:1024},{width:390,height:844}]){
 test('exploração, seleção, compositor e retorno dividem a tela em '+viewport.width+'px',options,async t=>{
  const page=await fixture(t,viewport);
  const composer=page.getByRole('textbox',{name:'Mensagem ao Compor'});
  await composer.fill('Quero aproveitar as cores.');
  await page.getByRole('navigation',{name:'Como adicionar referências'}).getByRole('button',{name:'Enviar imagem',exact:true}).click();
  await page.getByLabel('Enviar suas imagens').waitFor();
  assert.equal(await composer.inputValue(),'Quero aproveitar as cores.');
  assert.equal(await page.locator('#requests').textContent(),'0');
  await page.getByRole('navigation',{name:'Como adicionar referências'}).getByRole('button',{name:'Ver propostas anteriores'}).click();
  await page.getByRole('heading',{name:'Explorações de imagem'}).waitFor();
  assert.equal(await page.locator('#requests').textContent(),'0','consultar propostas anteriores não inicia geração');
  await page.getByRole('navigation',{name:'Como adicionar referências'}).getByRole('button',{name:'Pedir 3 propostas'}).click();
  await page.getByRole('heading',{name:'Explorações de imagem'}).waitFor();
  assert.equal(await page.locator('#requests').textContent(),'1');
  await page.getByRole('navigation',{name:'Como adicionar referências'}).getByRole('button',{name:'Buscar referências'}).click();
  await page.getByRole('heading',{name:'Sugestões do Pinterest'}).waitFor();
  await page.getByRole('navigation',{name:'Como adicionar referências'}).getByRole('button',{name:'Pedir 3 propostas'}).click();
  assert.equal(await page.locator('#requests').textContent(),'1','reabrir o lote não inicia outra geração pendente');
  await page.getByLabel('Aplicar referências a').selectOption('project');
  await page.getByRole('heading',{name:'Referências do projeto',exact:true}).waitFor();
  for(const selector of ['.reference-workbench-explore','.reference-workbench-selection','.reference-workbench-conversation','.studio-chat-composer','.reference-workbench-return']){
   const bounds=await page.locator(selector).boundingBox();
   assert.ok(bounds&&bounds.width>0&&bounds.height>0,selector+' visível');
   assert.ok(bounds.y>=0&&bounds.y+bounds.height<=viewport.height+1,selector+' permanece no viewport');
  }
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'sem rolagem horizontal da página');
  await page.getByRole('button',{name:'Voltar ao post',exact:true}).click();
  assert.equal(await page.locator('#returned').textContent(),'true');
 });
}

test('três propostas recebem a área visual sem títulos repetidos nem bordas internas largas',options,async t=>{
 const page=await fixture(t,{width:1440,height:1024});
 await page.getByRole('button',{name:'Ver propostas anteriores'}).click();
 await page.getByRole('button',{name:'Usar imagem 1 na conversa e na Direção'}).waitFor();
 const images=await page.locator('.studio-exploration-grid > figure > button > img').evaluateAll(items=>items.map(item=>({height:item.getBoundingClientRect().height,padding:getComputedStyle(item.parentElement).padding})));
 assert.equal(images.length,3);
 assert.ok(images.every(image=>image.height>=280),'as imagens usam ao menos280px na bancada desktop');
 assert.ok(images.every(image=>image.padding==='0px'),'a moldura não reduz a imagem com padding herdado');
 assert.equal(await page.getByRole('button',{name:'Consultar explorações',exact:true}).count(),1);
});
