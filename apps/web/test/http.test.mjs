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

test("a pessoa pode começar pelo objetivo sem afirmar que o serviço está conectado", async (t) => {
  const port = await freePort();
  const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "-p", String(port), "-H", "127.0.0.1"], { stdio: "ignore" });
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
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Seu objetivo/);
  assert.match(html, /Ainda não conectado/);
  assert.match(html, /<textarea[^>]*id="objective"/);
  assert.match(html, /<button[^>]*disabled[^>]*>Continuar<\/button>/);
  assert.doesNotMatch(html, /Projeto salvo/);
});
