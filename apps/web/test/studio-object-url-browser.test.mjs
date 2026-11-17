import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {createServer} from 'node:http';
import {build} from 'esbuild';
import {chromium} from 'playwright-core';
const browserPath=process.env.BROWSER_EXECUTABLE_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

test('URL segue válida em StrictMode, troca de imagem e é liberada ao desmontar',{skip:!existsSync(browserPath)},async t=>{
 const bundled=await build({stdin:{resolveDir:process.cwd(),sourcefile:'object-url-fixture.tsx',loader:'tsx',contents:`
  import React,{StrictMode,Activity,useState} from 'react';import {createRoot} from 'react-dom/client';import {useObjectUrl} from './app/use-object-url.ts';
  const create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL);window.live=new Set();window.activeRevokes=[];window.created=[];
  URL.createObjectURL=value=>{const url=create(value);window.live.add(url);window.created.push(url);return url;};
  URL.revokeObjectURL=url=>{if([...document.images].some(image=>image.src===url))window.activeRevokes.push(url);window.live.delete(url);revoke(url);};
  const data=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4AWJiYGBgAAAAAP//XRcpzQAAAAZJREFUAwAADwADJDd96QAAAABJRU5ErkJggg=='),c=>c.charCodeAt(0)),first=new Blob([data],{type:'image/png'}),second=new Blob([data],{type:'image/png'});
  function Screen(){const [blob,setBlob]=useState(first),url=useObjectUrl(blob);return <><button onClick={()=>setBlob(second)}>Trocar</button><button onClick={()=>setBlob(null)}>Limpar</button><button onClick={()=>setBlob(first)}>Restaurar</button>{url&&<img src={url} alt="Imagem"/>}</>;}
  function App(){const [mode,setMode]=useState('visible');return <><button onClick={()=>setMode('hidden')}>Ocultar</button><button onClick={()=>setMode('visible')}>Exibir</button><Activity mode={mode}><Screen/></Activity></>;}
  window.root=createRoot(document.getElementById('root'));window.root.render(<StrictMode><App/></StrictMode>);
 `},bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',define:{'process.env.NODE_ENV':'"development"'}});
 const server=createServer((request,response)=>{if(request.url==='/fixture.js'){response.setHeader('Content-Type','text/javascript');response.end(bundled.outputFiles[0].text);}else response.end('<!doctype html><div id="root"></div><script type="module" src="/fixture.js"></script>');});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve));});
 const browser=await chromium.launch({executablePath:browserPath,headless:true});t.after(()=>browser.close());const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
 const image=page.getByRole('img',{name:'Imagem'});await image.waitFor();const original=await image.getAttribute('src');await page.getByRole('button',{name:'Ocultar'}).click();await image.waitFor({state:'hidden'});await page.waitForTimeout(100);assert.equal(await page.evaluate(url=>window.live.has(url),original),true,'efeitos suspensos preservam URL ainda presente no DOM');await page.getByRole('button',{name:'Exibir'}).click();await image.waitFor();const resumed=await image.getAttribute('src');await page.getByRole('button',{name:'Trocar'}).click();await page.waitForFunction(old=>document.querySelector('img')?.src!==old,resumed);await page.waitForFunction(old=>!window.live.has(old),resumed);
 assert.deepEqual(await page.evaluate(()=>window.activeRevokes),[],'nenhum URL ainda renderizado foi revogado');await page.getByRole('button',{name:'Limpar'}).click();await image.waitFor({state:'detached'});await page.waitForFunction(()=>window.live.size===0);await page.getByRole('button',{name:'Restaurar'}).click();await image.waitFor();await page.evaluate(()=>window.root.unmount());await page.waitForFunction(()=>window.live.size===0);
 const result=await page.evaluate(()=>({created:window.created.length,activeRevokes:window.activeRevokes}));assert(result.created>=2);assert.deepEqual(result.activeRevokes,[]);
});
