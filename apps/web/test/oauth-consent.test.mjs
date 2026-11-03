import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { createServer as createHttpsServer } from 'node:https';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('consentimento explicita cliente e exige decisão da conta autenticada', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'compor-oauth-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const key = join(dir, 'key.pem'), cert = join(dir, 'cert.pem');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-keyout', key, '-out', cert, '-subj', '/CN=127.0.0.1', '-addext', 'subjectAltName=IP:127.0.0.1'], { stdio: 'ignore' });
  const actions = [];
  let hostile = false;
  const service = createHttpsServer({ key: await readFile(key), cert: await readFile(cert) }, async (req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.headers.authorization !== 'Bearer mock-access-token') { res.statusCode = 401; return res.end('{}'); }
    if (req.url === '/auth/v1/user') return res.end(JSON.stringify({ id: 'alice', aud: 'authenticated' }));
    if (req.url === '/auth/v1/oauth/authorizations/request-12345' && req.method === 'GET') return res.end(JSON.stringify({ authorization_id: 'request-12345', user: { id: 'alice', email: 'a@example.test' }, client: { name: '<script>hostile</script>' }, redirect_uri: 'http://localhost:4545/callback', scope: 'openid email' }));
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
});
