import {readdirSync} from 'node:fs';
import {run} from 'node:test';
import {spec} from 'node:test/reporters';
import {fileURLToPath} from 'node:url';

// Files start in list order, two at a time. The slowest go first so none of them is left running alone at the end.
const slowest = ['studio-reference-trigger-browser', 'studio-chat-flow-browser', 'exploration-loop-browser', 'brief-interview-browser'].map(name => `${name}.test.mjs`);
const rank = name => slowest.includes(name) ? slowest.indexOf(name) : slowest.length;
const dir = fileURLToPath(new URL('.', import.meta.url));
const files = readdirSync(dir).filter(name => name.endsWith('.test.mjs')).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b)).map(name => dir + name);
if (files.length === 0) throw Error('Nenhum arquivo .test.mjs foi encontrado para a suíte web.');

run({files, concurrency: 2, timeout: 90000, execArgv: ['--import', 'tsx', '--import', './test/next-dist-dir.mjs']})
  .on('test:summary', ({file, success}) => { if (file === undefined && !success) process.exitCode = 1; })
  .compose(spec)
  .pipe(process.stdout);
