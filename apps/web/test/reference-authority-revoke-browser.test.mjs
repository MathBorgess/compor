import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {chromium} from 'playwright-core';

const browserPath=process.env.BROWSER_EXECUTABLE_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
test('retirar permissão bloqueia a capacidade antes da resposta e consulta o mesmo consentimento perdido',{skip:!existsSync(browserPath),timeout:20000},async t=>{
 const source=`import {useState} from 'react';import {createRoot} from 'react-dom/client';
 import ReferenceExploration from './app/reference-exploration.tsx';
 import {readReferenceAuthorityConsent} from './lib/reference-authority-consent.ts';
 const user='00000000-0000-4000-8000-000000000001';window.calls=[];window.serverState='active';window.finishRevoke=null;window.readConsent=()=>readReferenceAuthorityConsent(user);
 window.fetch=async(path,options)=>{const body=JSON.parse(options.body);if(path.endsWith('/history'))return Response.json({references:[]});if(!path.endsWith('/consent'))throw Error('unexpected');window.calls.push(body);if(body.op==='grant')return Response.json({status:'granted',consentId:body.consentId,capability:'A'.repeat(43)});if(body.op==='state')return Response.json({state:window.serverState,consentId:body.consentId});if(body.op==='revoke')return new Promise(resolve=>{window.finishRevoke=()=>resolve(Response.json({status:'unknown'},{status:503}));});throw Error('unexpected');};
 sessionStorage.setItem('compor-reference-session-consent',JSON.stringify({userId:user,granted:true}));
 function App(){const[visible,setVisible]=useState(true),[required,setRequired]=useState(true);return <><button onClick={()=>setVisible(value=>!value)}>Alternar painel</button><button onClick={()=>setRequired(value=>!value)}>Alternar capacidade</button>{visible&&<ReferenceExploration userId={user} projectId="00000000-0000-4000-8000-000000000002" idea="" selectedOrigins={[]} authorityConsentRequired={required} onUseReference={async()=>{}}/>}</>;}
 createRoot(document.getElementById('root')).render(<App/>);`;
 const built=await build({stdin:{contents:source,loader:'jsx',resolveDir:fileURLToPath(new URL('../',import.meta.url))},bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',jsx:'automatic',loader:{'.css':'empty'},define:{'process.env.NODE_ENV':'"test"'}});
 const server=createServer((request,response)=>{response.setHeader('content-type',request.url==='/fixture.js'?'text/javascript':'text/html');response.end(request.url==='/fixture.js'?built.outputFiles[0].text:'<!doctype html><div id="root"></div><script type="module" src="/fixture.js"></script>');});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve));});
 const browser=await chromium.launch({executablePath:browserPath,headless:true});t.after(()=>browser.close());const page=await browser.newPage();page.setDefaultTimeout(2500);const errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto(`http://127.0.0.1:${server.address().port}`);
 await page.getByRole('button',{name:'Permitir uso na geração',exact:true}).click();await page.getByText('Referências externas escolhidas podem orientar a geração nesta página.').waitFor();
 const consentId=await page.evaluate(()=>window.readConsent().consentId);
 await page.getByRole('button',{name:'Alternar capacidade',exact:true}).click();
 await page.getByRole('button',{name:'Retirar permissão de geração',exact:true}).click();
 assert.equal(await page.evaluate(()=>window.readConsent()),null,'capacidade já está bloqueada antes do retorno do servidor');
 assert.equal(await page.getByRole('button',{name:'Permitir uso na geração',exact:true}).count(),0);
 await page.waitForFunction(()=>window.finishRevoke!==null);await page.evaluate(()=>window.finishRevoke());await page.getByRole('button',{name:'Consultar retirada',exact:true}).waitFor();
 await page.getByRole('button',{name:'Alternar painel',exact:true}).click();await page.getByRole('button',{name:'Alternar painel',exact:true}).click();
 await page.getByRole('button',{name:'Consultar retirada',exact:true}).click();await page.getByText(/permissão ainda está ativa no servidor/).waitFor();
 assert.equal(await page.evaluate(()=>window.readConsent()),null,'consulta active não restaura capacidade');
 await page.getByRole('button',{name:'Tentar retirar novamente',exact:true}).click();await page.waitForFunction(()=>window.calls.filter(call=>call.op==='revoke').length===2);
 await page.evaluate(()=>{window.serverState='revoked';window.finishRevoke();});await page.getByRole('button',{name:'Consultar retirada',exact:true}).click();await page.getByText(/Permissão de uso na geração retirada/).waitFor();
 await page.getByRole('button',{name:'Alternar capacidade',exact:true}).click();await page.getByRole('button',{name:'Permitir uso na geração',exact:true}).waitFor();
 const calls=await page.evaluate(()=>window.calls);assert.deepEqual(calls.map(call=>call.op),['grant','revoke','state','revoke','state']);assert.ok(calls.every(call=>call.consentId===consentId));
 assert.equal(await page.evaluate(()=>(JSON.stringify(localStorage)+JSON.stringify(sessionStorage)).includes('A'.repeat(43))),false);assert.deepEqual(errors,[]);
});
