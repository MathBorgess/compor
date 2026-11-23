import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { resolveAppOrigin } from "../lib/auth-config.ts";

const productionOrigin = 'https://compor-ai.vercel.app';
const branchAlias = 'compor-git-preview-math-ai2.vercel.app';
const previewHosts = ['compor-a1b2c3d4e-math-ai2.vercel.app', 'compor-z9y8x7w6v-math-ai2.vercel.app'];
const previewEnv = {
  VERCEL: '1',
  VERCEL_ENV: 'preview',
  VERCEL_PROJECT_ID: 'prj_48C8lO4W6WdEMScyAfZRSnkvN6QS',
  VERCEL_BRANCH_URL: branchAlias,
  APP_ORIGIN: productionOrigin,
};

async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => server.listen(0, "127.0.0.1", resolve).on("error", reject));
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function startServer(t, env = {}) {
  const port = await freePort();
  const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "-p", String(port), "-H", "127.0.0.1"], { stdio: "ignore", env: { ...process.env, ...env } });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM");
      await once(child, "exit");
    }
  });
  let response;
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline && child.exitCode === null && child.signalCode === null) {
    try {
      response = await fetch(`http://127.0.0.1:${port}/`);
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }
  assert.ok(response, "aplicação web deve iniciar");
  return { port, response };
}

test("a entrada exige Google e mantém serviços indisponíveis sem configuração", async (t) => {
  const { port, response } = await startServer(t, { SUPABASE_URL: '', SUPABASE_PUBLISHABLE_KEY: '', APP_ORIGIN: '' });
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Bom ter você por aqui/);
  const head=html.match(/<head(?: |>)[\s\S]*?<\/head>/i)?.[0]??'';
  assert.equal((head.match(/<title>Compor<\/title>/g)??[]).length,1);
  assert.match(head,/name="description"[^>]*content="Crie uma direção para sua próxima divulgação\."/);
  assert.match(head,/rel="icon"[^>]*href="\/studio\/compor-avatar\.svg"/);
  assert.match(html, /<button[^>]*disabled[^>]*>Entrar com Google<\/button>/);
  assert.doesNotMatch(html, /<textarea|type="password"|Continuar sem conta/);
  assert.doesNotMatch(html, /Projeto salvo/);
  assert.equal((await fetch(`http://127.0.0.1:${port}/api/projects`)).status, 503, 'projetos indisponíveis sem Supabase');
  const login = await fetch(`http://127.0.0.1:${port}/auth/sign-in`, { method: 'POST', redirect: 'manual' });
  assert.equal(login.status, 503, 'login sem Supabase configurado deve falhar de forma explícita');
  assert.equal((await fetch(`http://127.0.0.1:${port}/.well-known/oauth-protected-resource/api/mcp`)).status, 503);
  assert.equal((await fetch(`http://127.0.0.1:${port}/oauth/consent?authorization_id=example-id`)).status, 503);
  for (const path of ['/pagina-ausente', '/api/__compor_bridge/auth/session']) {
    const missing=await fetch(`http://127.0.0.1:${port}${path}`);
    assert.equal(missing.status,404);
    const errorHead=(await missing.text()).match(/<head(?: |>)[\s\S]*?<\/head>/i)?.[0]??'';
    assert.match(errorHead,/<title>404: This page could not be found<\/title>/);
  }
  const agent = await fetch(`http://127.0.0.1:${port}/api/agent`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.equal(agent.status, 503, 'geração permanece indisponível sem autorização e registro duráveis');
});

