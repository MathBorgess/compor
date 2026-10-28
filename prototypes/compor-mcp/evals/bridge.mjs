#!/usr/bin/env node
/** Synthetic evaluation bridge. Starts no model, subprocess, or network transport. */
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const hash = value => createHash('sha256').update(value).digest('hex');
const limit = 1_000_000;
const started = new Date();
const elapsedStart = performance.now();
const record = { format_version: 1, event_id: randomUUID(), started_at: started.toISOString(), transport: 'mcp_in_memory', model_started_by_bridge: false };
let transcript;
let client;
let server;
let exitCode = 1;
const originalFetch = globalThis.fetch;

function fail(message) { throw new Error(message); }
function options(argv) {
  const config = {};
  while (argv[0]?.startsWith('--')) {
    const key = argv.shift();
    if (key === '--synthetic') {
      if (config.synthetic) fail('Duplicate --synthetic.');
      config.synthetic = true;
    } else if (key === '--run' || key === '--dir') {
      const name = key.slice(2);
      if (config[name] || !argv[0] || argv[0].startsWith('--')) fail(`Invalid or duplicate ${key}.`);
      config[name] = argv.shift();
    } else fail(`Unknown option ${key}.`);
  }
  if (!config.synthetic || !config.dir || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(config.run ?? '')) {
    fail('Usage: bridge.mjs --synthetic --run RUN_ID --dir TRANSCRIPT_DIRECTORY list | call TOOL JSON_OR_DASH');
  }
  return { ...config, rest: argv };
}

try {
  const config = options(process.argv.slice(2));
  await mkdir(resolve(config.dir), { recursive: true });
  transcript = join(resolve(config.dir), `${config.run}.jsonl`);
  Object.assign(record, { run_id: config.run, input_origin_claim: 'synthetic', origin_verified: false });
  const [action, toolName, rawArg, ...extra] = config.rest;
  record.action = action ?? null;
  if (action === 'call') record.tool_name = toolName ?? null;
  if (extra.length || (action === 'list' && (toolName || rawArg)) || !['list', 'call'].includes(action)) fail('Expected list, or call TOOL JSON_OR_DASH.');
  if (action === 'call') {
    if (!toolName || !rawArg) fail('call requires a tool name and JSON object (or - for stdin).');
    let raw = rawArg;
    if (rawArg === '-') {
      process.stdin.setEncoding('utf8');
      raw = '';
      for await (const chunk of process.stdin) {
        raw += chunk.toString('utf8');
        if (Buffer.byteLength(raw) > limit) fail('Input exceeds 1000000 bytes.');
      }
    }
    if (Buffer.byteLength(raw) > limit) fail('Input exceeds 1000000 bytes.');
    record.input_raw = raw;
    record.input_sha256 = hash(raw);
    const parsed = JSON.parse(raw);
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') fail('Tool arguments must be a JSON object.');
    record.arguments = parsed;
  }
  record.runtime = { node: process.version, platform: process.platform, arch: process.arch };
  record.artifact_hashes = {};
  for (const path of ['dist/server.js', 'package-lock.json']) record.artifact_hashes[path] = hash(await readFile(join(root, path)));
  // This catches ordinary fetch usage, not every possible network API; no OS sandbox is claimed.
  globalThis.fetch = async () => { throw new Error('Network fetch is disabled in the synthetic bridge.'); };
  const { createComporServer } = await import('../dist/server.js');
  server = createComporServer();
  client = new Client({ name: 'compor-eval-bridge', version: '0.1.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  const catalog = await client.listTools(undefined, { timeout: 10000 });
  record.catalog_sha256 = hash(JSON.stringify(catalog));
  if (action === 'list') {
    record.result = catalog;
    record.status = 'ok';
    exitCode = 0;
  } else {
    const tool = catalog.tools.find(item => item.name === toolName);
    record.tool_schema_sha256 = tool ? hash(JSON.stringify(tool)) : null;
    // Unknown tools still reach MCP, so their observed protocol error is retained.
    record.result = await client.callTool({ name: toolName, arguments: record.arguments }, undefined, { timeout: 10000 });
    record.status = record.result.isError ? 'tool_error' : 'ok';
    exitCode = record.result.isError ? 2 : 0;
  }
} catch (error) {
  record.status = 'bridge_or_protocol_error';
  record.error = { name: error?.name ?? 'Error', message: String(error?.message ?? error) };
} finally {
  const cleanup = await Promise.allSettled([client?.close(), server?.close()]);
  const errors = cleanup.filter(item => item.status === 'rejected').map(item => String(item.reason?.message ?? item.reason));
  if (errors.length) { record.cleanup_errors = errors; exitCode = 1; }
  globalThis.fetch = originalFetch;
  record.completed_at = new Date().toISOString();
  record.elapsed_ms = Math.round((performance.now() - elapsedStart) * 100) / 100;
  if (record.result) record.result_sha256 = hash(JSON.stringify(record.result));
  if (transcript) {
    try {
      await appendFile(transcript, `${JSON.stringify(record)}\n`, { encoding: 'utf8', mode: 0o600 });
    } catch (error) {
      record.transcript_error = String(error?.message ?? error);
      exitCode = 1;
    }
  }
  process.stdout.write(`${JSON.stringify(record)}\n`);
  process.exitCode = exitCode;
}
