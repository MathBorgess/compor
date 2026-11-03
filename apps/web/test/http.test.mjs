import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";

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

test("a pessoa pode começar pelo objetivo sem afirmar que o serviço está conectado", async (t) => {
  const { port, response } = await startServer(t, { SUPABASE_URL: '', SUPABASE_PUBLISHABLE_KEY: '', APP_ORIGIN: '' });
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Seu objetivo/);
  assert.match(html, /Ainda não conectado/);
  assert.match(html, /<textarea[^>]*id="objective"/);
  assert.match(html, /<button[^>]*disabled[^>]*>Continuar<\/button>/);
  assert.doesNotMatch(html, /Projeto salvo/);
  const login = await fetch(`http://127.0.0.1:${port}/auth/sign-in`, { method: 'POST', redirect: 'manual' });
  assert.equal(login.status, 503, 'login sem Supabase configurado deve falhar de forma explícita');
});

test('início OAuth usa destino fixo e recusa origem externa', async (t) => {
  const { port } = await startServer(t, { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_publictest', APP_ORIGIN: 'https://app.compor.test' });
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
