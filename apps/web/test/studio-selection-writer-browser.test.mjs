import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {chromium} from 'playwright-core';

const browserPath=process.env.BROWSER_EXECUTABLE_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
test('seleção coordenada preserva edição durante confirmação remota e writer segue em CAS',{skip:!existsSync(browserPath),timeout:20000},async t=>{
 const source=`
 import {useEffect,useRef} from 'react';import {createRoot} from 'react-dom/client';import {useStudioState} from './app/use-studio-state.ts';
 import {updateBrief} from './lib/studio-state.ts';import {referenceSelectionPublic} from './lib/reference-selection-projection.ts';import {createReferenceSelectionCoordinator} from './lib/reference-selection-coordinator.ts';
 const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),scope={userId:id(1),projectId:id(2)};
 let remote={status:'ready',revision:0,state:{version:1,references:[],projectReferenceIds:[],posts:[]}},receipt=null;
 window.fetch=async(path,options)=>{const body=JSON.parse(options.body);if(!path.endsWith('/selection'))throw Error('unexpected');
  if(body.op==='read')return Response.json(remote);if(body.op==='receipt')return Response.json(receipt??{status:'absent'});
  if(body.op==='write'){window.sent=true;window.writeBody=body;await new Promise(resolve=>window.release=resolve);remote={status:'ready',revision:1,state:await referenceSelectionPublic(body.state)};receipt={status:'applied',commandId:body.commandId,revision:1};return Response.json(receipt);}throw Error('unexpected');};
 function Fixture(){const session=useStudioState(scope),ref=useRef(session);ref.current=session;
  useEffect(()=>{if(session.loading)return;window.start=async()=>{const s=ref.current;await s.ensureStored();const c=createReferenceSelectionCoordinator({store:s.storage.current});window.initial=await c.observe(scope);const canvas=document.createElement('canvas');canvas.width=2;canvas.height=2;const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));const file=new File([blob],'local.png',{type:'image/png'}),metadata=await s.storage.current.putReference({...scope,id:id(3),file,source:{kind:'local-upload'}});window.pending=s.coordinateReference({kind:'select',reference:metadata,target:'references'},()=>true);};
  window.edit=async()=>{const s=ref.current;s.change(value=>updateBrief(value,{offer:'edição preservada'}));await s.flush();};window.read=async()=>ref.current.storage.current.load(scope);window.now=()=>ref.current.get();window.ready=true;},[session.loading]);return <p>{session.error}</p>;}
 createRoot(document.getElementById('root')).render(<Fixture/>);`;
 const bundle=await build({stdin:{contents:source,loader:'jsx',resolveDir:fileURLToPath(new URL('../',import.meta.url))},bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',jsx:'automatic',define:{'process.env.NODE_ENV':'"test"'}});
 const server=createServer((request,response)=>{if(request.url==='/fixture.js'){response.setHeader('content-type','text/javascript');response.end(bundle.outputFiles[0].text);}else response.end('<!doctype html><div id="root"></div><script type="module" src="/fixture.js"></script>');});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve));});
 const browser=await chromium.launch({executablePath:browserPath,headless:true});t.after(()=>browser.close());const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);await page.waitForFunction(()=>window.ready);
 await page.evaluate(()=>window.start());await page.waitForFunction(()=>window.sent);await page.evaluate(()=>window.edit());
 const during=await page.evaluate(()=>window.read());assert.equal(during.brief.offer,'edição preservada');assert.equal(during.projectReferenceIds.length,1);
 await page.evaluate(()=>window.release());assert.equal((await page.evaluate(()=>window.pending)).status,'ready');
 const after=await page.evaluate(()=>window.read());assert.equal(after.brief.offer,'edição preservada');assert.deepEqual(after.projectReferenceIds,during.projectReferenceIds);
});
