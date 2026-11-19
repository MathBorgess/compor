import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {chromium} from 'playwright-core';

const browserPath=process.env.BROWSER_EXECUTABLE_PATH;
const source=`
import './studio/reference-workbench.css';
import './studio/reference-exploration.css';

import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import ReferencePanel from './studio/studio-reference-panel.tsx';
import ExplorationGallery from './studio/exploration-gallery.tsx';
import './studio/style.css';
import './studio/studio-shell.css';
import './studio/studio-guided.css';
function Screen(){const [selected,setSelected]=useState([]),[requests,setRequests]=useState(0),[scope,setScope]=useState(false),[returned,setReturned]=useState(false),[uploaded,setUploaded]=useState('');
 return <div className="compor-studio" data-guided="true"><div className="studio-body"><main className="studio-canvas-column">
 <ReferencePanel entry="preparation" projectTitle="Café Aurora" selectionCount={3} projectWide={scope} onScope={setScope} continueLabel="Voltar ao post" onContinue={()=>setReturned(true)} onRequestProposals={()=>setRequests(value=>value+1)} proposalsDisabled={requests>0}
 search={sourceControl=><section className="reference-exploration"><form>{sourceControl}<label>O que você quer explorar?<input type="search"/></label><button type="button">Buscar referências</button></form><p>Permita nesta sessão para carregar prévias.</p><button>Permitir nesta sessão</button></section>}
 onUpload={files=>setUploaded(files[0].name)} uploadStatus={uploaded}
 proposals={<ExplorationGallery projectId="00000000-0000-4000-8000-000000000003" completed={0} selectedIds={selected} onUseReference={async imageId=>setSelected(items=>[...items,imageId])} onRemoveReference={async imageId=>setSelected(items=>items.filter(item=>item!==imageId))}/>}
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


for(const viewport of [{width:1440,height:1024},{width:960,height:768},{width:390,height:844},{width:320,height:640},{width:390,height:400}]){
 test('galeria focada preserva fonte, consulta e conversa em '+viewport.width+'×'+viewport.height,options,async t=>{
  const page=await fixture(t,viewport);
  const composer=page.getByRole('textbox',{name:'Mensagem ao Compor'});
  assert.equal(await composer.isVisible(),false,'a conversa não reserva espaço na galeria');
  assert.equal(await page.getByRole('heading',{level:1}).count(),1);
  await page.getByLabel('O que você quer explorar?').fill('Café com luz natural');
  const filePicker=page.waitForEvent('filechooser');
  await page.getByRole('button',{name:'Enviar imagem',exact:true}).click();
  await (await filePicker).setFiles({name:'referência.png',mimeType:'image/png',buffer:Buffer.from([1])});
  await page.getByText('referência.png',{exact:true}).waitFor();
  assert.equal(await page.getByRole('combobox',{name:'Fonte',exact:true}).inputValue(),'upload');
  await page.getByRole('combobox',{name:'Fonte',exact:true}).selectOption('compor');
  await page.getByRole('checkbox',{name:'Escolher imagem 1'}).waitFor();
  assert.equal(await page.locator('#requests').textContent(),'0','trocar fonte e consultar histórico não gera');
  const frames=page.locator('.studio-exploration-grid > figure > .reference-image-preview');
  const boxes=await frames.evaluateAll(items=>items.map(item=>({width:item.getBoundingClientRect().width,height:item.getBoundingClientRect().height,fit:getComputedStyle(item.querySelector('img')).objectFit,padding:getComputedStyle(item).padding})));
  assert.equal(boxes.length,3);
  assert.ok(boxes.every(box=>Math.abs(box.width-box.height)<1&&box.fit==='contain'&&box.padding==='0px'),'molduras quadradas sem recorte: '+JSON.stringify(boxes));
  assert.ok(boxes.every(box=>box.width>=Math.min(300,viewport.width-32)),'as imagens mantêm a largura contratada');
  const layout=await page.locator('.studio-exploration-grid').evaluate(element=>({columns:getComputedStyle(element).gridTemplateColumns.split(' ').length,columnGap:getComputedStyle(element).columnGap,rowGap:getComputedStyle(element).rowGap}));
  assert.equal(layout.columns,viewport.width===1440?3:viewport.width===960?2:1);
  assert.equal(layout.columnGap,'24px');assert.equal(layout.rowGap,'32px');
  const preview=page.getByRole('button',{name:'Ampliar referência: Imagem 1'});await preview.click();
  await page.getByRole('dialog',{name:'Imagem 1',exact:true}).waitFor();
  assert.equal(await page.getByRole('checkbox',{name:'Escolher imagem 1'}).isChecked(),false,'ampliar não seleciona');
  await page.keyboard.press('Escape');assert.equal(await preview.evaluate(element=>document.activeElement===element),true,'Escape devolve o foco');
  await page.getByRole('checkbox',{name:'Escolher imagem 1'}).click();
  await page.getByRole('checkbox',{name:'Escolher imagem 1',checked:true}).waitFor();
  assert.equal(await preview.evaluate(element=>getComputedStyle(element).borderTopColor),'rgb(18, 62, 171)','borda azul indica seleção sem esconder a imagem');
  await page.getByRole('combobox',{name:'Fonte',exact:true}).selectOption('search');
  await page.getByRole('button',{name:'Pedir 3 propostas',exact:true}).click();
  assert.equal(await page.locator('#requests').textContent(),'1');
  await page.getByRole('button',{name:'Comentar seleção',exact:true}).click();
  await composer.fill('Quero aproveitar as cores.');
  assert.equal(await page.locator('.reference-workbench-explore').isVisible(),false,'conversa ocupa a mesma superfície');
  await page.getByRole('button',{name:'Voltar às imagens',exact:true}).click();
  assert.equal(await page.getByRole('combobox',{name:'Fonte',exact:true}).inputValue(),'compor');
  assert.equal(await page.getByRole('button',{name:'Comentar seleção'}).evaluate(element=>document.activeElement===element),true);
  await page.getByRole('combobox',{name:'Fonte',exact:true}).selectOption('search');
  assert.equal(await page.getByLabel('O que você quer explorar?').inputValue(),'Café com luz natural');
  await page.getByRole('button',{name:'Comentar seleção',exact:true}).click();assert.equal(await composer.inputValue(),'Quero aproveitar as cores.');
  await page.getByRole('button',{name:'Voltar às imagens',exact:true}).click();
  await page.getByText('Revisar seleção e alcance',{exact:true}).click();await page.getByLabel('Aplicar referências a').selectOption('project');
  await page.getByText('Referências do projeto',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'sem rolagem horizontal');
  const type=await page.locator('.reference-workbench-heading h1,.reference-selection-summary [role=status],.reference-workbench-return .studio-button').evaluateAll(items=>items.map(item=>({size:parseFloat(getComputedStyle(item).fontSize),weight:getComputedStyle(item).fontWeight})));assert.equal(type[0].weight,'700');assert.ok(type.every(item=>item.size>=16),'título, contador e CTA legíveis');
  const targets=await page.locator('.reference-step button:visible,.reference-step select:visible,.reference-step summary:visible').evaluateAll(items=>items.map(item=>item.getBoundingClientRect().height));assert.ok(targets.every(height=>height>=44),'alvos de pelo menos 44px');
  await page.getByRole('button',{name:'Voltar ao post',exact:true}).click();assert.equal(await page.locator('#returned').textContent(),'true','retorno acessível pela rolagem natural');
 });
}