test('início OAuth usa destino fixo e recusa origem externa', async (t) => {
  const { port } = await startServer(t, { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_publictest', APP_ORIGIN: 'https://app.compor.test', MCP_OAUTH_ENABLED: 'true' });
  const meta = await fetch(`http://127.0.0.1:${port}/.well-known/oauth-protected-resource/api/mcp`, { headers: { host: 'malicious.test' } });
  assert.equal(meta.status, 200);
  assert.deepEqual(await meta.json(), { resource: 'https://app.compor.test/api/mcp', authorization_servers: ['https://example.supabase.co/auth/v1'], bearer_methods_supported: ['header'] });
  const challenge = await fetch(`http://127.0.0.1:${port}/api/mcp`);
  assert.equal(challenge.status, 401);
  assert.equal(challenge.headers.get('www-authenticate'), 'Bearer resource_metadata="https://app.compor.test/.well-known/oauth-protected-resource/api/mcp"');
  const deniedOrigin = await fetch(`http://127.0.0.1:${port}/oauth/decision`, { method: 'POST', headers: { Origin: 'https://evil.test', 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'authorization_id=example-id&decision=approve' });
  assert.equal(deniedOrigin.status, 403);
  const unauthenticated = await fetch(`http://127.0.0.1:${port}/oauth/decision`, { method: 'POST', headers: { Origin: 'https://app.compor.test', 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'authorization_id=example-id&decision=approve' });
  assert.equal(unauthenticated.status, 401);
  const consent = await fetch(`http://127.0.0.1:${port}/oauth/consent?authorization_id=example-id`);
  assert.match(await consent.text(), /Entrar com Google/);
  const begin = await fetch(`http://127.0.0.1:${port}/auth/sign-in`, { method: 'POST', headers: { Origin: 'https://app.compor.test', 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'authorization_id=example-id', redirect: 'manual' });
  assert.equal(begin.status, 303);
  assert.match(begin.headers.get('set-cookie'), /compor-oauth-pending=example-id/);
  const agent = await fetch(`http://127.0.0.1:${port}/api/agent`, { method: 'POST', headers: { Origin: 'https://app.compor.test', 'content-type': 'application/json' }, body: JSON.stringify({ apiKey: 'sk-test-secret', objective: 'teste' }) });
  assert.equal(agent.status, 503, 'mesmo configurada, geração fica bloqueada sem registro durável');
  assert.doesNotMatch(await agent.text(), /sk-test-secret/);
  const endpoint = `http://127.0.0.1:${port}/auth/sign-in`;
  const bad = await fetch(endpoint, { method: 'POST', headers: { Origin: 'https://evil.test' }, redirect: 'manual' });
  assert.equal(bad.status, 403);
  const good = await fetch(endpoint, { method: 'POST', headers: { Origin: 'https://app.compor.test' }, redirect: 'manual' });
  assert.equal(good.status, 303);
  const destination = new URL(good.headers.get('location'));
  assert.equal(destination.origin, 'https://example.supabase.co');
  assert.equal(destination.pathname, '/auth/v1/authorize');
  assert.equal(destination.searchParams.get('provider'), 'google');
  assert.equal(destination.searchParams.get('redirect_to'), 'https://app.compor.test/auth/callback');
  assert.match(good.headers.get('set-cookie'), /code-verifier/);
  assert.match(good.headers.get('set-cookie'), /HttpOnly/i);
  assert.match(good.headers.get('set-cookie'), /Secure/i);
  assert.match(good.headers.get('set-cookie'), /SameSite=Lax/i);
  const callback = await fetch(`http://127.0.0.1:${port}/auth/callback?next=https://evil.test`, { redirect: 'manual' });
  assert.equal(callback.status, 303);
  assert.equal(callback.headers.get('location'), '/?login=erro');
});

test('somente Preview do projeto Compor usa o hostname canônico do deployment', () => {
  const env = { ...previewEnv, VERCEL_URL: previewHosts[0] };
  assert.equal(resolveAppOrigin(env), `https://${previewHosts[0]}`);
  for (const invalid of [
    { VERCEL: undefined },
    { VERCEL_PROJECT_ID: 'prj_outro' },
    { VERCEL_URL: undefined },
    { VERCEL_URL: branchAlias },
    { VERCEL_URL: 'compor-ai.vercel.app' },
    { VERCEL_URL: 'compor-a1b2c3d4e-other.vercel.app' },
    { VERCEL_URL: `${previewHosts[0]}.example.test` },
    { VERCEL_URL: `${previewHosts[0]}:443` },
    { VERCEL_URL: `${previewHosts[0]}/auth/callback` },
    { VERCEL_URL: `https://${previewHosts[0]}` },
    { VERCEL_URL: `user@${previewHosts[0]}` },
    { VERCEL_URL: `${previewHosts[0]}\n` },
  ]) assert.equal(resolveAppOrigin({ ...env, ...invalid }), null);

  assert.equal(resolveAppOrigin({ ...env, APP_ORIGIN: undefined, VERCEL_ENV: 'production' }), null);
  assert.equal(resolveAppOrigin({ ...env, VERCEL_ENV: 'production' }), productionOrigin);
  assert.equal(resolveAppOrigin({ ...env, VERCEL_ENV: 'development', APP_ORIGIN: 'http://127.0.0.1:3000' }), 'http://127.0.0.1:3000');
  assert.equal(resolveAppOrigin({ APP_ORIGIN: 'http://external.test' }), null);
});

for (const [index, host] of previewHosts.entries()) {
  test(`Preview ${index + 1} emite apenas seu callback de OAuth e recusa origem cruzada`, async t => {
    const { port } = await startServer(t, {
      ...previewEnv,
      VERCEL_URL: host,
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_publictest',
    });
    const endpoint = `http://127.0.0.1:${port}/auth/sign-in`;
    const signIn = origin => fetch(endpoint, {
      method: 'POST',
      headers: { Origin: origin, Host: 'external.test', 'X-Forwarded-Host': branchAlias, 'X-Forwarded-Proto': 'http' },
      redirect: 'manual',
    });

    for (const rejected of [productionOrigin, `https://${previewHosts[1 - index]}`, `https://${branchAlias}`, 'https://external.test']) {
      const response = await signIn(rejected);
      assert.equal(response.status, 403);
      assert.equal(response.headers.get('location'), null);
    }

    const origin = `https://${host}`;
    const response = await signIn(origin);
    assert.equal(response.status, 303);
    const destination = new URL(response.headers.get('location'));
    assert.equal(destination.origin, 'https://example.supabase.co');
    assert.equal(destination.pathname, '/auth/v1/authorize');
    assert.equal(destination.searchParams.get('provider'), 'google');
    assert.equal(destination.searchParams.get('redirect_to'), `${origin}/auth/callback`);
    assert.match(response.headers.get('set-cookie'), /code-verifier/);
    assert.doesNotMatch(response.headers.get('set-cookie'), /;\s*Domain=/i);
  });
}
