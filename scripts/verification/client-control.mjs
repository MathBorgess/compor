#!/usr/bin/env node
import { request } from 'node:http';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export function sendControl(command, { socketPath = '/tmp/compor-verification-control.sock', timeoutMs = 40_000 } = {}) {
  const serialized = JSON.stringify(command);
  if (Buffer.byteLength(serialized) > 16 * 1024) return Promise.reject(Error('command_too_large'));
  return new Promise((resolvePromise, reject) => {
    const outgoing = request({ socketPath, path: '/', method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(serialized) }, timeout: timeoutMs }, incoming => {
      const chunks = []; let length = 0;
      incoming.on('data', chunk => {
        length += chunk.length;
        if (length > 64 * 1024) { incoming.destroy(); reject(Error('control_response_too_large')); return; }
        chunks.push(chunk);
      });
      incoming.on('error', reject);
      incoming.on('end', () => {
        try { resolvePromise({ status: incoming.statusCode, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) }); }
        catch { reject(Error('invalid_control_response')); }
      });
    });
    outgoing.once('error', reject);
    outgoing.once('timeout', () => outgoing.destroy(Error('control_timeout_result_unknown')));
    outgoing.end(serialized);
  });
}

async function main() {
  let raw = process.argv[2];
  if (process.argv.length > 3) throw Error('usage: client-control.mjs JSON or JSON on stdin');
  if (raw === undefined) {
    const chunks = []; let length = 0;
    for await (const chunk of process.stdin) {
      length += chunk.length;
      if (length > 16 * 1024) throw Error('command_too_large');
      chunks.push(chunk);
    }
    raw = Buffer.concat(chunks).toString('utf8');
  }
  const reply = await sendControl(JSON.parse(raw));
  console.log(JSON.stringify(reply));
  if (reply.status >= 400) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(JSON.stringify({ ok: false, error: error.message, retryAutomatically: false })); process.exitCode = 1; });
}
