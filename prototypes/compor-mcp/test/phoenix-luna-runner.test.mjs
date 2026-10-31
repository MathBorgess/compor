import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
test('runner Luna mantém o subprocesso isolado, sem MCP do projeto ou web', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'phoenix-runner-test-'));
  const argsFile = join(dir, 'args');
  const codex = join(dir, 'codex');
  await writeFile(codex, '#!/bin/sh\nprintf "%s\\n" "$@" > "$PHOENIX_ARGS_FILE"\ncat >/dev/null\nprintf \'{"ok":true}\\n\'\n', { mode: 0o700 });
  try {
    const source = "import { defaultCodexLunaSubagentRunner as run } from './dist/phoenix_engine/services/decision_api.js'; const r = await run('data','test'); console.log(r);";
    const result = await run(process.execPath, ['--input-type=module', '-e', source], { env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, PHOENIX_ARGS_FILE: argsFile } });
    assert.deepEqual(JSON.parse(result.stdout), { ok: true });
    const args = await readFile(argsFile, 'utf8');
    for (const arg of ['--ignore-user-config', '--ephemeral', '--sandbox\nread-only', '--model\ngpt-6-luna', 'mcp_servers={}', 'web_search="disabled"']) assert.ok(args.includes(arg), arg);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
