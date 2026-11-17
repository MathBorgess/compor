import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {chromium} from 'playwright-core';
import {stopApp} from './wait-for-app.mjs';
const browserPath=process.env.BROWSER_EXECUTABLE_PATH;
const user='00000000-0000-4000-8000-000000000001',project='00000000-0000-4000-8000-000000000003',generated='00000000-0000-4000-8000-000000000009';
const pin=(id,title)=>({id,title,board:'behance/typography',originUrl:`https://www.pinterest.com/pin/${id}/`,previewUrl:`https://i.pinimg.com/236x/${id}.png`});
const pixels=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC','base64');
// The same wiring as the studio reference screen: tray, external suggestions and generated images share one selection.
const source=`
import {useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import ReferenceExploration from './app/reference-exploration.tsx';
import ExplorationGallery from './app/exploration-gallery.tsx';
import ReferenceSelectionTray from './app/reference-selection-tray.tsx';
function Screen(){
 const [references,setReferences]=useState([]),current=useRef(references);
 const [usingShared,setUsingShared]=useState(false);
 const shared={id:'shared-project-reference',name:'projeto.png',mime:'image/png',size:70,width:1,height:1};
 const update=next=>{current.current=next;setReferences(next);};
 const add=(source,file)=>new Promise(resolve=>setTimeout(()=>{update([...current.current,{id:crypto.randomUUID(),name:file.name,mime:'image/png',size:file.size,width:1,height:1,source,url:URL.createObjectURL(file)}]);resolve();},50));
 const remove=async match=>{await new Promise(resolve=>setTimeout(resolve,50));update(current.current.filter(item=>!match(item)));};
 return <main>
  <ReferenceSelectionTray items={usingShared?[...references,shared]:references} limit={20} onRemove={id=>id===shared.id?setUsingShared(false):remove(item=>item.id===id)} availableShared={usingShared?[]:[shared]} onUseShared={()=>setUsingShared(true)}/>
  <ReferenceExploration userId="${user}" projectId="${project}" idea="Oficina de cerâmica" selectedOrigins={references.flatMap(item=>item.source?.originUrl?[item.source.originUrl]:[])} onUseReference={(reference,file)=>add({originUrl:reference.originUrl,board:reference.board,title:reference.title},file)} onRemoveReference={originUrl=>remove(item=>item.source?.originUrl===originUrl)} onContinue={()=>{}}/>
  <ExplorationGallery projectId="${project}" completed={0} selectedIds={references.flatMap(item=>item.source?.kind==='generated'?[item.source.imageId]:[])} onRemoveReference={imageId=>remove(item=>item.source?.imageId===imageId)} onUseReference={(imageId,file,ordinal)=>add({kind:'generated',projectId:'${project}',imageId,ordinal},file)}/>
 </main>;
}
createRoot(document.getElementById('root')).render(<Screen/>);`;
async function fixture(t,viewport={width:1280,height:900}) {
  const result=await build({stdin:{contents:source,loader:'jsx',resolveDir:fileURLToPath(new URL('../',import.meta.url))},bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',jsx:'automatic',outdir:'/tmp/compor-reference-selection',define:{'process.env.NODE_ENV':'"test"'}});
  const script=result.outputFiles.find(file=>file.path.endsWith('.js')).text,css=result.outputFiles.find(file=>file.path.endsWith('.css'))?.text??'';
  const server=createServer((req,res)=>{if(req.url==='/fixture.js'){res.setHeader('content-type','text/javascript');res.end(script);}else if(req.url==='/fixture.css'){res.setHeader('content-type','text/css');res.end(css);}else{res.setHeader('content-type','text/html');res.end('<html lang="pt-BR"><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body class="compor-studio" style="margin:0"><main id="root"></main><script type="module" src="/fixture.js"></script></body></html>');}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
  let browser;
  t.after(async()=>{try{await browser?.close();}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}});
  browser=await chromium.launch({executablePath:browserPath,headless:true});
  const page=await browser.newPage({viewport});page.setDefaultTimeout(8000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));t.after(()=>assert.deepEqual(errors,[]));
  await page.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.hostname==='i.pinimg.com')return route.fulfill({contentType:'image/png',body:pixels});
    if(url.pathname==='/api/studio/references/history')return route.fulfill({json:{references:[]}});
    if(url.pathname==='/api/studio/references/search')return route.fulfill({json:{status:'ok',references:[pin('101','Terracota e textura'),pin('102','Cor e contraste')]}});
    if(url.pathname==='/api/studio/references/preview')return route.fulfill({contentType:'image/png',body:pixels});
    if(url.pathname==='/api/studio/explorations/image')return route.fulfill({contentType:'image/png',body:pixels});
    if(url.pathname==='/api/studio/explorations')return route.fulfill({json:{images:[{id:generated,project_id:project,state:'completed',created_at:'2026-11-10T12:00:00.000Z',ordinal:3,batch_id:null,batch_position:null}],nextBeforeOrdinal:null}});
    if(new URL(request.url()).origin===origin)return route.continue();
    return route.abort();
  });
  await page.goto(origin);
  await page.getByRole('button',{name:'Permitir nesta sessão'}).click();
  await page.getByRole('checkbox',{name:'Escolher referência: Terracota e textura'}).waitFor();
  return {page};
}
const options={skip:!browserPath||!existsSync(browserPath),timeout:30000};

