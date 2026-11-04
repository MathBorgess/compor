import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { createServer as createHttpsServer } from 'node:https';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';
const browserPath = process.env.BROWSER_EXECUTABLE_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

async function exerciseConsent(t, runBrowser) {
  const dir = await mkdtemp(join(tmpdir(), 'compor-oauth-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const key = join(dir, 'key.pem'), cert = join(dir, 'cert.pem');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-keyout', key, '-out', cert, '-subj', '/CN=127.0.0.1', '-addext', 'subjectAltName=IP:127.0.0.1'], { stdio: 'ignore' });
  const actions = [];
  let hostile = false;
  let reconnectionRedirect = null;
  let detailsMode = 'normal';
  const service = createHttpsServer({ key: await readFile(key), cert: await readFile(cert) }, async (req, res) => {
    res.setHeader('content-type', 'application/json');
    res.setHeader('x-supabase-api-version', '2024-01-01');
    if (req.headers.authorization !== 'Bearer mock-access-token') { res.statusCode = 401; return res.end('{}'); }
    if (req.url === '/auth/v1/user') return res.end(JSON.stringify({ id: 'alice', aud: 'authenticated' }));
    if (req.url === '/auth/v1/oauth/authorizations/request-12345' && req.method === 'GET') {
      if (detailsMode === 'unavailable') { res.statusCode = 404; return res.end(JSON.stringify({code:'oauth_authorization_not_found',message:'synthetic sensitive error'})); }
      if (detailsMode === 'processed') { res.statusCode = 400; return res.end(JSON.stringify({code:'validation_failed',message:'synthetic sensitive error'})); }
      if (detailsMode === 'not_pending') { res.statusCode = 400; return res.end(JSON.stringify({code:'validation_failed',message:'authorization request cannot be processed'})); }
      if (detailsMode === 'provider_origin') { res.statusCode = 400; return res.end(JSON.stringify({code:'validation_failed',message:'unauthorized request origin'})); }
      if (detailsMode === 'service') { res.statusCode = 503; return res.end(JSON.stringify({message:'synthetic sensitive error'})); }
      return res.end(JSON.stringify(reconnectionRedirect ? { redirect_url: reconnectionRedirect } : { authorization_id: 'request-12345', user: { id: detailsMode === 'mismatch' ? 'bob' : 'alice', email: 'a@example.test' }, client: { name: '<script>hostile</script>' }, redirect_uri: 'http://localhost:4545/callback', scope: 'openid email' }));
    }
    if (req.url === '/auth/v1/oauth/authorizations/request-12345/consent' && req.method === 'POST') {
      let body = ''; for await (const chunk of req) body += chunk;
      actions.push(JSON.parse(body).action);
      return res.end(JSON.stringify({ redirect_url: hostile === 'userinfo' ? 'http://attacker@localhost:4545/callback?code=secret' : hostile ? 'https://evil.test/callback?code=secret' : 'http://localhost:4545/callback?code=mock-code&state=mock-state' }));
    }
    res.statusCode = 404; res.end('{}');
  });
  await new Promise(resolve => service.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => service.close(resolve)));
  const probe = createServer(); await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port; await new Promise(resolve => probe.close(resolve));
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '-p', String(port), '-H', '127.0.0.1'], { env: { ...process.env, SUPABASE_URL: `https://127.0.0.1:${service.address().port}`, SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fake', APP_ORIGIN: origin, MCP_OAUTH_ENABLED: 'true', NODE_EXTRA_CA_CERTS: cert }, stdio: 'ignore' });
  t.after(async () => { if (child.exitCode === null && child.signalCode === null) { child.kill('SIGTERM'); await once(child, 'exit'); } });
  const endpoint = `${origin}/oauth/consent?authorization_id=request-12345`;
  const deadline = Date.now() + 30000;
  while (true) { try { await fetch(endpoint); break; } catch {} if (Date.now() > deadline) throw new Error('aplicação indisponível'); await new Promise(resolve => setTimeout(resolve, 200)); }
  const session = { access_token: 'mock-access-token', refresh_token: 'mock-refresh-token', token_type: 'bearer', expires_at: 4102444800, expires_in: 3600, user: { id: 'alice' } };
  const cookie = `sb-127-auth-token=base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`;
  const page = await fetch(endpoint, { headers: { Cookie: cookie } });
  assert.equal(page.status, 200);
  const text = await page.text();
  assert.match(text, /&lt;script&gt;hostile&lt;\/script&gt;/);
  assert.doesNotMatch(text, /<script>hostile/);
  assert.match(text, /openid email/);
  assert.match(text, /Autorizar/);
  assert.match(text, /Negar/);
  assert.deepEqual(actions, []);
  if (runBrowser) {
  const browser = await chromium.launch({ executablePath: browserPath, headless: true });
  t.after(() => browser.close());
  const context = await browser.newContext();
  await context.addCookies([{ name: 'sb-127-auth-token', value: cookie.split('=')[1], url: origin }]);
  const browserPage = await context.newPage();
  await context.route('http://localhost:4545/**', route => route.fulfill({ status: 200, body: 'callback' }));
  await browserPage.goto(endpoint);
  const [decisionRequest] = await Promise.all([
    browserPage.waitForRequest(request => request.url() === `${origin}/oauth/decision`, { timeout: 5000 }),
    browserPage.getByRole('button', { name: 'Autorizar' }).click({ noWaitAfter: true }),
  ]);
  const decisionHeaders = await decisionRequest.allHeaders();
  assert.equal(decisionHeaders.origin, origin);
  assert.equal(decisionHeaders.referer, `${origin}/`);
  const decisionDeadline = Date.now() + 5000;
  while (!actions.length && Date.now() < decisionDeadline) await new Promise(resolve => setTimeout(resolve, 25));
  assert.deepEqual(actions, ['approve']);
  return;
  }
  for (const rejectedOrigin of ['null', 'https://attacker.example']) {
    const rejected = await fetch(`${origin}/oauth/decision`, { method: 'POST', headers: { Cookie: cookie, Origin: rejectedOrigin, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'authorization_id=request-12345&decision=approve' });
    assert.equal(rejected.status, 403);
    assert.deepEqual(actions, []);
  }
  const invalidForm = await fetch(`${origin}/oauth/decision`, { method: 'POST', headers: { Cookie: cookie, Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'authorization_id=request-12345' });
  assert.equal(invalidForm.status, 400);
  assert.match(await invalidForm.text(), /FORM_INVALID/);
  detailsMode = 'unavailable';
  const unavailableDetails = await fetch(`${origin}/oauth/decision`, { method: 'POST', headers: { Cookie: cookie, Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'authorization_id=request-12345&decision=approve' });
  assert.equal(unavailableDetails.status, 400);
  const missingText = await unavailableDetails.text();
  assert.match(missingText, /AUTHORIZATION_NOT_FOUND/);
  assert.doesNotMatch(missingText, /synthetic sensitive error|request-12345/);
  for (const [mode, expected] of [['processed','AUTHORIZATION_REJECTED'], ['not_pending','AUTHORIZATION_NOT_PENDING'], ['provider_origin','AUTHORIZATION_PROVIDER_ORIGIN'], ['service','AUTHORIZATION_SERVICE_UNAVAILABLE']]) {
    detailsMode = mode;
    const failed = await fetch(`${origin}/oauth/decision`, { method: 'POST', headers: { Cookie: cookie, Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'authorization_id=request-12345&decision=approve' });
    assert.equal(failed.status, 400);
    const errorText = await failed.text();
    assert.match(errorText, new RegExp(expected));
    assert.doesNotMatch(errorText, /synthetic sensitive error|request-12345/);
  }
  detailsMode = 'mismatch';
  const wrongUser = await fetch(`${origin}/oauth/decision`, { method: 'POST', headers: { Cookie: cookie, Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'authorization_id=request-12345&decision=approve' });
  assert.equal(wrongUser.status, 400);
  assert.match(await wrongUser.text(), /AUTHORIZATION_MISMATCH/);
  assert.deepEqual(actions, []);
  detailsMode = 'normal';
  for (const destination of ['http://localhost:49273/callback?code=preconsented-secret&state=client-state', 'http://127.0.0.1:56411/callback?code=preconsented-secret&state=client-state', 'https://client.example/callback?code=preconsented-secret&state=client-state']) {
    reconnectionRedirect = destination;
    const reconnect = await fetch(`${endpoint}&redirect_url=${encodeURIComponent('https://evil.test/steal')}`, { headers: { Cookie: cookie }, redirect: 'manual' });
    assert.equal(reconnect.status, 303);
    assert.equal(reconnect.headers.get('location'), destination);
    assert.equal(reconnect.headers.get('cache-control'), 'no-store');
    assert.equal(reconnect.headers.get('referrer-policy'), 'no-referrer');
    assert.deepEqual(actions, [], 'reconexão não cria um novo consentimento');
  }
  for (const destination of ['http://evil.test/callback?code=secret', 'http://attacker@localhost:4545/callback?code=secret', 'javascript:alert(1)', 'https://client.example/callback?code=secret#fragment', 'http://localhost:4545/callback?code=one&code=two']) {
    reconnectionRedirect = destination;
    const reconnect = await fetch(endpoint, { headers: { Cookie: cookie }, redirect: 'manual' });
    assert.equal(reconnect.status, 400);
    assert.equal(reconnect.headers.get('location'), null);
    assert.doesNotMatch(await reconnect.text(), /secret|evil\.test/);
    assert.deepEqual(actions, [], 'resposta insegura não deve aprovar nem negar');
  }
  reconnectionRedirect = null;
  const post = decision => fetch(`${origin}/oauth/decision`, { method: 'POST', redirect: 'manual', headers: { Cookie: cookie, Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded' }, body: `authorization_id=request-12345&decision=${decision}` });
  const approved = await post('approve');
  assert.equal(approved.status, 303);
  assert.equal(approved.headers.get('location'), 'http://localhost:4545/callback?code=mock-code&state=mock-state');
  const denied = await post('deny');
  assert.equal(denied.status, 303);
  assert.deepEqual(actions, ['approve', 'deny']);
  hostile = true;
  const bad = await post('approve');
  assert.equal(bad.status, 502);
  assert.equal(bad.headers.get('location'), null);
  assert.doesNotMatch(await bad.text(), /secret/);
  hostile = 'userinfo';
  const userinfo = await post('approve');
  assert.equal(userinfo.status, 502);
  assert.equal(userinfo.headers.get('location'), null);
}

test('consentimento explicita cliente e exige decisão da conta autenticada', t => exerciseConsent(t, false));
test('navegador envia a origem ao autorizar sem divulgar o identificador no Referer', { skip: !existsSync(browserPath) }, t => exerciseConsent(t, true));
