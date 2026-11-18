import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {chromium} from 'playwright-core';

const browserPath=process.env.BROWSER_EXECUTABLE_PATH;
const source=`
import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import StudioShell from './studio/studio-shell.tsx';
import ContextStrip from './studio/context-strip.tsx';
import {createStudioState,updateBrief,updateOfferFacts} from './lib/studio-state.ts';
import './studio/reference-exploration.css';
function Conversation(){
 const [draft,setDraft]=useState('');
 return <section className="studio-chat-panel" aria-label="Conversa do projeto">
  <header className="studio-chat-header"><img src="/studio/compor-avatar.svg" alt="" width="26" height="26"/><div><h2>Vamos compor juntos</h2><p>Uma conversa, muitas possibilidades.</p></div></header>
  <div className="studio-chat-meta"><details className="studio-chat-context"><summary>Contexto do pedido</summary><p>Contexto do projeto</p>{Array.from({length:12},(_,i)=><p key={i}>Detalhe da direção criativa {i+1}</p>)}</details></div>
  <div className="studio-chat-messages">{Array.from({length:24},(_,i)=><div className="studio-message" key={i}><p>{i===0?'Estas referências exploram cor e composição. O que mais combina com sua ideia?':'Podemos testar outra direção visual mantendo sua mensagem.'}</p></div>)}</div>
  <form className="studio-chat-composer" onSubmit={event=>event.preventDefault()}><label className="sr-only" htmlFor="test-message">Sua mensagem</label><textarea id="test-message" value={draft} onChange={event=>setDraft(event.target.value)} placeholder="Conte o que chamou sua atenção…"/><button className="studio-button" aria-label="Enviar mensagem">↑</button></form>
 </section>;
}
function Preview(){
 const [references,setReferences]=useState(true),[selected,setSelected]=useState([]),[count,setCount]=useState(1);
 const [state,setState]=useState(()=>createStudioState({userId:'00000000-0000-4000-8000-000000000001',projectId:'00000000-0000-4000-8000-000000000003'}));
 return <StudioShell stage="studio" projectId="reference-workspace" projectTitle="Uma oficina de cerâmica" conversationFocus={references} chatMessageCount={count} accountLabel="Conta de teste" headerActions={<><button className="studio-button-secondary">Revisar post</button><button className="studio-button">Salvar versão</button><button className="studio-button-secondary" onClick={()=>setCount(count+1)}>Simular resposta</button></>} context={<ContextStrip state={state} onBrief={patch=>setState(value=>updateBrief(value,patch))} onFacts={facts=>setState(value=>updateOfferFacts(value,facts))}/>} chat={<Conversation/>} canvas={<div className="studio-brief">
  <div className="studio-reference-screen-heading"><h2>{references?'Referências para sua ideia':'Post atual'}</h2><button className="studio-button-secondary" onClick={()=>setReferences(!references)}>{references?'Voltar ao post':'Escolher mais referências'}</button></div>
  <section className="reference-exploration"><h2>Explore uma direção visual</h2><p>Escolha o que chamou sua atenção. A conversa ajuda a entender por quê.</p><output>{selected.length} referências selecionadas</output><div className="reference-results">{Array.from({length:12},(_,i)=><article key={i}><button className="reference-image-select" aria-label={'Referência '+(i+1)} aria-pressed={selected.includes(i)} onClick={()=>setSelected(items=>items.includes(i)?items:items.concat(i))}><svg role="img" aria-label={'Composição de teste '+(i+1)} viewBox="0 0 240 200" style={{width:'100%',display:'block',background:['#e8d7c2','#eaf0ff','#e5e9db'][i%3]}}><circle cx="120" cy="95" r="60" fill={['#ba654a','#123eab','#68784e'][i%3]}/><rect x="45" y="125" width="150" height="16" fill="#f4f0e5"/></svg><span>{selected.includes(i)?'Selecionada':'Usar como referência'}</span></button><h3>{['Terracota e textura','Cor e contraste','Forma e calma'][i%3]}</h3><p>Referência visual sintética {i+1}</p></article>)}</div></section>
 </div>}/>;
}
createRoot(document.getElementById('root')).render(<Preview/>);`;