test('origem, seleção, quantidade e remoção ficam visíveis e o foco não se perde',options,async t=>{
 const {page}=await fixture(t);
 const tray=page.getByRole('region',{name:'Sua seleção'});
 await tray.getByText('0',{exact:true}).waitFor();
 assert.match(await tray.textContent(),/0 de 20 referências/);
 assert.match(await tray.textContent(),/sem aprovar a imagem/);
 assert.equal(await page.locator('.reference-results .reference-source',{hasText:'Pinterest · externa'}).count(),2);
 assert.equal(await page.locator('.studio-exploration-gallery .reference-source',{hasText:'Gerada pelo Compor'}).count(),1);
 // Amplification is independent; keyboard selection keeps focus on the checkbox.
 await page.getByRole('button',{name:'Ampliar referência: Terracota e textura'}).click();await page.getByRole('dialog',{name:'Terracota e textura'}).waitFor();assert.match(await tray.textContent(),/0 de 20 referências/);await page.keyboard.press('Escape');
 await page.getByRole('checkbox',{name:'Escolher referência: Terracota e textura'}).focus();await page.keyboard.press('Space');
 await tray.getByRole('button',{name:'Remover da seleção: Terracota e textura'}).waitFor();
 await page.waitForFunction(()=>document.activeElement?.getAttribute('aria-label')==='Escolher referência: Terracota e textura');
 assert.equal(await page.locator('.reference-results .reference-remove').count(),0);
 assert.match(await tray.textContent(),/1 de 20 referências/);
 assert.match(await tray.locator('li').first().textContent(),/Pinterest · externa.*Terracota e textura/);
 assert.equal(await page.getByRole('checkbox',{name:'Escolher referência: Terracota e textura',checked:true}).isChecked(),true);
 // A generated image is labeled as generated in the selection.
 await page.getByRole('checkbox',{name:'Escolher imagem 3'}).click();
 await tray.getByText('2',{exact:true}).waitFor();
 assert.match(await tray.locator('li').nth(1).textContent(),/Gerada pelo Compor.*Imagem 3/);
 // Removing from the tray restores availability in the source card.
 await tray.getByRole('button',{name:'Remover da seleção: Terracota e textura'}).click();
 await page.getByRole('checkbox',{name:'Escolher referência: Terracota e textura',checked:false}).waitFor();
 assert.match(await tray.textContent(),/1 de 20 referências/);
 // Removing the last tray item moves focus to the tray heading.
 await tray.getByRole('button',{name:'Remover da seleção: Imagem 3'}).click();
 await tray.getByText('0',{exact:true}).waitFor();
 await page.waitForFunction(()=>document.activeElement?.id==='reference-selection-title');
 assert.equal(await page.getByRole('checkbox',{name:'Escolher imagem 3'}).isEnabled(),true);
});

test('a seleção cabe no celular sem rolagem horizontal da página',options,async t=>{
 const {page}=await fixture(t,{width:390,height:780});
 for(const title of ['Terracota e textura','Cor e contraste']){await page.getByRole('checkbox',{name:`Escolher referência: ${title}`}).click();await page.getByRole('checkbox',{name:`Escolher referência: ${title}`,checked:true}).waitFor();}
 await page.getByRole('checkbox',{name:'Escolher imagem 3'}).click();
 await page.getByRole('region',{name:'Sua seleção'}).getByText('3',{exact:true}).waitFor();
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'a página não rola na horizontal');
 const buttons=await page.locator('.reference-selection-list button').evaluateAll(items=>items.map(item=>item.getBoundingClientRect().height));
 assert.ok(buttons.every(height=>height>=44),'alvos de toque com pelo menos 44 px');
});

test('referência compartilhada excluída volta ao post dentro de Sua seleção',options,async t=>{
 const {page}=await fixture(t);
 const tray=page.getByRole('region',{name:'Sua seleção'});
 await tray.getByRole('heading',{name:'Disponíveis do projeto'}).waitFor();
 assert.equal(await page.getByText('Referências do projeto usadas neste post').count(),0);
 await tray.getByRole('button',{name:'Usar neste post: projeto.png'}).click();
 await tray.getByText('1',{exact:true}).waitFor();
 await page.waitForFunction(()=>document.activeElement?.getAttribute('aria-label')==='Remover da seleção: projeto.png');
 assert.equal(await tray.getByRole('button',{name:'Usar neste post: projeto.png'}).count(),0);
 await tray.getByRole('button',{name:'Remover da seleção: projeto.png'}).click();
 await tray.getByRole('button',{name:'Usar neste post: projeto.png'}).waitFor();
});

test('falha ao iniciar Chromium encerra a fixture sem manter servidor aberto',{timeout:15000},async t=>{
 const child=spawn(process.execPath,['--import','tsx','--test-name-pattern=^origem, seleção, quantidade e remoção ficam visíveis e o foco não se perde$',fileURLToPath(import.meta.url)],{
  cwd:fileURLToPath(new URL('../',import.meta.url)),env:{...process.env,BROWSER_EXECUTABLE_PATH:process.execPath},stdio:['ignore','pipe','pipe'],
 });
 t.after(()=>stopApp(child,{graceMs:1000}));
 let output='';for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{output+=chunk;});
 // Node exists on every test host but rejects Chromium's launch arguments.
 // Run directly so this process owns the failed fixture, without a nested test worker.
 const [code,signal]=await once(child,'close',{signal:AbortSignal.timeout(10000)});
 assert.equal(signal,null);assert.equal(code,1,'a falha de launch continua reprovando o teste');
 assert.match(output,/browserType\.launch/,'a fixture chegou ao lançamento do navegador');
});
