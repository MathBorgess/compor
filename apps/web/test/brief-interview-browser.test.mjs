import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {chromium} from 'playwright-core';
import {stopApp, waitForApp} from './wait-for-app.mjs';

const browserPath = process.env.BROWSER_EXECUTABLE_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const userId = '00000000-0000-4000-8000-000000000001';
const projectId = '00000000-0000-4000-8000-000000000003';
const storageKey = `compor-brief-interview:${userId}:${projectId}`;

async function app(t) {
  const socket = createServer();
  await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  const origin = `http://127.0.0.1:${port}`;
  let startup = '';
  const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '-p', String(port), '-H', '127.0.0.1'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {...process.env, SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', APP_ORIGIN: origin, COMPOR_STUDIO_WEB_ENABLED: 'true'},
  });
  for (const stream of [child.stdout, child.stderr]) stream.on('data', value => { startup = (startup + value.toString()).slice(-6000); });
  let browser;
  t.after(async () => { try { await browser?.close(); } finally { await stopApp(child); } });
  await waitForApp({url: origin, child, signal: t.signal, diagnostics: () => startup});
  browser = await chromium.launch({executablePath: browserPath, headless: true});
  const page = await browser.newPage({viewport: {width: 1440, height: 1000}});
  page.setDefaultTimeout(6000);
  const errors = [], calls = [], external = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin) { external.push(url.origin); return route.abort(); }
    if (url.pathname === '/auth/session') return route.fulfill({json: {state: 'connected', userId}});
    if (url.pathname === '/api/projects') return route.fulfill({json: {projects: [{id: projectId, title: 'Direção opcional'}]}});
    if (url.pathname === '/api/pieces' && request.method() === 'GET') return route.fulfill({json: {versions: []}});
    if (url.pathname === '/api/studio/decision') {
      calls.push({path: url.pathname, body: request.postDataJSON()});
      return route.fulfill({json: {referenceSummary: {
        mode: 'deterministic_mock', sourceCatalog: 'compor_phoenix_static', label: 'Sugestões ilustrativas do catálogo',
        references: [{id: 'catalog-example', board: 'Composição editorial', description: 'Contraste entre título e espaço vazio.', originKind: 'synthetic'}],
      }}});
    }
    if (url.pathname.startsWith('/api/')) {
      calls.push({path: url.pathname});
      return route.fulfill({status: 500, json: {error: 'unexpected_test_operation'}});
    }
    return route.continue();
  });
  return {page, origin, calls, errors, external};
}

async function openProject(page, origin) {
  await page.goto(origin);
  await page.getByRole('button', {name: /Direção opcional/}).click();
  await page.getByLabel('Sua mensagem', {exact: true}).waitFor();
}

