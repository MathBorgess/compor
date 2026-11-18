import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright-core';

const browserPath=process.env.BROWSER_EXECUTABLE_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
test('menu de conta mostra identidade e uma única opção de saída', {skip:!existsSync(browserPath),timeout:30000}, async t=>{
  const source=`import React,{useState} from 'react';
    import {createRoot} from 'react-dom/client';
    import AccountMenu from './account-menu.tsx';
    function Fixture(){const [signedOut,setSignedOut]=useState(false);return signedOut?<p>Saída concluída</p>:<><AccountMenu label="Alice Silva" onSignOut={()=>setSignedOut(true)}/><AccountMenu label="Conta local" local onSignOut={()=>{}}/></>};
    createRoot(document.getElementById('app')).render(<Fixture/>);`;
  const bundle=await build({stdin:{contents:source,resolveDir:resolve('studio'),loader:'tsx'},bundle:true,write:false,format:'iife',platform:'browser',loader:{'.css':'empty'}});
  const server=createServer((request,response)=>{
    if(request.url==='/app.js'){response.writeHead(200,{'content-type':'application/javascript'});response.end(bundle.outputFiles[0].contents);return;}
    response.writeHead(200,{'content-type':'text/html'});response.end('<div id="app"></div><script src="/app.js"></script>');
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({executablePath:browserPath,headless:true});
  t.after(async()=>{await browser.close();await new Promise(resolve=>server.close(resolve));});
  const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.getByText('Alice Silva').click();
  const personal=page.locator('details').filter({hasText:'Alice Silva'});
  assert.equal(await personal.getByRole('button').count(),1);
  assert.equal(await personal.getByRole('button',{name:'Sair',exact:true}).isVisible(),true);
  await page.getByText('Conta local',{exact:true}).click();
  await page.getByText('Ao sair desta conta local anônima, seus projetos locais não poderão ser retomados por esta conta na interface.').waitFor();
  await personal.getByRole('button',{name:'Sair',exact:true}).click();
  await page.getByText('Saída concluída').waitFor();
});
