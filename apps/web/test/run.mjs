import {readdirSync} from 'node:fs';
import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises';
import {run} from 'node:test';
import {spec} from 'node:test/reporters';
import {finished} from 'node:stream/promises';
import {basename, dirname, join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {prepareWorkerTrees} from './worker-trees.mjs';

// Files start in list order, two at a time. The slowest go first so none of them is left running alone at the end.
const slowest = ['studio-reference-trigger-browser', 'studio-chat-flow-browser', 'exploration-loop-browser', 'brief-interview-browser'].map(name => `${name}.test.mjs`);
const rank = name => slowest.includes(name) ? slowest.indexOf(name) : slowest.length;
const dir = fileURLToPath(new URL('.', import.meta.url));
const names = readdirSync(dir).filter(name => name.endsWith('.test.mjs')).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
if (names.length === 0) throw Error('Nenhum arquivo .test.mjs foi encontrado para a suíte web.');
const sourceRoot = fileURLToPath(new URL('../../../', import.meta.url));
// A sibling keeps Next's lockfile discovery outside the original repository.
const prefix = `.compor-browser-workers-${basename(sourceRoot)}-`;
let runRoot;
try { runRoot = await mkdtemp(join(dirname(sourceRoot), prefix)); }
catch (error) {
  if (!['EACCES', 'EPERM', 'EROFS'].includes(error.code)) throw error;
  runRoot = await mkdtemp(join(tmpdir(), prefix));
}
let testsStarted = false, childrenFinished = false;
try {
  await prepareWorkerTrees(sourceRoot, runRoot);
  const wrappers = join(runRoot, 'wrappers');
  await mkdir(wrappers);
  const generated = await Promise.allSettled(names.map(async name => {
    const wrapper = join(wrappers, name);
    await writeFile(wrapper, `import {claimWorker} from ${JSON.stringify(new URL('./worker-slot.mjs', import.meta.url).href)};\nimport {join} from 'node:path';\nimport {pathToFileURL} from 'node:url';\nconst worker=claimWorker(${JSON.stringify(runRoot)});\nprocess.on('exit',worker.release);\nprocess.chdir(join(worker.root,'apps/web'));\nprocess.env.COMPOR_TEST_NEXT_DIST_DIR='.next';\nawait import(pathToFileURL(join(worker.root,'apps/web/test',${JSON.stringify(name)})).href);\n`);
    return wrapper;
  }));
  const failure = generated.find(result => result.status === 'rejected');
  if (failure) throw failure.reason;
  const files = generated.map(result => result.value);
  const tests = run({files, concurrency: 2, timeout: 90000, execArgv: ['--import', 'tsx']})
    .on('test:summary', ({file, success}) => { if (file === undefined && !success) process.exitCode = 1; });
  testsStarted = true;
  const report = tests.compose(spec);
  report.pipe(process.stdout);
  // The native runner finishes only after each test process and its hooks exit.
  await finished(report);
  childrenFinished = true;
} finally {
  if (!testsStarted || childrenFinished) await rm(runRoot, {recursive: true, force: true});
  else process.stderr.write(`Fluxo de testes interrompido; fontes preservadas em ${runRoot}\n`);
}
