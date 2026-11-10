import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {chromium} from 'playwright-core';
import {randomBytes,createHash} from 'node:crypto';
import {deflateSync} from 'node:zlib';

const browserPath=process.env.BROWSER_EXECUTABLE_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const project='11111111-1111-4111-8111-111111111111',piece='22222222-2222-4222-8222-222222222222';
const id=n=>`33333333-3333-4333-8333-${String(n).padStart(12,'0')}`;
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+nmTkAAAAASUVORK5CYII=','base64');

// Render the production recovery controls without the removed creation flow.
async function fixture(t,{initialVersion=1}={}){
 const contents=`import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import StudioAssets from './app/studio-assets.tsx';
import {composeStudioPng} from './lib/studio-compose.ts';
const digest=async blob=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())),n=>n.toString(16).padStart(2,'0')).join('');
function Fixture(){
 const [userId,setUser]=useState('alice'),[version,setVersion]=useState(${initialVersion}),[used,setUsed]=useState(null),[preview,setPreview]=useState(null);
 return <main>
  <button onClick={()=>setUser(value=>value==='alice'?'bob':'alice')}>Trocar conta</button>
  <button onClick={()=>setVersion(value=>value===1?2:1)}>Trocar versão</button>
  <output data-testid="scope">{userId+':'+version}</output>
  <output data-testid="used">{used?JSON.stringify({size:used.blob.size,hash:used.hash,pieceId:used.pieceId,version:used.version}):''}</output>
  <StudioAssets userId={userId} projectId="${project}" pieceId="${piece}" version={version} canSave={false} preview={null} onUseImage={async image=>{setUsed({...image,hash:await digest(image.blob)});return true;}}/>
  <button disabled={!used} onClick={async()=>{const blob=await composeStudioPng({base:used.blob});setPreview({url:URL.createObjectURL(blob),hash:await digest(blob)});}}>Gerar prévia PNG</button>
  {preview&&<><img src={preview.url} alt="Prévia da peça"/><output data-testid="preview-hash">{preview.hash}</output></>}
 </main>;
}
createRoot(document.getElementById('root')).render(<Fixture/>);`;
 const bundle=await build({stdin:{contents,loader:'jsx',resolveDir:fileURLToPath(new URL('../',import.meta.url))},bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',jsx:'automatic',define:{'process.env.NODE_ENV':'"test"'}});
 const server=createServer((request,response)=>{
  if(request.url==='/fixture.js'){response.setHeader('Content-Type','text/javascript');response.end(bundle.outputFiles[0].contents);return;}
  response.setHeader('Content-Type','text/html');response.end('<!doctype html><html><body><div id="root"></div><script type="module" src="/fixture.js"></script></body></html>');
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin=`http://127.0.0.1:${server.address().port}`;
 const browser=await chromium.launch({executablePath:browserPath,headless:true});
 t.after(async()=>{await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
 const page=await browser.newPage();page.setDefaultTimeout(10000);
 const errors=[],external=[];page.on('pageerror',error=>errors.push(error.message));
 page.on('request',request=>{if(!request.url().startsWith(origin))external.push(request.url());});
 return {page,origin,errors,external};
}

function largeValidPng(){
 const width=1152,height=1152,stride=width*4+1,raw=randomBytes(stride*height);for(let y=0;y<height;y++)raw[y*stride]=0;
 const table=Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=(n&1)?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
 function chunk(name,bytes){const type=Buffer.from(name),out=Buffer.alloc(bytes.length+12);out.writeUInt32BE(bytes.length,0);type.copy(out,4);bytes.copy(out,8);let crc=0xffffffff;for(const b of Buffer.concat([type,bytes]))crc=table[(crc^b)&255]^(crc>>>8);out.writeUInt32BE((crc^0xffffffff)>>>0,bytes.length+8);return out;}
 const header=Buffer.alloc(13);header.writeUInt32BE(width,0);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(raw,{level:1})),chunk('IEND',Buffer.alloc(0))]);
}

test('recupera páginas de uma versão em nova sessão sem misturar contas',{skip:!existsSync(browserPath),timeout:90000},async t=>{
 const {page,origin,errors,external}=await fixture(t);
 let user='alice',failSecond=true,blockAlice=false,releaseAlice;
 const calls=[];let enteredAlice,deliveredAlice;const aliceEntered=new Promise(resolve=>{enteredAlice=resolve;}),aliceDelivered=new Promise(resolve=>{deliveredAlice=resolve;});let aliceGate;
 await page.route('**/api/image-assets**',async route=>{
  const capturedUser=user,blocked=capturedUser==='alice'&&blockAlice,url=new URL(route.request().url()),after=url.searchParams.get('after');
  calls.push({user:capturedUser,after,version:url.searchParams.get('version')});
  if(blocked){enteredAlice();await aliceGate;}
  if(capturedUser==='bob')return route.fulfill({json:{assets:[{assetId:id(101),origin:'unknown'}],nextCursor:null}});
  if(after&&failSecond){failSecond=false;return route.fulfill({status:503,json:{error:'unavailable'}});}
  await route.fulfill({json:after?{assets:[{assetId:id(51),origin:'unknown'}],nextCursor:null}:{assets:Array.from({length:50},(_,index)=>({assetId:id(index+1),origin:'unknown'})),nextCursor:id(50)}}).catch(()=>{});
  if(blocked)deliveredAlice();
 });
 await page.route('**/api/images?**',route=>route.fulfill({contentType:'image/png',body:png}));
 await page.goto(origin);
 await page.getByRole('button',{name:'Carregar mais imagens'}).click();
 await page.getByText(/Não foi possível consultar as imagens/).waitFor();
 await page.getByRole('button',{name:'Ver imagem recuperada 50',exact:true}).waitFor();
 await page.getByRole('button',{name:'Tentar novamente',exact:true}).click();
 await page.getByRole('button',{name:'Ver imagem recuperada 51',exact:true}).click();
 const preview=page.getByRole('img',{name:'Imagem recuperada para revisão'});await preview.waitFor();
 assert.equal(calls.at(-1).after,id(50));
 await page.evaluate(()=>sessionStorage.clear());await page.reload();
 await page.getByRole('button',{name:'Carregar mais imagens'}).click();
 await page.getByRole('button',{name:'Ver imagem recuperada 51',exact:true}).waitFor();
 user='bob';await page.getByRole('button',{name:'Trocar conta',exact:true}).click();
 await page.getByRole('button',{name:'Ver imagem recuperada 1',exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Ver imagem recuperada 51',exact:true}).count(),0);
 assert.equal(await preview.count(),0);assert.ok(calls.every(call=>call.version==='1'));
 blockAlice=true;aliceGate=new Promise(resolve=>{releaseAlice=resolve;});
 user='alice';await page.getByRole('button',{name:'Trocar conta',exact:true}).click();await aliceEntered;
 user='bob';await page.getByRole('button',{name:'Trocar conta',exact:true}).click();releaseAlice();
 await page.getByRole('button',{name:'Ver imagem recuperada 1',exact:true}).waitFor();
 await aliceDelivered;await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 assert.equal(await page.getByRole('button',{name:'Ver imagem recuperada 50',exact:true}).count(),0);
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
});

test('consulta somente a versão aberta e descarta a prévia anterior',{skip:!existsSync(browserPath),timeout:90000},async t=>{
 const {page,origin,errors,external}=await fixture(t,{initialVersion:2});const calls=[];
 // Recovery remains usable even if unrelated attempt markers cannot be read.
 await page.addInitScript(()=>{const original=Storage.prototype.getItem;Storage.prototype.getItem=function(key){if(key.startsWith('compor-agent-attempt:'))throw Error('storage indisponível');return original.call(this,key);};});
 await page.route('**/api/image-assets**',route=>{const version=new URL(route.request().url()).searchParams.get('version');calls.push(version);return route.fulfill({json:{assets:[{assetId:id(Number(version)),origin:'unknown'}],nextCursor:null}});});
 await page.route('**/api/images?**',route=>route.fulfill({contentType:'image/png',body:png}));
 await page.goto(origin);await page.getByRole('button',{name:'Ver imagem recuperada 1',exact:true}).click();
 const preview=page.getByRole('img',{name:'Imagem recuperada para revisão'});await preview.waitFor();
 await page.getByRole('button',{name:'Trocar versão',exact:true}).click();
 await page.getByRole('button',{name:'Ver imagem recuperada 1',exact:true}).waitFor();
 assert.equal(await preview.count(),0);assert.deepEqual(calls,['2','1']);
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
});

test('PNG válido acima de 4,5 MB é recomposto no navegador e pode ser usado',{skip:!existsSync(browserPath),timeout:90000},async t=>{
 const image=largeValidPng();assert.ok(image.length>4_500_000&&image.length<8*1024*1024);
 const digest=createHash('sha256').update(image).digest('hex'),partBytes=2*1024*1024,parts=Math.ceil(image.length/partBytes),requests=[];
 const {page,origin,errors,external}=await fixture(t);
 await page.route('**/api/image-assets**',route=>route.fulfill({json:{assets:[{assetId:id(1),origin:'unknown'}],nextCursor:null}}));
 await page.route('**/api/images?**',route=>{const part=new URL(route.request().url()).searchParams.get('part');requests.push(part);if(part===null)return route.fulfill({status:413,headers:{'x-compor-chunked':'1'}});const index=Number(part);return route.fulfill({body:image.subarray(index*partBytes,Math.min((index+1)*partBytes,image.length)),headers:{'content-type':'application/octet-stream','x-compor-part':part,'x-compor-parts':String(parts),'x-compor-size':String(image.length),'x-compor-sha256':digest}});});
 await page.goto(origin);await page.getByRole('button',{name:'Ver imagem recuperada 1',exact:true}).click();
 await page.getByRole('img',{name:'Imagem recuperada para revisão'}).waitFor();
 await page.waitForFunction(()=>document.querySelector('img[alt="Imagem recuperada para revisão"]')?.naturalWidth===1152);
 assert.deepEqual(requests,[null,...Array.from({length:parts},(_,index)=>String(index))]);
 await page.getByRole('button',{name:'Usar imagem na composição',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('[data-testid="used"]').textContent.length>0);
 assert.deepEqual(JSON.parse(await page.getByTestId('used').innerText()),{size:image.length,hash:digest,pieceId:piece,version:1});
 await page.getByRole('button',{name:'Gerar prévia PNG',exact:true}).click();
 await page.getByRole('img',{name:'Prévia da peça'}).waitFor();
 await page.waitForFunction(()=>document.querySelector('[data-testid="preview-hash"]').textContent.length>0);
 assert.equal(await page.getByTestId('preview-hash').innerText(),digest,'compor o PNG preserva os bytes recuperados');
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
});
