import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {chromium} from 'playwright-core';

const browserPath=process.env.BROWSER_EXECUTABLE_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const userId=id(1),projectId=id(2),requestId=id(3),pieceId=id(4),refId=id(5),otherPiece=id(6),assetId=id(7);
const marker=`compor-studio-chat:${userId}:${projectId}`;
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4AWJiYGBgAAAAAP//XRcpzQAAAAZJREFUAwAADwADJDd96QAAAABJRU5ErkJggg==';
const proposal={prompt:'Mantenha o produto e refine a composição',operation:'edit',baseImageId:pieceId,referenceIds:[refId]};
const staleNotice='O post ou suas imagens mudaram durante a preparação. Consulte a mesma proposta para revisar.';
const carouselFrames = [
  ['Capa', 'Luz de janela', 'framed_plate'],
  ['Orientação', 'Encontre o ponto de luz', 'split_horizontal'],
  ['Exemplo', 'Observe a direção da sombra', 'split_vertical'],
  ['Prática', 'Mude a posição do objeto', 'framed_plate'],
  ['Fechamento', 'Salve para testar', 'cta_closing'],
].map(([role, headline, layout], index) => ({
  id: id(30 + index), position: index + 1, role, headline, body: '', visualCue: '',
  composition: {layout, alt: `${headline}.`},
}));

