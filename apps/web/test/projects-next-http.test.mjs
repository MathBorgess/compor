import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { createServer as httpsServer } from 'node:https';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('rota Next autentica sessão e opera projetos com token da pessoa', async t => {
  const user = '63de811f-c75c-4571-968c-38a8b3f0accd';
  const dir = await mkdtemp(join(tmpdir(), 'compor-projects-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const key = join(dir, 'key.pem'), cert = join(dir, 'cert.pem');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-keyout', key, '-out', cert, '-subj', '/CN=127.0.0.1', '-addext', 'subjectAltName=IP:127.0.0.1'], { stdio: 'ignore' });
  let writes = 0;
  const service = httpsServer({ key: await readFile(key), cert: await readFile(cert) }, async (req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.headers.authorization !== 'Bearer mock-user-token') { res.statusCode = 401; return res.end('{}'); }
    if (req.url === '/auth/v1/user') return res.end(JSON.stringify({ id: user, aud: 'authenticated' }));
    if (req.url.startsWith('/rest/v1/projects?')) {
      assert.equal(req.headers.apikey, 'sb_publishable_fake');
      if (req.method === 'POST') { let raw = ''; for await (const chunk of req) raw += chunk; assert.deepEqual(JSON.parse(raw), { title: 'Oficina' }); writes++; }
      return res.end(JSON.stringify([{ id: '11111111-1111-4111-8111-111111111111', owner_id: user, title: 'Oficina', created_at: '2026-11-03T00:00:00Z', revision:1 }]));
    }
    if(req.url==='/rest/v1/rpc/rename_project') {
      let raw='';for await(const chunk of req)raw+=chunk;
      assert.deepEqual(JSON.parse(raw),{p_project_id:'11111111-1111-4111-8111-111111111111',p_title:'Novo título',p_expected_revision:1});
      return res.end(JSON.stringify({status:'renamed',project:{id:'11111111-1111-4111-8111-111111111111',title:'Novo título',created_at:'2026-11-03T00:00:00Z',revision:2}}));
    }
    res.statusCode = 404; res.end('{}');
  });
  await new Promise(resolve => service.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => service.close(resolve)));
  const probe = createServer(); await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port; await new Promise(resolve => probe.close(resolve));
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '-p', String(port), '-H', '127.0.0.1'], { stdio: 'ignore', env: { ...process.env, SUPABASE_URL: `https://127.0.0.1:${service.address().port}`, SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fake', APP_ORIGIN: origin, NODE_EXTRA_CA_CERTS: cert } });
  t.after(async () => { if (child.exitCode === null && child.signalCode === null) { child.kill('SIGTERM'); await once(child, 'exit'); } });
  const endpoint = `${origin}/api/projects`, deadline = Date.now() + 30000;
  while (true) { try { await fetch(endpoint); break; } catch {} if (Date.now() > deadline) throw new Error('aplicação indisponível'); await new Promise(resolve => setTimeout(resolve, 200)); }
  assert.equal((await fetch(endpoint)).status, 401);
  const session = { access_token: 'mock-user-token', refresh_token: 'mock-refresh', token_type: 'bearer', expires_at: 4102444800, expires_in: 3600, user: { id: user } };
  const cookie = `sb-127-auth-token=base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`;
  const list = await fetch(endpoint, { headers: { Cookie: cookie } });
  assert.equal(list.status, 200);
  assert.equal((await list.json()).projects[0].title, 'Oficina');
  const forbidden = await fetch(endpoint, { method: 'POST', headers: { Cookie: cookie, Origin: 'https://evil.test', 'Content-Type': 'application/json' }, body: '{"title":"Oficina"}' });
  assert.equal(forbidden.status, 403);
  const created = await fetch(endpoint, { method: 'POST', headers: { Cookie: cookie, Origin: origin, 'Content-Type': 'application/json' }, body: '{"title":"Oficina"}' });
  assert.equal(created.status, 201);
  assert.equal((await created.json()).project.title, 'Oficina');
  assert.equal(writes, 1);
  const renamed=await fetch(endpoint,{method:'PATCH',headers:{Cookie:cookie,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({projectId:'11111111-1111-4111-8111-111111111111',title:'Novo título',expectedRevision:1})});
  assert.equal(renamed.status,200);assert.equal((await renamed.json()).project.revision,2);
});
