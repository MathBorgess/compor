import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {chromium} from 'playwright-core';
const browserPath=process.env.BROWSER_EXECUTABLE_PATH;
const user='00000000-0000-4000-8000-000000000001',project='00000000-0000-4000-8000-000000000003';
const pin=(id,title)=>({id,title,board:'behance/typography',originUrl:`https://www.pinterest.com/pin/${id}/`,previewUrl:`https://i.pinimg.com/236x/${id}.png`});
const pixels=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC','base64');
const source=`
import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import ReferenceExploration from './studio/reference-exploration.tsx';
import {syncReferenceConsentAccount} from './lib/reference-session-consent.ts';
import {useExplorationLoop} from './studio/use-exploration-loop.ts';
import {createStudioState} from './lib/studio-state.ts';
function FirstBatch(){const [connected,setConnected]=useState(false),[enabled,setEnabled]=useState(true),[state]=useState(()=>createStudioState({userId:'${user}',projectId:'${project}'}));const loop=useExplorationLoop({userId:'${user}',projectId:'${project}',state,getState:()=>state,hasApiKey:connected,getApiKey:()=>connected?'sk-synthetic-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx':'',isAuthenticated:()=>true,enabled,idea:'Uma oficina nova, ainda sem briefing'});return <><button onClick={()=>setConnected(true)}>Conectar chave de teste</button><button onClick={()=>setEnabled(false)}>Sair das referências</button><output id="exploration-status">{loop.status}</output></>;}
function Demo(){const [userId,setUser]=useState('${user}'),[projectId,setProject]=useState('${project}'),[epoch,setEpoch]=useState(0),[selected,setSelected]=useState([]),[used,setUsed]=useState([]);return <><button onClick={()=>setProject('00000000-0000-4000-8000-000000000004')}>Outro projeto</button><button onClick={()=>setUser('00000000-0000-4000-8000-000000000002')}>Outra conta</button><button onClick={()=>setUser('${user}')}>Conta inicial</button><button onClick={()=>{syncReferenceConsentAccount(sessionStorage,null);setEpoch(x=>x+1);}}>Sair e entrar</button><FirstBatch/><output id="used">{JSON.stringify(used)}</output><ReferenceExploration key={userId+projectId+epoch} userId={userId} projectId={projectId} idea="Quero divulgar uma aula de cerâmica" selectedOrigins={selected} onContinue={()=>setEpoch(x=>x+1)} onUseReference={async(reference,file)=>{setSelected(items=>[...items,reference.originUrl]);setUsed(items=>[...items,{userId,projectId,id:reference.id,size:file.size}]);}}/></>};createRoot(document.getElementById('root')).render(<Demo/>);`;
async function fixture(t,{holdFirst=false}={}) {
  const result=await build({stdin:{contents:source,loader:'jsx',resolveDir:fileURLToPath(new URL('../',import.meta.url))},bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',jsx:'automatic',loader:{'.css':'empty'},define:{'process.env.NODE_ENV':'"test"'}});
  const server=createServer((req,res)=>{if(req.url==='/fixture.js'){res.setHeader('content-type','text/javascript');res.end(result.outputFiles[0].text);}else{res.setHeader('content-type','text/html');res.end('<main id="root"></main><script type="module" src="/fixture.js"></script>');}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
  const browser=await chromium.launch({executablePath:browserPath,headless:true});
  t.after(async()=>{await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
  const page=await browser.newPage();page.setDefaultTimeout(8000);
  const searches=[],previews=[],external=[],generations=[];let release;
  const gate=new Promise(resolve=>{release=resolve;});
  await page.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.pathname==='/api/studio/explorations/status')return route.fulfill({json:{status:'active'}});
    if(url.pathname.endsWith('/signals'))return route.fulfill({json:{signals:[]}});
    if(url.pathname==='/api/studio/explorations'){
      const body=request.postDataJSON();generations.push(body);return route.fulfill({json:{status:'completed',requestId:body.requestId}});
    }
    if(url.hostname==='i.pinimg.com'){external.push(url.href);return route.fulfill({contentType:'image/png',body:pixels});}
    if(url.pathname==='/api/studio/references/history')return route.fulfill({json:{references:[{...pin('chosen','Escolhida antes'),approvedVersions:0,selectedAt:'2026-11-09T13:00:00.000Z'},{...pin('approved','Usada em post aprovado'),approvedVersions:2,selectedAt:'2026-11-09T12:00:00.000Z'}]}});
    if(url.pathname==='/api/studio/references/search'){
      searches.push(request.postDataJSON());if(holdFirst&&searches.length===1)await gate;
      try{return await route.fulfill({json:{status:'ok',references:[pin('new','Nova referência'),pin('approved','Usada em post aprovado')]}});}catch{return;}
    }
    if(url.pathname==='/api/studio/references/preview'){previews.push(request.postDataJSON());return route.fulfill({contentType:'image/png',body:pixels});}
    return route.continue();
  });
  await page.goto(origin);return {page,searches,previews,external,release,generations};
}
const options={skip:!browserPath||!existsSync(browserPath),timeout:30000};
test('busca automática avisa a pessoa, prioriza o histórico e só inclui imagens escolhidas',options,async t=>{
  const {page,searches,previews}=await fixture(t);
  await page.getByText(/busca no Pinterest e o carregamento de prévias são permitidos automaticamente/).waitFor();
  assert.equal(await page.getByRole('button',{name:'Permitir nesta sessão'}).count(),0);
  await page.getByRole('heading',{name:'Usadas em posts que você aprovou'}).waitFor();
  await page.getByRole('checkbox',{name:'Escolher referência: Nova referência'}).waitFor();
  assert.equal(searches.length,1);assert.equal(searches[0].query,'Quero divulgar uma aula de cerâmica');assert.equal(await page.getByLabel('O que você quer explorar?').inputValue(),'');
  assert.deepEqual(await page.locator('.reference-results h3').allTextContents(),['Usada em post aprovado','Escolhida antes','Nova referência']);
  assert.deepEqual(JSON.parse(await page.locator('#used').textContent()),[],'prévia não escolhe pela pessoa');
  await page.getByRole('checkbox',{name:'Escolher referência: Nova referência'}).click();await page.getByRole('checkbox',{name:'Escolher referência: Nova referência',checked:true}).waitFor();
  assert.equal(previews.length,1);assert.equal(JSON.parse(await page.locator('#used').textContent()).length,1);
});
test('busca reinicia no novo escopo após troca de projeto, conta e sessão',options,async t=>{
  const {page,searches}=await fixture(t);
  const result=page.getByRole('checkbox',{name:'Escolher referência: Nova referência'});
  await result.waitFor();
  for(const [name,count] of [['Outro projeto',2],['Outra conta',3],['Conta inicial',4],['Sair e entrar',5]]){
    await page.getByRole('button',{name,exact:true}).click();
    await result.waitFor();
    await assertEventually(()=>searches.length===count);
  }
  assert.equal(await page.getByRole('button',{name:'Permitir nesta sessão'}).count(),0);
});
async function assertEventually(predicate){const until=Date.now()+5000;while(!predicate()){if(Date.now()>until)throw Error('busca esperada não observada');await new Promise(resolve=>setTimeout(resolve,25));}}
test('digitar durante sugestão pendente não prende a busca manual',options,async t=>{
  const {page,searches,release}=await fixture(t,{holdFirst:true});
  await page.getByRole('status').filter({hasText:'Buscando referências'}).waitFor();
  await page.getByLabel('O que você quer explorar?').fill('gravura');await page.getByRole('button',{name:'Buscar referências',exact:true}).click();
  await page.getByRole('checkbox',{name:'Escolher referência: Nova referência'}).waitFor();assert.equal(searches.length,2);assert.equal(searches[1].query,'gravura');release();
});
test('primeiro lote começa somente com ideia e chave e conserva três imagens e espera visível',options,async t=>{
  const {page,generations}=await fixture(t);
  assert.equal(generations.length,0);
  await page.getByRole('button',{name:'Conectar chave de teste'}).click();
  await page.locator('#exploration-status').filter({hasText:/Próximo lote em/}).waitFor();
  assert.equal(generations.length,3);assert.deepEqual(generations.map(item=>item.batch.position),[1,2,3]);
  assert.equal(new Set(generations.map(item=>item.batch.id)).size,1);
  assert.ok(generations.every(item=>item.prompt.includes('"ideia":"Uma oficina nova, ainda sem briefing"')&&item.prompt.includes('"oferta":""')));
  await page.getByRole('button',{name:'Sair das referências'}).click();
  await page.locator('#exploration-status').filter({hasText:'Exploração disponível na tela de referências.'}).waitFor();
  assert.equal(generations.length,3);
});