async function fixtureSource(){
 const contents=`
import {useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import StudioChat from './studio/studio-chat.tsx';
import {prepareSelectedVisualCandidates} from './lib/selected-visual-input.ts';
import {createParallelJournalStore} from './lib/parallel-exploration-journal.ts';
import {createStudioState,selectVersion,selectDraft,prepareAdjustment,parseStudioState,recordSavedVersion,getCurrentDraft,setDraftFrames} from './lib/studio-state.ts';
const ids=${JSON.stringify({userId,projectId,requestId,pieceId,refId,otherPiece})};
const content={headline:'Oficina de cerâmica',price:'R$ 129,90',date:'12/12',caption:'Legenda separada',captionOrigin:'user'};
const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=1280;
const ctx=canvas.getContext('2d'),pixels=ctx.createImageData(canvas.width,canvas.height);let seed=123456789;
function random(){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return seed>>>0;}
for(let index=0;index<pixels.data.length;index+=4){const value=random();pixels.data[index]=value&255;pixels.data[index+1]=(value>>>8)&255;pixels.data[index+2]=(value>>>16)&255;pixels.data[index+3]=255;}
ctx.putImageData(pixels,0,0);
const original=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
const reference=new Blob([Uint8Array.from(atob('${png}'),char=>char.charCodeAt(0))],{type:'image/png'});
const authorityMode=new URLSearchParams(location.search).has('authority');const referenceMetadata={id:ids.refId,name:'Referência original',mime:'image/png',size:reference.size,width:1,height:1,source:{kind:'local-upload'}};
const carouselMode = new URLSearchParams(location.search).has('carousel');
window.saveVisual=async()=>{const visual=await prepareSelectedVisualCandidates({references:[referenceMetadata],projectId:ids.projectId,externalConsent:false,loadReference:async()=>({file:reference,metadata:referenceMetadata})});const store=createParallelJournalStore();try{await store.saveRequestVisualSnapshot({userId:ids.userId,projectId:ids.projectId,conversationId:ids.pieceId,requestId:ids.requestId},visual);}finally{store.close();}};window.authorityScopes=[];
const images=new Map([['${pieceId}:1',original],['${otherPiece}:1',reference]]);
const digest=async blob=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())),n=>n.toString(16).padStart(2,'0')).join('');
window.__transport={originalHash:await digest(original),originalSize:original.size,original,images,digest};
const nativeDecode=window.createImageBitmap.bind(window);
async function trackedDecode(args){const bitmap=await nativeDecode(...args),close=bitmap.close.bind(bitmap);bitmap.close=()=>{close();window.__decodeClosed=true;};return bitmap;}
window.createImageBitmap=(...args)=>window.__holdDecode?new Promise((resolve,reject)=>{
 window.__releaseDecode=()=>{window.__holdDecode=false;trackedDecode(args).then(resolve,reject);};
}):nativeDecode(...args);
function initial(user=ids.userId,project=ids.projectId){
 let state=selectVersion(createStudioState({userId:user,projectId:project}),{pieceId:ids.otherPiece,version:1,latestVersion:1,content:{...content,headline:'Outro post'}});
 state=selectVersion(state,{pieceId:ids.pieceId,version:1,latestVersion:1,content});
 if (carouselMode) {
  state = setDraftFrames(state, {pieceId: ids.pieceId, baseVersion: 1,
    compositionMode: 'editorial_art', frames: ${JSON.stringify(carouselFrames)}});
 } else {
  state=parseStudioState({...state,...(authorityMode?{projectReferenceIds:[ids.refId]}:{}),references:[authorityMode?referenceMetadata:{id:ids.refId,name:'Referência original',mime:'image/png',size:reference.size,width:1,height:1}]});
 }
 return prepareAdjustment(state,{requestId:ids.requestId,messageId:'${id(10)}',instruction:'Refine esta arte',createdAt:'2026-11-05T00:00:00.000Z',eventId:'${id(11)}'});
}
function Fixture(){
 const [state,setState]=useState(initial),current=useRef(state),tools=useRef({execute:async()=>{throw Error('unexpected tool');}});
 function change(fn){const next=fn(current.current);current.current=next;setState(next);return next;}
 function scope(user,project){const next=initial(user,project);current.current=next;setState(next);}
 async function loadBase(){const selected=current.current.selection,file=images.get(selected.pieceId+':'+selected.baseVersion);return file?{file:new Blob([file],{type:file.type})}:null;}
 async function save(context){const draft=getCurrentDraft(current.current),version=draft.expectedLatestVersion+1;images.set(context.pieceId+':'+version,images.get(context.pieceId+':'+context.baseVersion));change(value=>recordSavedVersion(value,{pieceId:context.pieceId,baseVersion:context.baseVersion,version,content:draft.content,eventId:crypto.randomUUID()}));return{status:'completed',pieceId:context.pieceId,version};}
 return <main>
  <button onClick={()=>change(value=>selectDraft(value,{pieceId:ids.otherPiece,baseVersion:1}))}>Outro post</button>
  <button onClick={()=>scope('${id(12)}',ids.projectId)}>Outra conta</button>
  <button onClick={()=>scope(ids.userId,'${id(13)}')}>Outro projeto</button>
  <button onClick={()=>{images.set(ids.pieceId+':1',reference);}}>Trocar imagem na mesma versão</button>
  <output data-testid="source-size">{original.size}</output>
  <StudioChat conversationId={authorityMode || carouselMode ? ids.pieceId : undefined} {...(authorityMode?{checkReferenceAuthority:async()=>true,createVisualAuthoritySnapshot:async()=>{},visualAuthorityHeaders:async(scope)=>{window.authorityScopes.push(scope);return {'x-compor-reference-consent':'synthetic-visual-consent'};}}:{})} state={state} getState={()=>current.current} change={change} flush={async()=>{}} tools={tools} hasApiKey getApiKey={()=>'sk-synthetic-${'x'.repeat(30)}'} loadBase={carouselMode ? undefined : loadBase} loadReference={async()=>({file:reference})} prepareImageVersion={save} onUseImage={async({blob,pieceId,version})=>{images.set(pieceId+':'+version,blob);return true;}}/>
 </main>;
}
createRoot(document.getElementById('root')).render(<Fixture/>);
`;
 const result=await build({stdin:{contents,loader:'jsx',resolveDir:fileURLToPath(new URL('../',import.meta.url))},bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',jsx:'automatic',define:{'process.env.NODE_ENV':'"test"'}});
 return result.outputFiles[0].text;
}

test('cópia explícita permite editar PNG acima de 2 MiB e descarta preparações fora do contexto',{skip:!existsSync(browserPath),timeout:90000},async t=>{
 const source=await fixtureSource();
 const server=createServer((request,response)=>{
  if(request.url==='/fixture.js'){response.setHeader('Content-Type','text/javascript');response.end(source);}
  else if(request.url==='/studio/compor-avatar.svg'){response.setHeader('Content-Type','image/svg+xml');response.end('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>');}
  else {response.setHeader('Content-Type','text/html');response.end('<!doctype html><html><head><title>Artwork transport</title></head><body><div id="root"></div><script type="module" src="/fixture.js"></script></body></html>');}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin=`http://127.0.0.1:${server.address().port}`;
 const browser=await chromium.launch({executablePath:browserPath,headless:true});
 t.after(async()=>{await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
 const page=await browser.newPage();page.setDefaultTimeout(8000);
 const calls=[],errors=[],external=[];let generated=false,requireVisual=false;
 page.on('pageerror',error=>errors.push(error.message));
 page.on('request',request=>{if(!request.url().startsWith(origin))external.push(request.url());});
 await page.addInitScript(({marker,requestId,pieceId})=>sessionStorage.setItem(marker,JSON.stringify({requestId,previousAttemptKey:null,imageProtocolVersion:2,imageContext:{pieceId,baseVersion:1}})),{marker,requestId,pieceId});
 await page.route('**/api/**',async route=>{
  const request=route.request(),url=new URL(request.url()),body=request.method()==='POST'?request.postDataJSON():null;
  calls.push({path:url.pathname,body,query:Object.fromEntries(url.searchParams)});
  if(url.pathname==='/api/studio/chat')return route.fulfill({status:202,json:generated?{status:'completed',text:'Nova arte armazenada.'}:{status:'consent_required',attemptId:id(20),imageActionId:id(21),prompt:proposal.prompt,proposal,actionBinding:'synthetic-binding',declineBinding:'synthetic-decline',...(requireVisual?{visualInputRequired:true}:{})}});
  if(url.pathname==='/api/agent/image'){generated=true;return route.fulfill({status:202,json:{status:'accepted',assetId}});}
  if(url.pathname==='/api/images')return route.fulfill({contentType:'image/png',body:Buffer.from(png,'base64')});
  throw Error('unexpected API');
 });
 const prepare=()=>page.getByRole('button',{name:'Preparar cópia para edição',exact:true});
 async function openProposal(){
  generated=false;
  await page.goto(origin);
  await page.getByTestId('source-size').waitFor();
  await page.getByRole('button',{name:'Consultar esta tentativa',exact:true}).click();
  await prepare().waitFor();
  assert.equal(await page.getByRole('button',{name:'Confirmar geração de imagem',exact:true}).count(),0);
 }
 await openProposal();
 const details=page.getByText('Ver descrição da arte',{exact:true});
 await details.waitFor();
 assert.equal(await page.getByText(proposal.prompt,{exact:true}).isVisible(),false,'o prompt começa recolhido');
 await details.click();assert.equal(await page.getByText(proposal.prompt,{exact:true}).isVisible(),true);
 const before=await page.evaluate(()=>({hash:window.__transport.originalHash,size:window.__transport.originalSize}));
 assert.ok(before.size>2*1024*1024&&before.size<=8*1024*1024,'o PNG válido ocupa a faixa que impedia editar resultados gerados');
 await prepare().click();
 assert.equal(await page.evaluate(()=>window.__transport.digest(window.__transport.images.get('00000000-0000-4000-8000-000000000004:1'))),before.hash);
 await page.getByText('Imagem gerada e adicionada a este post · versão 2.',{exact:true}).waitFor();
 const paid=calls.filter(call=>call.path==='/api/agent/image');assert.equal(paid.length,1);
 const payload=paid[0].body;
 assert.equal(payload.version,2);assert.equal(payload.pieceId,pieceId);assert.equal(payload.explicitApproval,true);
 assert.deepEqual(payload.artworkInput.source,{pieceId,version:1});
 assert.deepEqual(payload.artworkInput.literalText,{headline:'Oficina de cerâmica',price:'R$ 129,90',date:'12/12'});
 const [base,reference]=payload.artworkInput.images;
 assert.equal(base.id,pieceId);assert.equal(base.role,'base');assert.equal(base.mime,'image/jpeg');
 const jpeg=Buffer.from(base.data,'base64');assert.equal(jpeg[0],255);assert.equal(jpeg[1],216);
 assert.ok(jpeg.length+Buffer.from(reference.data,'base64').length<=2*1024*1024);
 assert.equal(reference.id,refId);assert.equal(reference.mime,'image/png');assert.equal(reference.data,png,'referência pequena continua byte a byte igual');
 const dimensions=await page.evaluate(async data=>{const bitmap=await createImageBitmap(new Blob([Uint8Array.from(atob(data),char=>char.charCodeAt(0))],{type:'image/jpeg'}));const result={width:bitmap.width,height:bitmap.height};bitmap.close();return result;},base.data);
 assert.deepEqual(dimensions,{width:1024,height:1280});
 assert.equal(await page.evaluate(()=>window.__transport.digest(window.__transport.images.get('00000000-0000-4000-8000-000000000004:1'))),before.hash,'aplicar o resultado à versão 2 conserva os bytes da versão 1');
 for(const action of ['Trocar imagem na mesma versão','Outro post','Outra conta','Outro projeto']){
  await openProposal();
  const start=calls.length;
  await page.evaluate(()=>{window.__holdDecode=true;window.__releaseDecode=null;window.__decodeClosed=false;window.__confirmationEnabled=false;new MutationObserver(()=>{const button=Array.from(document.querySelectorAll('button')).find(button=>button.textContent==='Confirmar geração de imagem');if(button&&!button.disabled)window.__confirmationEnabled=true;}).observe(document.body,{subtree:true,childList:true,attributes:true});});
  await prepare().click();
  await page.waitForFunction(()=>typeof window.__releaseDecode==='function');
  await page.getByRole('button',{name:action,exact:true}).click();
  await page.evaluate(()=>window.__releaseDecode());
  await page.waitForFunction(()=>window.__decodeClosed);
  if(action==='Outra conta'||action==='Outro projeto'){
   await page.waitForFunction(()=>!document.querySelector('.studio-image-consent'));
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  }
  else await page.getByText(staleNotice,{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>window.__confirmationEnabled),false,action+' não deve publicar a cópia antiga');
  assert.equal(calls.length,start,action+' durante preparação não provoca geração');
 }
 requireVisual=true;generated=false;await page.goto(origin);
 await page.getByRole('button',{name:'Consultar esta tentativa',exact:true}).click();
 await page.getByText('Não foi possível recuperar as imagens desta conversa.',{exact:true}).waitFor();
 assert.equal(calls.filter(call=>call.path==='/api/agent/image').length,1,'snapshots ausentes não autorizam nova imagem');
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
});


test('arte visual usa snapshot do turno, id original e capability somente no efeito',{skip:!existsSync(browserPath),timeout:90000},async t=>{
 const source=await fixtureSource(),server=createServer((request,response)=>{if(request.url==='/fixture.js'){response.setHeader('Content-Type','text/javascript');response.end(source);}else if(request.url?.endsWith('.svg')){response.setHeader('Content-Type','image/svg+xml');response.end('<svg xmlns="http://www.w3.org/2000/svg"/>');}else response.end('<!doctype html><div id="root"></div><script type="module" src="/fixture.js"></script>');});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch({executablePath:browserPath,headless:true});t.after(async()=>{await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
 const page=await browser.newPage();page.setDefaultTimeout(8000);const calls=[];let generated=false;await page.addInitScript(({marker,requestId,pieceId})=>sessionStorage.setItem(marker+':conversation:'+pieceId,JSON.stringify({requestId,previousAttemptKey:null,imageProtocolVersion:2,imageContext:{pieceId,baseVersion:1}})),{marker,requestId,pieceId});
 await page.route('**/api/**',async route=>{const request=route.request(),url=new URL(request.url()),body=request.method()==='POST'?request.postDataJSON():null;calls.push({path:url.pathname,body,headers:request.headers()});if(url.pathname==='/api/studio/chat')return route.fulfill({status:202,json:generated?{status:'completed',text:'Nova arte armazenada.'}:{status:'consent_required',attemptId:id(20),imageActionId:id(21),prompt:proposal.prompt,proposal,actionBinding:'synthetic-binding',declineBinding:'synthetic-decline',visualInputRequired:true}});if(url.pathname==='/api/agent/image'){generated=true;return route.fulfill({status:202,json:{status:'accepted',assetId}});}if(url.pathname==='/api/images')return route.fulfill({contentType:'image/png',body:Buffer.from(png,'base64')});throw Error('unexpected API');});
 await page.goto(`${origin}/?authority=1`);await page.getByTestId('source-size').waitFor();await page.evaluate(()=>window.saveVisual());await page.getByRole('button',{name:'Consultar esta tentativa',exact:true}).click();await page.getByRole('button',{name:'Preparar cópia para edição',exact:true}).click();await page.getByText('Imagem gerada e adicionada a este post · versão 2.',{exact:true}).waitFor();
 const image=calls.find(call=>call.path==='/api/agent/image'),poll=calls.find(call=>call.path==='/api/studio/chat');assert.equal(poll.headers['x-compor-reference-consent'],undefined);assert.equal(image.headers['x-compor-reference-consent'],'synthetic-visual-consent');assert.equal(image.body.requestId,requestId);assert.equal(image.body.artworkInput.visualInput.entries[0].id,refId);assert.deepEqual(image.body.artworkInput.images.filter(item=>item.role==='reference').map(item=>item.id),[refId]);assert.equal(JSON.stringify(image.body).includes('synthetic-visual-consent'),false);const scopes=await page.evaluate(()=>window.authorityScopes);assert.equal(scopes[0].requestId,requestId);assert.equal(scopes[0].purpose,'artwork');assert.equal(scopes[0].conversationId,pieceId);
});

test('chat conserva relato de capa iniciada e mostra proposta de arte integral para um carrossel que exige composição',
  {skip: !existsSync(browserPath), timeout: 30000}, async t => {
    const source = await fixtureSource();
    const server = createServer((request, response) => {
      if (request.url === '/fixture.js') {
        response.setHeader('content-type', 'text/javascript');
        return response.end(source);
      }
      if (request.url === '/studio/compor-avatar.svg') {
        response.setHeader('content-type', 'image/svg+xml');
        return response.end('<svg xmlns="http://www.w3.org/2000/svg"/>');
      }
      response.end('<!doctype html><div id="root"></div><script type="module" src="/fixture.js"></script>');
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    let browser;
    t.after(async () => {
      try { await browser?.close(); }
      finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    });
    browser = await chromium.launch({executablePath: browserPath, headless: true});
    const page = await browser.newPage();
    page.setDefaultTimeout(6000);
    await page.addInitScript(({marker, requestId, pieceId}) => {
      sessionStorage.setItem(`${marker}:conversation:${pieceId}`, JSON.stringify({requestId, previousAttemptKey: null,
        imageProtocolVersion: 2, imageContext: {pieceId, baseVersion: 1}}));
    }, {marker, requestId, pieceId});

    const statedProgress = 'O plano está no rascunho. A geração da capa foi iniciada.';
    const imageProposal = {prompt: 'Arte integral para a capa da oficina', operation: 'create',
      frameId: carouselFrames[0].id, frameIndex: 1, referenceIds: []};
    const calls = [];
    let allowDecline = false;
    await page.route('**/api/**', async route => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const body = request.method() === 'POST' ? request.postDataJSON() : null;
      calls.push({path, body});
      if (path === '/api/studio/action' && allowDecline) {
        return route.fulfill({status: 202, json: {status: 'completed', text: 'Proposta dispensada.'}});
      }
      if (path !== '/api/studio/chat') return route.fulfill({status: 500, json: {error: 'unexpected_api'}});
      if (body.op === 'poll' && body.requestId === requestId) {
        return route.fulfill({status: 202, json: {status: 'completed', text: statedProgress}});
      }
      return route.fulfill({status: 202, json: {status: 'consent_required', attemptId: id(40),
        imageActionId: id(41), prompt: imageProposal.prompt, proposal: imageProposal,
        actionBinding: 'synthetic-generate-image', declineBinding: 'synthetic-decline'}});
    });

    await page.goto(`http://127.0.0.1:${server.address().port}/?carousel=1`);
    await page.getByRole('button', {name: 'Consultar esta tentativa', exact: true}).click();
    await page.getByText(statedProgress, {exact: true}).waitFor();
    assert.deepEqual(calls.map(call => call.path), ['/api/studio/chat']);
    assert.equal(await page.getByText(/Imagem gerada e adicionada a este post/).count(), 0);

    await page.getByRole('textbox', {name: 'Sua mensagem', exact: true}).fill('Gere as cinco lâminas.');
    await page.getByRole('button', {name: 'Enviar →', exact: true}).click();
    await page.getByText('Abra a revisão e componha as lâminas deste plano.', {exact: true}).waitFor();
    const submitted = calls.at(-1).body;
    assert.equal(submitted.message, 'Gere as cinco lâminas.');
    assert.equal(submitted.context.content.carouselPlan.slides.length, 5);
    assert.equal(submitted.context.content.carouselRender, undefined);
    assert.deepEqual(calls.map(call => call.path), ['/api/studio/chat', '/api/studio/chat']);
    assert.equal(await page.getByRole('button', {name: 'Preparar cópias para envio', exact: true}).count(), 0);

    await t.test('um plano composto oferece a orientação de revisão sem o cartão de arte integral', async () => {
      const legacyCard = page.getByRole('heading', {name: 'Gerar a arte completa', exact: true});
      assert.equal(await legacyCard.isVisible(), false, 'o cartão de arte integral concorre com a orientação de compor');
      assert.equal(await page.locator('.studio-image-consent').count(), 0);
      allowDecline = true;
      await page.getByRole('button', {name: 'Recusar proposta', exact: true}).click();
      await page.getByText('Proposta dispensada.', {exact: true}).waitFor();
      const actionCall = calls.find(call => call.path === '/api/studio/action');
      assert.ok(actionCall);
      assert.equal(actionCall.body.actionBinding, 'synthetic-decline');
      assert.equal(actionCall.body.result.status, 'declined');
    });
  });
