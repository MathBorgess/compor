import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {mkdtemp, mkdir, readFile, readdir, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

for (const mode of ['empty', 'failure', 'import-error', 'success']) {
  test(`runner privado preserva descoberta, saída e cleanup: ${mode}`, async t => {
    const root = await mkdtemp(join(tmpdir(), 'compor-runner-probe-'));
    t.after(() => rm(root, {recursive: true, force: true}));
    const web = join(root, 'apps/web'), exitLog = join(root, 'exits.jsonl');
    await Promise.all(['app', 'lib', 'test', 'public', 'node_modules/tsx'].map(path => mkdir(join(web, path), {recursive: true})));
    await mkdir(join(root, 'packages'));
    await writeFile(join(root, 'package.json'), '{"type":"module"}');
    await writeFile(join(root, 'package-lock.json'), '{}');
    await writeFile(join(web, 'package.json'), '{"type":"module"}');
    // The probe is plain JavaScript; a local no-op preload keeps the real
    // runner byte-for-byte while avoiding an unrelated dependency install.
    await writeFile(join(web, 'node_modules/tsx/package.json'), '{"name":"tsx","exports":"./index.mjs"}');
    await writeFile(join(web, 'node_modules/tsx/index.mjs'), '');
    for (const name of ['run.mjs', 'worker-trees.mjs', 'worker-slot.mjs']) {
      await writeFile(join(web, 'test', name), await readFile(new URL(name, import.meta.url)));
    }
    if (mode !== 'empty') {
      await writeFile(join(web, 'test/probe.test.mjs'), `import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,appendFileSync,writeFileSync} from 'node:fs';
process.on('exit',()=>appendFileSync(${JSON.stringify(exitLog)},JSON.stringify({workspaceStillExists:existsSync(process.cwd()),workspace:process.cwd()})+'\\n'));
${mode === 'import-error' ? "throw Error('controlled import failure');" : ''}
test('native test result',()=>{writeFileSync('app/private-fixture.txt','private');assert.equal(${JSON.stringify(mode)},'success');});`);
    }
    const env = {...process.env}; delete env.NODE_TEST_CONTEXT;
    const child = spawn(process.execPath, ['test/run.mjs'], {cwd: web, env, stdio: ['ignore', 'pipe', 'pipe']});
    let output = ''; for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { output += chunk; });
    t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); });
    const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
    assert.equal(code, mode === 'success' ? 0 : 1, output);
    assert.equal((await readdir(join(web, 'app'))).length, 0, 'o teste nunca escreveu no app original');
    if (mode === 'empty') {
      assert.match(output, /Nenhum arquivo/);
    } else {
      assert.match(output, /tests 1/);
      assert.match(output, mode === 'success' ? /pass 1/ : /fail 1/);
      const exit = JSON.parse((await readFile(exitLog, 'utf8')).trim());
      assert.equal(exit.workspaceStillExists, true, 'cleanup só ocorre após exit do filho');
      assert.equal(existsSync(exit.workspace), false, 'a árvore privada é removida depois do exit');
    }
  });
}
