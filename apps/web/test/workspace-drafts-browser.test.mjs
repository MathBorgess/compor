import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {chromium} from 'playwright-core';
import {sessionCookie} from './session-cookie.mjs';
import {stopApp,waitForApp} from './wait-for-app.mjs';

const alice='00000000-0000-4000-8000-000000000001',bob='00000000-0000-4000-8000-000000000002';

test('o estúdio conserva rascunhos herdados por conta e recupera uma reivindicação em conflito',async t=>{
  const socket=createServer();await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));
  const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));
  const origin=`http://127.0.0.1:${port}`;
  let startup='';
  // A stale deployment setting must no longer select the removed interface.
  const child=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','-p',String(port),'-H','127.0.0.1'],{stdio:['ignore','pipe','pipe'],env:{...process.env,COMPOR_STUDIO_WEB_ENABLED:'false',SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test',APP_ORIGIN:origin}});
  for(const stream of [child.stdout,child.stderr])stream.on('data',value=>{startup=(startup+value.toString()).slice(-6000);});
  let browser;
  t.after(async()=>{try{await browser?.close();}finally{await stopApp(child);}});
  await waitForApp({url:origin,child,signal:t.signal,diagnostics:()=>startup});
  browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE_PATH,headless:true});
  const context=await browser.newContext();await context.addCookies([sessionCookie(origin)]);
  const page=await context.newPage();page.setDefaultTimeout(15000);
  let identity=alice,writes=0;
  await page.route('**/auth/session',route=>route.fulfill({json:{state:'connected',userId:identity}}));
  await page.route('**/api/projects',route=>{
    if(route.request().method()==='POST'){
      writes++;
      return route.fulfill({status:502,json:{error:'result_unknown',retryAutomatically:false}});
    }
    return route.fulfill({json:{projects:[]}});
  });
  await page.addInitScript(({alice,bob})=>{
    if(sessionStorage.getItem('draft-migration-fixture'))return;
    sessionStorage.setItem('draft-migration-fixture','1');
    sessionStorage.setItem('compor-has-authenticated','1');
    sessionStorage.setItem(`compor-objective:user:${alice}`,'Ideia já guardada de Alice');
    sessionStorage.setItem(`compor-objective:user:${bob}`,'Ideia só de Bob');
    sessionStorage.setItem('compor-objective:anonymous','Rascunho anterior sem conta');
    sessionStorage.setItem('compor-claim-pending','anonymous');
  },{alice,bob});
  await page.goto(origin,{timeout:60000});
  const idea=page.getByLabel('Sua ideia',{exact:true});await idea.waitFor();
  assert.equal(await idea.inputValue(),'Ideia já guardada de Alice');
  await page.getByRole('button',{name:'Recuperar rascunho anterior',exact:true}).waitFor();
  assert.equal(await page.evaluate(user=>sessionStorage.getItem(`compor-objective:pending:${user}`),alice),'Rascunho anterior sem conta');
  identity=bob;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await page.waitForFunction(()=>document.querySelector('#studio-project-name')?.value==='Ideia só de Bob');
  assert.equal(await page.getByRole('button',{name:'Recuperar rascunho anterior',exact:true}).count(),0);
  identity=alice;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await page.getByRole('button',{name:'Recuperar rascunho anterior',exact:true}).click();
  assert.equal(await page.evaluate(user=>sessionStorage.getItem(`compor-objective:user:${user}`),alice),'Rascunho anterior sem conta');
  assert.equal(await page.evaluate(user=>sessionStorage.getItem(`compor-objective:pending:${user}`),alice),null);
  const archives=await page.evaluate(user=>Object.keys(sessionStorage).filter(key=>key.startsWith(`compor-objective:user:${user}:archive:`)).map(key=>sessionStorage.getItem(key)),alice);
  assert.deepEqual(archives,['Ideia já guardada de Alice']);
  await page.reload();await idea.waitFor();
  assert.equal(await idea.inputValue(),'Rascunho anterior sem conta');
  await page.getByRole('button',{name:'Criar projeto e continuar',exact:true}).click();
  await page.getByText('A criação pode ter acontecido. Atualize a lista antes de criar outro projeto.',{exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Criar projeto e continuar',exact:true}).isDisabled(),true);
  await page.getByRole('button',{name:'Atualizar projetos',exact:true}).click();
  await page.getByRole('button',{name:'Entendi, iniciar outra criação',exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Criar projeto e continuar',exact:true}).isDisabled(),true);
  assert.equal(writes,1,'consultar a lista não repete uma criação com resultado desconhecido');
});
