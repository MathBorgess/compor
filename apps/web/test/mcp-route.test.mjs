import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { createServer as createHttpsServer } from 'node:https';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

test('rota MCP real falha fechada sem configuração Supabase e não expõe a credencial', async t => {
  const probe = createServer();
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise((resolve, reject) => probe.close(error => error ? reject(error) : resolve()));
  const env = { ...process.env };
  delete env.SUPABASE_URL;
  delete env.SUPABASE_PUBLISHABLE_KEY;
  const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '-p', String(port), '-H', '127.0.0.1'], { env, stdio: 'ignore' });
  t.after(async () => { if (child.exitCode === null && child.signalCode === null) { child.kill('SIGTERM'); await once(child, 'exit'); } });
  const endpoint = `http://127.0.0.1:${port}/api/mcp`;
  let response;
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline && child.exitCode === null && child.signalCode === null) {
    try { response = await fetch(endpoint, { method: 'POST', body: '{}' }); break; }
    catch { await new Promise(resolve => setTimeout(resolve, 300)); }
  }
  assert.ok(response, 'aplicação web deve iniciar');
  assert.equal(response.status, 401);
  assert.match(response.headers.get('www-authenticate'), /Bearer/);
  response = await fetch(endpoint, { method: 'POST', headers: { authorization: 'Bearer test-secret-do-not-leak', 'content-type': 'application/json' }, body: '{}' });
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.doesNotMatch(await response.text(), /test-secret-do-not-leak/);
});

test('rota MCP configurada consulta autenticação e projetos usando a credencial do usuário', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'compor-mcp-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const key = join(dir, 'key.pem'), cert = join(dir, 'cert.pem');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-keyout', key, '-out', cert, '-subj', '/CN=127.0.0.1', '-addext', 'subjectAltName=IP:127.0.0.1'], { stdio: 'ignore' });
  const service = createHttpsServer({ key: await readFile(key), cert: await readFile(cert) }, (req, res) => {
    assert.equal(req.headers.authorization, 'Bearer fake-user-token');
    assert.equal(req.headers.apikey, 'sb_publishable_fake');
    res.setHeader('content-type', 'application/json');
    if (req.url === '/auth/v1/user') res.end(JSON.stringify({ id: 'alice' }));
    else if (req.url.startsWith('/rest/v1/projects?')) res.end(JSON.stringify([{ id: 'p1', owner_id: 'alice', title: 'Oficina', created_at: '2026-11-03T00:00:00Z' }]));
    else { res.statusCode = 404; res.end('{}'); }
  });
  await new Promise(resolve => service.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => service.close(resolve)));
  const probe = createServer();
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '-p', String(port), '-H', '127.0.0.1'], {
    env: { ...process.env, SUPABASE_URL: `https://127.0.0.1:${service.address().port}`, SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fake', NODE_EXTRA_CA_CERTS: cert }, stdio: 'ignore',
  });
  t.after(async () => { if (child.exitCode === null && child.signalCode === null) { child.kill('SIGTERM'); await once(child, 'exit'); } });
  const endpoint = new URL(`http://127.0.0.1:${port}/api/mcp`);
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline && child.exitCode === null && child.signalCode === null) {
    try { await fetch(endpoint, { method: 'POST', body: '{}' }); break; }
    catch { await new Promise(resolve => setTimeout(resolve, 300)); }
  }
  const client = new Client({ name: 'teste', version: '1.0' });
  await client.connect(new StreamableHTTPClientTransport(endpoint, { requestInit: { headers: { Authorization: 'Bearer fake-user-token' } } }));
  try {
    const result = await client.callTool({ name: 'list_projects', arguments: {} });
    assert.deepEqual(result.structuredContent.projects, [{ id: 'p1', title: 'Oficina', created_at: '2026-11-03T00:00:00Z' }]);
  } finally { await client.close(); }
});
