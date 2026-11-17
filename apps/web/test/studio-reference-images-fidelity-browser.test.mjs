import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {chromium} from 'playwright-core';
const browserPath=process.env.BROWSER_EXECUTABLE_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

test('chat conserva PNG pequeno e reduz imagem maior sem alterar os originais',{skip:!existsSync(browserPath)},async t=>{
 const bundled=await build({stdin:{contents:"import {referenceImagesForRequest} from './lib/studio-reference-images.ts';globalThis.prepare=referenceImagesForRequest;",loader:'js',resolveDir:fileURLToPath(new URL('../',import.meta.url))},bundle:true,write:false,platform:'browser',format:'esm'});
 const server=createServer((req,res)=>{if(req.url==='/fixture.js'){res.setHeader('content-type','text/javascript');res.end(bundled.outputFiles[0].text);}else res.end('<!doctype html><script type="module" src="/fixture.js"></script>');});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve));});
 const browser=await chromium.launch({executablePath:browserPath,headless:true});t.after(()=>browser.close());const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);await page.waitForFunction(()=>typeof window.prepare==='function');
 const result=await page.evaluate(async()=>{
  const make=async width=>{const canvas=document.createElement('canvas');canvas.width=width;canvas.height=width;const c=canvas.getContext('2d');c.fillStyle='rgba(230,40,10,.5)';c.fillRect(0,0,width/2,width/2);return new Promise(resolve=>canvas.toBlob(resolve,'image/png'));};
  const small=await make(64),large=await make(1024),id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
  const before=Array.from(new Uint8Array(await small.arrayBuffer())),loaded=new Map([[id(1),{file:small}],[id(2),{file:large}]]);
  const images=await window.prepare([{id:id(1)},{id:id(2)}],async value=>loaded.get(value));
  const sent=Uint8Array.from(atob(images[0].data),v=>v.charCodeAt(0)),after=Array.from(new Uint8Array(await small.arrayBuffer()));
  const bigBlob=await fetch(`data:${images[1].mime};base64,${images[1].data}`).then(v=>v.blob()),decoded=await createImageBitmap(bigBlob);
  let missing=false;try{await window.prepare([{id:id(3)}],async()=>null);}catch{missing=true;}
  const output={firstMime:images[0].mime,identical:JSON.stringify(Array.from(sent))===JSON.stringify(before),unchanged:JSON.stringify(after)===JSON.stringify(before),secondMime:images[1].mime,width:decoded.width,height:decoded.height,missing};decoded.close();return output;
 });
 assert.deepEqual(result,{firstMime:'image/png',identical:true,unchanged:true,secondMime:'image/jpeg',width:512,height:512,missing:true});
});