async function fixture(t,viewport={width:1440,height:960}) {
  const result=await build({stdin:{contents:source,loader:'jsx',resolveDir:fileURLToPath(new URL('../',import.meta.url))},bundle:true,write:false,external:['/studio/*'],outdir:'/tmp/compor-reference-fixture',format:'esm',platform:'browser',target:'es2022',jsx:'automatic',define:{'process.env.NODE_ENV':'"test"'}});
  const script=result.outputFiles.find(file=>file.path.endsWith('.js')).text,css=result.outputFiles.find(file=>file.path.endsWith('.css')).text;
  const server=createServer(async(req,res)=>{
    if(req.url==='/fixture.js'){res.setHeader('content-type','text/javascript');res.end(script);}
    else if(req.url==='/fixture.css'){res.setHeader('content-type','text/css');res.end(css);}
    else if(/^\/studio\/[a-z-]+\.(svg|ttf)$/.test(req.url)){
      try{res.setHeader('content-type',req.url.endsWith('.svg')?'image/svg+xml':'font/ttf');res.end(await readFile(new URL('../public'+req.url,import.meta.url)));}catch{res.writeHead(404).end();}
    }else{res.setHeader('content-type','text/html');res.end('<html lang="pt-BR"><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{margin:0}.sr-only{position:absolute;clip-path:inset(50%);width:1px;height:1px;overflow:hidden}</style><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script type="module" src="/fixture.js"></script></body></html>');}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let browser;
  t.after(async()=>{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
  browser=await chromium.launch({executablePath:browserPath,headless:true});
  const page=await browser.newPage({viewport});page.setDefaultTimeout(6000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const origin=`http://127.0.0.1:${server.address().port}`;
  await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  await page.goto(origin);await page.getByRole('heading',{name:'Referências para sua ideia'}).waitFor();
  await page.evaluate(()=>document.fonts.ready);
  return {page,errors};
}
const options={skip:!browserPath||!existsSync(browserPath),timeout:30000};

async function geometry(page){return page.evaluate(()=>{
  const rect=selector=>document.querySelector(selector).getBoundingClientRect().toJSON();
  return {main:rect('#studio-main'),chat:rect('.studio-chat-slot'),composer:rect('.studio-chat-composer'),position:getComputedStyle(document.querySelector('.studio-chat-slot')).position,width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth};
});}

test('referências e conversa ocupam colunas sem sobreposição; seleção, rascunho e rolagem são preservados',options,async t=>{
  const {page,errors}=await fixture(t);
  assert.equal(await page.locator('.studio-floating-bar').count(),0);
  assert.equal(await page.getByRole('slider',{name:'Altura da conversa'}).count(),0);
  for(const width of [1440,1024]){
    await page.setViewportSize({width,height:960});
    const box=await geometry(page);
    assert.equal(box.position,'relative');assert.equal(box.overflow,false);
    assert.ok(box.main.width>box.chat.width,'referências conservam a maior coluna');
    assert.ok(box.main.right<=box.chat.x,'a conversa não cobre referências');
    assert.ok(box.composer.bottom<=box.height,'compositor permanece visível');
  }
  await page.setViewportSize({width:1440,height:960});
  await page.getByRole('button',{name:'Referência 1',exact:true}).click();
  await page.getByLabel('Sua mensagem').fill('Gostei da textura, mas prefiro menos contraste.');
  await page.locator('#studio-main').evaluate(element=>element.scrollTop=300);
  const scroll=await page.locator('#studio-main').evaluate(element=>element.scrollTop);
  assert.ok(scroll>0);
  await page.locator('.studio-chat-messages').evaluate(element=>element.scrollTop=element.scrollHeight);
  assert.equal(await page.locator('#studio-main').evaluate(element=>element.scrollTop),scroll);
  await page.screenshot({path:'/tmp/compor-studio-visual-reference-sidebar-desktop.png'});
  await page.getByRole('button',{name:'Recolher conversa'}).click();
  await page.waitForFunction(()=>document.activeElement?.getAttribute('aria-label')==='Abrir conversa');
  assert.equal(Math.round((await page.locator('#studio-main').boundingBox()).width),1440);
  await page.getByRole('button',{name:'Abrir conversa'}).click();
  await page.waitForFunction(()=>document.activeElement?.id==='test-message');
  assert.equal(await page.getByLabel('Sua mensagem').inputValue(),'Gostei da textura, mas prefiro menos contraste.');
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Abrir conversa'}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Referência 1',exact:true}).getAttribute('aria-pressed'),'true');
  assert.deepEqual(errors,[]);
});

test('mobile alterna áreas em fluxo, conserva escolhas e rascunho e acomoda tela estreita e teclado',options,async t=>{
  const {page,errors}=await fixture(t,{width:390,height:844});
  const open=page.getByRole('button',{name:'Abrir conversa',exact:true});
  assert.equal(await open.getAttribute('aria-expanded'),'false');
  assert.equal(await page.getByRole('complementary').count(),0);
  assert.equal(await page.locator('.studio-floating-bar').count(),0);
  await page.getByRole('button',{name:'Referência 1',exact:true}).click();
  await page.locator('#studio-main').evaluate(element=>element.scrollTop=250);
  const scroll=await page.locator('#studio-main').evaluate(element=>element.scrollTop);
  await page.screenshot({path:'/tmp/compor-studio-visual-reference-sidebar-mobile-references.png'});
  await page.getByRole('button',{name:'Simular resposta'}).click();
  await page.getByText('Nova mensagem',{exact:true}).waitFor();
  await open.click();
  await page.waitForFunction(()=>document.activeElement?.id==='test-message');
  assert.equal(await page.locator('#studio-main').isVisible(),false);
  await page.getByLabel('Sua mensagem').fill('Preservar meu comentário');
  for(const viewport of [{width:390,height:844},{width:320,height:568},{width:390,height:420},{width:768,height:740}]){
    await page.setViewportSize(viewport);
    const box=await geometry(page);
    assert.equal(box.position,'relative');assert.equal(box.overflow,false);
    assert.ok(box.chat.x>=0&&box.chat.right<=box.width);
    assert.ok(box.composer.bottom<=box.height+1,'compositor cabe com teclado/tela curta');
    assert.ok(box.composer.top>=box.chat.y,'compositor não sobe sobre cabeçalho');
  }
  await page.setViewportSize({width:390,height:844});
  const requestContext=page.locator('.studio-chat-context');
  await requestContext.locator('summary').click();
  assert.equal(await requestContext.evaluate(element=>element.open),true,'contexto nativo abre antes de simular o teclado');
  // Model a keyboard that changes only the visual viewport, not CSS media queries.
  await page.evaluate(()=>{Object.defineProperty(window.visualViewport,'height',{configurable:true,value:380});window.visualViewport.dispatchEvent(new Event('resize'));});
  await page.waitForFunction(()=>document.querySelector('.studio-chat-composer').getBoundingClientRect().bottom<=380);
  assert.equal(await requestContext.evaluate(element=>element.open),true,'abrir o teclado preserva o contexto expandido');
  await page.evaluate(()=>{delete window.visualViewport.height;window.visualViewport.dispatchEvent(new Event('resize'));});
  assert.ok((await geometry(page)).composer.bottom<=844);
  await page.screenshot({path:'/tmp/compor-studio-visual-reference-sidebar-mobile-chat.png'});
  await page.keyboard.press('Escape');
  await page.waitForFunction(()=>document.activeElement?.getAttribute('aria-label')==='Abrir conversa');
  assert.equal(await page.locator('#studio-main').isVisible(),true);
  assert.equal(await page.locator('#studio-main').evaluate(element=>element.scrollTop),scroll);
  assert.equal(await page.getByRole('button',{name:'Referência 1',exact:true}).getAttribute('aria-pressed'),'true');
  for(let index=0;index<3;index++){await open.click();await page.getByRole('button',{name:'Referências',exact:true}).click();}
  await open.click();assert.equal(await page.getByLabel('Sua mensagem').inputValue(),'Preservar meu comentário');
  await page.setViewportSize({width:1440,height:960});
  // The breakpoint reaches React through a media query listener after the resize; wait for it without a longer timeout.
  await page.locator('#studio-main').waitFor({state:'visible'});
  assert.equal(await page.locator('#studio-main').isVisible(),true);
  assert.equal(await page.locator('.studio-chat-panel').count(),1);
  await page.getByRole('button',{name:'Referência 1',exact:true}).focus();
  await page.setViewportSize({width:390,height:844});
  await page.waitForFunction(()=>document.activeElement?.getAttribute('aria-label')==='Abrir conversa');
  await page.keyboard.press('Escape');
  await page.getByRole('region',{name:'Contexto do projeto'}).locator('summary').first().click();
  await page.getByLabel('Oferta',{exact:true}).fill('Uma oficina para criar com as mãos');
  await page.setViewportSize({width:390,height:420});
  await open.click();
  assert.ok((await geometry(page)).composer.bottom<=420);
  await page.getByRole('button',{name:'Referências',exact:true}).click();
  assert.equal(await page.getByLabel('Oferta',{exact:true}).inputValue(),'Uma oficina para criar com as mãos');
  await open.click();
  // Opening moves focus to the composer on the next frame; let it settle before resizing.
  await page.waitForFunction(()=>document.activeElement?.id==='test-message');
  await page.setViewportSize({width:1440,height:960});
  await page.getByLabel('Oferta',{exact:true}).focus();
  await page.setViewportSize({width:390,height:844});
  await page.waitForFunction(()=>document.activeElement?.getAttribute('aria-label')==='Abrir conversa');
  // Focus moves in the breakpoint callback; the compact layout attribute follows on the next React render.
  await page.locator('.studio-context').waitFor({state:'hidden'});await page.locator('.studio-topbar-end').waitFor({state:'hidden'});
  assert.equal(await page.locator('.studio-context').isVisible(),false);
  assert.equal(await page.locator('.studio-topbar-end').isVisible(),false);
  await page.setViewportSize({width:1440,height:960});
  await page.getByRole('button',{name:'Salvar versão',exact:true}).waitFor({state:'visible'});
  await page.getByRole('button',{name:'Salvar versão',exact:true}).focus();
  assert.equal(await page.getByRole('button',{name:'Salvar versão',exact:true}).evaluate(element=>element===document.activeElement),true);
  await page.setViewportSize({width:390,height:844});
  await page.waitForFunction(()=>document.activeElement?.getAttribute('aria-label')==='Abrir conversa');
  await page.locator('.studio-topbar-end').waitFor({state:'hidden'});
  assert.equal(await page.locator('.studio-topbar-end').isVisible(),false);
  assert.deepEqual(errors,[]);
});

test('retorno ao post preserva a conversa e não altera a preferência do editor',options,async t=>{
  const {page,errors}=await fixture(t);
  await page.getByLabel('Sua mensagem').fill('Comentário ainda não enviado');
  await page.getByRole('button',{name:'Voltar ao post'}).click();
  assert.equal(await page.locator('.compor-studio').getAttribute('data-chat-presentation'),'floating');
  await page.getByRole('button',{name:'Abrir conversa'}).click();
  assert.equal(await page.getByLabel('Sua mensagem').inputValue(),'Comentário ainda não enviado');
  await page.getByRole('button',{name:'Escolher mais referências'}).click();
  assert.equal(await page.locator('.compor-studio').getAttribute('data-chat-presentation'),'sidebar');
  assert.equal(await page.getByLabel('Sua mensagem').inputValue(),'Comentário ainda não enviado');
  await page.getByRole('button',{name:'Recolher conversa'}).click();
  await page.getByRole('button',{name:'Voltar ao post'}).click();
  await page.getByRole('complementary',{name:'Conversa com a IA'}).waitFor();
  assert.equal(await page.getByLabel('Sua mensagem').inputValue(),'Comentário ainda não enviado');
  assert.deepEqual(errors,[]);
});
