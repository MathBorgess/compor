import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { createServer as httpsServer } from 'node:https';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('rota Next valida propriedade e encaminha versão com token da pessoa', async t => {
  const user = '63de811f-c75c-4571-968c-38a8b3f0accd';
  const project = '11111111-1111-4111-8111-111111111111';
  const other = '99999999-9999-4999-8999-999999999999';
  const piece = '22222222-2222-4222-8222-222222222222';
  const content = { headline: 'Oficina', price: '', date: '', caption: 'Inscreva-se', captionOrigin: 'user' };
  const dir = await mkdtemp(join(tmpdir(), 'compor-pieces-test-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const key = join(dir, 'key.pem'), cert = join(dir, 'cert.pem');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-keyout', key, '-out', cert, '-subj', '/CN=127.0.0.1', '-addext', 'subjectAltName=IP:127.0.0.1'], { stdio: 'ignore' });
  let writes = 0;
  const service = httpsServer({ key: await readFile(key), cert: await readFile(cert) }, async (req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.headers.authorization !== 'Bearer mock-user-token') { res.statusCode = 401; return res.end('{}'); }
    if (req.url === '/auth/v1/user') return res.end(JSON.stringify({ id: user, aud: 'authenticated' }));
    if (req.url.startsWith('/rest/v1/projects?')) return res.end(JSON.stringify(req.url.includes(other) ? [] : [{ id: project, owner_id: user }]));
    if (req.url.startsWith('/rest/v1/piece_versions?')) { res.setHeader('content-range', '0-0/1'); return res.end(JSON.stringify([{ project_id: project, piece_id: piece, version: 1, content, created_at: '2026-11-03T00:00:00Z', projects: { owner_id: user } }])); }
    if (req.url === '/rest/v1/rpc/save_piece_version') {
      let raw = ''; for await (const chunk of req) raw += chunk; const data = JSON.parse(raw);
      assert.deepEqual(data, { p_project_id: project, p_piece_id: piece, p_expected_version: 1, p_content: content }); writes++;
      return res.end(JSON.stringify({ status: 'conflict', currentVersion: 2 }));
    }
    res.statusCode = 404; res.end('{}');
  });
  await new Promise(resolve => service.listen(0, '127.0.0.1', resolve)); t.after(() => new Promise(resolve => service.close(resolve)));
  const probe = createServer(); await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve)); const port = probe.address().port; await new Promise(resolve => probe.close(resolve));
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '-p', String(port), '-H', '127.0.0.1'], { stdio: 'ignore', env: { ...process.env, SUPABASE_URL: `https://127.0.0.1:${service.address().port}`, SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fake', APP_ORIGIN: origin, NODE_EXTRA_CA_CERTS: cert } });
  t.after(async () => { if (child.exitCode === null && child.signalCode === null) { child.kill('SIGTERM'); await once(child, 'exit'); } });
  const endpoint = `${origin}/api/pieces`, deadline = Date.now() + 30000;
  while (true) { try { await fetch(`${endpoint}?projectId=${project}`); break; } catch {} if (Date.now() > deadline) throw new Error('aplicação indisponível'); await new Promise(resolve => setTimeout(resolve, 200)); }
  const session = { access_token: 'mock-user-token', refresh_token: 'mock-refresh', token_type: 'bearer', expires_at: 4102444800, expires_in: 3600, user: { id: user } };
  const cookie = `sb-127-auth-token=base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`;
  const response = await fetch(`${endpoint}?projectId=${project}`, { headers: { Cookie: cookie } });
  assert.equal(response.status, 200); assert.equal((await response.json()).versions[0].content.caption, content.caption);
  const denied = await fetch(`${endpoint}?projectId=${other}`, { headers: { Cookie: cookie } }); assert.equal(denied.status, 404);
  const post = p => fetch(endpoint, { method: 'POST', headers: { Cookie: cookie, Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: p, pieceId: piece, expectedVersion: 1, content }) });
  const conflict = await post(project); assert.equal(conflict.status, 409); assert.deepEqual(await conflict.json(), { status: 'conflict', currentVersion: 2 });
  assert.equal((await post(other)).status, 404); assert.equal(writes, 1);
});
