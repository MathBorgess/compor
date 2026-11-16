import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {chromium} from 'playwright-core';
const browserPath=process.env.BROWSER_EXECUTABLE_PATH;
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const user=id(1),project=id(2),piece=id(3),generated=id(9);
const pin=(n,title)=>({id:String(n),title,board:'behance/typography',originUrl:`https://www.pinterest.com/pin/${n}/`,previewUrl:`https://i.pinimg.com/236x/${n}.png`});
const pins=[pin(101,'Terracota e textura'),pin(102,'Cor e contraste'),pin(103,'Forma e calma'),pin(104,'Serifa editorial')];
// Real shell, chat, tray, suggestions and gallery, as composed on the reference screen.
const source=`
import {useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import StudioShell from './app/studio-shell.tsx';
import StudioChat from './app/studio-chat.tsx';
import ReferenceExploration from './app/reference-exploration.tsx';
import ExplorationGallery from './app/exploration-gallery.tsx';
import ReferenceSelectionTray from './app/reference-selection-tray.tsx';
import {createStudioState,createPost,addReference,removeReference,updateBrief} from './lib/studio-state.ts';
import {recordReferenceRound} from './lib/studio-reference-round.ts';
const colors=['#ba654a','#123eab','#68784e','#e8b44a'];
async function swatch(color){const canvas=document.createElement('canvas');canvas.width=240;canvas.height=200;const context=canvas.getContext('2d');context.fillStyle='#f4f0e5';context.fillRect(0,0,240,200);context.fillStyle=color;context.beginPath();context.arc(120,95,60,0,7);context.fill();return new Promise(resolve=>canvas.toBlob(resolve,'image/png'));}
const files=new Map();
function Screen(){
 const [key,setKey]=useState(false),[state,setState]=useState(()=>updateBrief(createPost(createStudioState({userId:'${user}',projectId:'${project}'}),{pieceId:'${piece}'}),{offer:'Oficina de cerâmica para iniciantes',audience:'Adultos que querem um hobby manual'})),current=useRef(state),tools=useRef({execute:async()=>{throw Error('unexpected tool');}});
 const [urls,setUrls]=useState({});
 function change(fn){const next=fn(current.current);current.current=next;setState(next);return next;}
 async function add(source,file){const reference={id:crypto.randomUUID(),name:file.name,mime:'image/png',size:file.size,width:240,height:200,source};const blob=await swatch(colors[Object.keys(urls).length%4]);files.set(reference.id,blob);setUrls(value=>({...value,[reference.id]:URL.createObjectURL(blob)}));change(value=>addReference(value,reference));recordReferenceRound(current.current);}
 async function remove(match){const found=current.current.references.find(match);if(found){change(value=>removeReference(value,found.id));recordReferenceRound(current.current);}}
 const chat=<StudioChat state={state} conversationId="references" getState={()=>current.current} change={change} flush={async()=>{}} tools={tools} hasApiKey={key} getApiKey={()=>key?'sk-synthetic-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx':''} loadReference={async id=>({file:files.get(id)})} onUseImage={async()=>true}/>;
 return <StudioShell stage="studio" projectId="${project}" projectTitle="Oficina de cerâmica" conversationFocus chatMessageCount={state.messages.length} accountLabel="Conta de teste" headerActions={<button className="studio-button-secondary" onClick={()=>setKey(true)}>Conectar IA de teste</button>} chat={chat} canvas={<div className="studio-brief">
  <div className="studio-reference-screen-heading"><h2>Referências para sua ideia</h2><button className="studio-button-secondary">Definir textos da arte</button></div>
  <ReferenceSelectionTray items={state.references.map(item=>({...item,url:urls[item.id]}))} limit={20} onRemove={id=>remove(item=>item.id===id)}/>
  <ReferenceExploration userId="${user}" projectId="${project}" idea="Oficina de cerâmica para iniciantes" selectedOrigins={state.references.flatMap(item=>item.source?.originUrl?[item.source.originUrl]:[])} onUseReference={(reference,file)=>add({originUrl:reference.originUrl,board:reference.board,title:reference.title},file)} onContinue={()=>{}}/>
  <ExplorationGallery projectId="${project}" completed={0} selectedIds={state.references.flatMap(item=>item.source?.kind==='generated'?[item.source.imageId]:[])} onUseReference={(imageId,file,ordinal)=>add({kind:'generated',projectId:'${project}',imageId,ordinal},file)}/>
 </div>}/>;
}
createRoot(document.getElementById('root')).render(<Screen/>);`;
const reply={version:1,kind:'taste_reading',reading:'Você escolheu texturas quentes e formas cheias, com fundo calmo. A seleção sugere acolhimento artesanal, não sofisticação de galeria.',recommendation:'Use terracota como cor dominante e uma tipografia serifada robusta, porque transmite mão na massa para quem ainda não fez cerâmica.',question:'Posso seguir por essa direção acolhedora?',synthesis:'Terracota dominante com serifa robusta',options:[
 {id:'agree',intent:'agree',label:'Concordo'},
 {id:'prefer_1',intent:'prefer',label:'Mais sóbrio',description:'Tons de argila clara, tipografia leve e mais espaço vazio.'},
 {id:'prefer_2',intent:'prefer',label:'Agressivo',description:'Laranja saturado, contraste alto e título em caixa alta pesada.'},
 {id:'adjust',intent:'adjust',label:'Quero ajustar'},
]};
const text=`${reply.reading}\n\n**Recomendação:** ${reply.recommendation}\n\n${reply.question}`;
const pixels=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC','base64');
async function fixture(t,viewport) {
  const result=await build({stdin:{contents:source,loader:'jsx',resolveDir:fileURLToPath(new URL('../',import.meta.url))},alias:{'@compor/agile-deliberation/readiness':fileURLToPath(new URL('../../../packages/agile-deliberation/src/readiness.js',import.meta.url))},bundle:true,write:false,external:['/studio/*'],outdir:'/tmp/compor-reference-composition',format:'esm',platform:'browser',target:'es2022',jsx:'automatic',define:{'process.env.NODE_ENV':'"test"'}});
  const script=result.outputFiles.find(file=>file.path.endsWith('.js')).text,css=result.outputFiles.find(file=>file.path.endsWith('.css')).text;
  const server=createServer(async(req,res)=>{
    if(req.url==='/fixture.js'){res.setHeader('content-type','text/javascript');res.end(script);}
    else if(req.url==='/fixture.css'){res.setHeader('content-type','text/css');res.end(css);}
    else if(/^\/studio\/[a-z-]+\.(svg|ttf)$/.test(req.url)){try{res.setHeader('content-type',req.url.endsWith('.svg')?'image/svg+xml':'font/ttf');res.end(await readFile(new URL('../public'+req.url,import.meta.url)));}catch{res.writeHead(404).end();}}
    else{res.setHeader('content-type','text/html');res.end('<html lang="pt-BR"><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{margin:0}</style><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script type="module" src="/fixture.js"></script></body></html>');}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
  const browser=await chromium.launch({executablePath:browserPath,headless:true});
  t.after(async()=>{await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
  const page=await browser.newPage({viewport});page.setDefaultTimeout(9000);
  const errors=[],calls=[];page.on('pageerror',error=>errors.push(error.message));t.after(()=>assert.deepEqual(errors,[]));
  // The pin previews are drawn locally: no external request leaves the fixture.
  const swatches=['ba654a','123eab','68784e','e8b44a'];
  await page.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.hostname==='i.pinimg.com'){const index=pins.findIndex(item=>item.previewUrl===url.href);return route.fulfill({contentType:'image/svg+xml',body:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 200"><rect width="240" height="200" fill="#f4f0e5"/><circle cx="120" cy="95" r="60" fill="#${swatches[index%4]}"/><rect x="45" y="125" width="150" height="16" fill="#fbfcfb"/></svg>`});}
    if(url.pathname.endsWith('/signals'))return route.fulfill({json:{signals:[]}});
    if(url.pathname==='/api/studio/references/history')return route.fulfill({json:{references:[]}});
    if(url.pathname==='/api/studio/references/search')return route.fulfill({json:{status:'ok',references:pins}});
    if(url.pathname==='/api/studio/references/preview')return route.fulfill({contentType:'image/png',body:pixels});
    if(url.pathname==='/api/studio/explorations/image')return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 300"><rect width="240" height="300" fill="#123eab"/><text x="24" y="150" font-size="34" fill="#f6d550" font-family="serif">Oficina</text></svg>'});
    if(url.pathname==='/api/studio/explorations')return route.fulfill({json:{images:[{id:generated,project_id:project,state:'completed',created_at:'2026-11-10T12:00:00.000Z',ordinal:3,batch_id:null,batch_position:null}],nextBeforeOrdinal:null}});
    if(url.pathname==='/api/studio/chat'){const body=request.postDataJSON();calls.push(body);return route.fulfill({json:body.op==='reference_selection'?{status:'completed',text,reply}:{status:'completed',text:'Seguimos com terracota e serifa robusta.'}});}
    if(url.origin===origin)return route.continue();
    return route.abort();
  });
  await page.goto(origin);await page.evaluate(()=>document.fonts.ready);
  return {page,calls};
}
const options={skip:!browserPath||!existsSync(browserPath),timeout:45000};
async function selectAndRead(page,calls){
  await page.getByRole('button',{name:'Permitir nesta sessão'}).click();
  for(const title of ['Terracota e textura','Forma e calma']){await page.getByRole('checkbox',{name:`Escolher referência: ${title}`}).click();await page.getByRole('checkbox',{name:`Escolher referência: ${title}`,checked:true}).waitFor();}
  await page.getByRole('button',{name:'Conectar IA de teste'}).click();
  await page.waitForFunction(()=>document.querySelector('.studio-taste-card'),null,{timeout:12000});
  assert.equal(calls.filter(call=>call.op==='reference_selection').length,1);
}
const box=(page,selector)=>page.locator(selector).first().evaluate(element=>element.getBoundingClientRect().toJSON());

test('desktop: imagens conservam a coluna principal e a leitura com opções fica na conversa lateral',options,async t=>{
  const {page,calls}=await fixture(t,{width:1440,height:960});
  await selectAndRead(page,calls);
  const main=await box(page,'#studio-main'),chat=await box(page,'.studio-chat-slot'),card=await box(page,'.studio-taste-card'),tray=await box(page,'.reference-selection-tray');
  assert.ok(main.right<=chat.x,'a conversa não cobre as imagens');assert.ok(main.width>chat.width*1.8,'as imagens são protagonistas');
  assert.ok(card.x>=chat.x&&card.right<=chat.right,'a leitura fica dentro da conversa');
  assert.ok(tray.right<=main.right,'a bandeja fica na coluna das imagens');
  assert.match(await page.locator('.reference-selection-tray').textContent(),/2 de 20 referências/);
  await page.locator('.studio-chat-messages').evaluate(element=>element.scrollTop=element.scrollHeight);
  await page.locator('#studio-main').evaluate(element=>element.scrollTop=0);
  await page.screenshot({path:'/tmp/compor-studio-visual-quick-replies-desktop.png'});
  await page.getByRole('button',{name:'Agressivo',exact:true}).click();
  await page.getByText('Você escolheu “Agressivo”. A resposta está na conversa.',{exact:true}).waitFor();
  assert.equal(calls.at(-1).message,'Prefiro esta alternativa: Agressivo — Laranja saturado, contraste alto e título em caixa alta pesada.');
  await page.getByText('Seguimos com terracota e serifa robusta.',{exact:true}).waitFor();
  await page.locator('.studio-chat-messages').evaluate(element=>element.scrollTop=element.scrollHeight);
  await page.screenshot({path:'/tmp/compor-studio-visual-quick-replies-desktop-answered.png'});
});

test('celular: referências e conversa alternam, e a leitura cabe sem rolagem horizontal',options,async t=>{
  const {page,calls}=await fixture(t,{width:390,height:844});
  await selectAndRead(page,calls);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.locator('#studio-main').evaluate(element=>element.scrollTop=0);
  await page.screenshot({path:'/tmp/compor-studio-visual-reference-selection-mobile.png'});
  await page.getByText('Nova mensagem',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Abrir conversa',exact:true}).click();
  await page.getByRole('group',{name:reply.question}).waitFor();
  const card=await box(page,'.studio-taste-card'),composer=await box(page,'.studio-chat-composer');
  assert.ok(card.x>=0&&card.right<=390,'a leitura cabe na largura');assert.ok(composer.bottom<=844,'o compositor continua visível');
  const heights=await page.locator('.studio-quick-reply').evaluateAll(items=>items.map(item=>item.getBoundingClientRect().height));
  assert.ok(heights.every(height=>height>=44),'opções com alvo de toque de 44 px');
  await page.locator('.studio-taste-card').scrollIntoViewIfNeeded();
  await page.screenshot({path:'/tmp/compor-studio-visual-quick-replies-mobile.png'});
  // Switching views keeps the selection and the reading.
  await page.getByRole('button',{name:'Referências',exact:true}).click();
  assert.match(await page.locator('.reference-selection-tray').textContent(),/2 de 20 referências/);
  await page.getByRole('button',{name:'Abrir conversa',exact:true}).click();
  assert.equal(await page.getByRole('group',{name:reply.question}).getByRole('button',{disabled:false}).count(),4);
});