test('guia é opcional, reaproveita fatos e volta à conversa sem perder o rascunho ou gerar arte', {skip: !existsSync(browserPath), timeout: 90000}, async t => {
  const {page, origin, calls, errors, external} = await app(t);
  await openProject(page, origin);
  assert.equal(await page.getByLabel('Entrevista do brief', {exact: true}).count(), 0, 'a conversa abre sem questionário obrigatório');
  assert.equal(await page.getByRole('button', {name: 'Explorar direção', exact: true}).isVisible(), true);
  assert.equal(calls.length, 0, 'abrir o projeto não dispara motor nem exploração');
  await page.screenshot({path: '/tmp/compor-studio-visual-initial.png', fullPage: true});

  await page.getByRole('button', {name: 'Marca', exact: true}).click();
  await page.getByLabel('Quem você quer alcançar?', {exact: true}).fill('Professoras que preparam aulas à noite.');
  await page.getByRole('button', {name: 'Continuar com o que sei', exact: true}).click();
  const draft = 'Quero uma imagem serena, com espaço para respirar.';
  await page.getByLabel('Sua mensagem', {exact: true}).fill(draft);
  await page.getByRole('button', {name: 'Explorar direção', exact: true}).click();
  await page.getByLabel('Entrevista do brief', {exact: true}).waitFor();
  await page.getByRole('heading', {name: 'O que você quer divulgar?', exact: true}).waitFor();
  await page.getByText('Fonte: catálogo de sugestões · Composição editorial', {exact: true}).first().waitFor();
  assert.equal(await page.getByText('exploração · esboço ilustrativo', {exact: true}).count(), 3);
  assert.equal(await page.getByRole('button', {name: 'Baixar', exact: true}).isDisabled(), true, 'esboços não viram arte exportável');
  await page.screenshot({path: '/tmp/compor-studio-visual-guide.png', fullPage: true});

  await page.getByRole('button', {name: 'Escolher Aula curta', exact: true}).click();
  await page.getByRole('heading', {name: 'Depois de ver o post, o que a pessoa deve fazer?', exact: true}).waitFor();
  assert.equal(await page.getByRole('heading', {name: 'Para quem é essa oferta?', exact: true}).count(), 0, 'persona já informada não é perguntada novamente');
  const summary = page.getByRole('region', {name: 'Brief', exact: true});
  await summary.getByText('Professoras que preparam aulas à noite.', {exact: false}).waitFor();
  await summary.getByText('Opções descartadas', {exact: true}).click();
  assert.equal(await summary.getByText('Mentoria', {exact: true}).isVisible(), true);
  assert.equal(await summary.getByText('Material prático', {exact: true}).isVisible(), true);
  await page.getByRole('button', {name: 'Voltar à conversa', exact: true}).click();
  await page.getByLabel('Sua mensagem', {exact: true}).waitFor();
  assert.equal(await page.getByLabel('Entrevista do brief', {exact: true}).count(), 0);
  assert.equal(await page.getByLabel('Sua mensagem', {exact: true}).inputValue(), draft, 'trocar para o guia preserva a mensagem não enviada');
  assert.ok(calls.every(call => ['produto', 'objetivo'].includes(call.body.decision)), 'persona conhecida não exige outra exploração');

  await page.getByRole('button', {name: 'Marca', exact: true}).click();
  await page.getByLabel('Quem você quer alcançar?', {exact: true}).fill('');
  await page.getByRole('button', {name: 'Continuar com o que sei', exact: true}).click();
  await page.getByRole('button', {name: 'Explorar direção', exact: true}).click();
  await page.getByRole('heading', {name: 'Para quem é essa oferta?', exact: true}).waitFor();
  assert.equal(await summary.getByText('Professoras que preparam aulas à noite.', {exact: false}).count(), 0, 'apagar um fato prevalece sobre o registro anterior do guia');
  await page.getByRole('button', {name: 'Escolher Pessoas interessadas em aprender', exact: true}).click();
  await page.getByRole('heading', {name: 'Depois de ver o post, o que a pessoa deve fazer?', exact: true}).waitFor();
  await page.getByRole('button', {name: 'Voltar à conversa', exact: true}).click();
  await page.getByRole('button', {name: 'Marca', exact: true}).click();
  assert.equal(await page.getByLabel('Quem você quer alcançar?', {exact: true}).inputValue(), 'Pessoas interessadas em aprender', 'uma nova resposta não restaura o público apagado');
  await page.getByRole('button', {name: 'Continuar com o que sei', exact: true}).click();
  await page.getByRole('button', {name: 'Explorar direção', exact: true}).click();
  await page.getByRole('heading', {name: 'Depois de ver o post, o que a pessoa deve fazer?', exact: true}).waitFor();
  await page.getByRole('button', {name: 'Voltar à conversa', exact: true}).click();

  await page.evaluate(({key}) => sessionStorage.setItem(key, JSON.stringify({produto: {text: 'Registro adulterado', origin: 'informado', execute: 'unexpected'}})), {key: storageKey});
  await page.reload();
  await page.getByRole('button', {name: /Direção opcional/}).click();
  await page.getByText('O brief salvo nesta aba não pôde ser recuperado. Os dados do projeto continuam disponíveis.', {exact: true}).waitFor();
  assert.equal(await page.getByText('Registro adulterado', {exact: false}).count(), 0, 'o registro inválido inteiro é rejeitado');
  await page.getByRole('button', {name: 'Explorar direção', exact: true}).click();
  await page.getByRole('heading', {name: 'Depois de ver o post, o que a pessoa deve fazer?', exact: true}).waitFor();
  assert.ok(calls.length >= 2);
  assert.ok(calls.every(call => call.path === '/api/studio/decision'), 'nenhuma chamada de chat, imagem, persistência remota ou outro motor pago');
  assert.ok(calls.every(call => ['produto', 'persona', 'objetivo'].includes(call.body.decision)), 'o guia só explora as informações ainda ausentes');
  assert.deepEqual(external, []);
  assert.deepEqual(errors, []);
});
