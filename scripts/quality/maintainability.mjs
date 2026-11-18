import { ESLint } from 'eslint';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const packages = await readdir(resolve(root, 'packages'));
const paths = ['apps/web/studio', 'apps/web/handlers', 'apps/web/pages', 'apps/web/lib', ...packages.map(name => `packages/${name}/src`)];
const results = await new ESLint({ cwd: root, overrideConfig: [{ rules: { complexity: ['warn', 20] } }] }).lintFiles(paths);
if (results.some(result => result.fatalErrorCount > 0)) throw Error('Maintainability analysis could not parse all source files.');
const findings = results.flatMap(result => result.messages.filter(message => message.ruleId === 'complexity').map(message => ({
  file: relative(root, result.filePath), line: message.line, message: message.message,
  complexity: Number(message.message.match(/complexity of (\d+)/)?.[1]),
}))).sort((a, b) => b.complexity - a.complexity);
const output = resolve(root, 'quality-results/maintainability');
await mkdir(output, { recursive: true });
await writeFile(resolve(output, 'complexity.json'), `${JSON.stringify({
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  measuredAt: new Date().toISOString(), files: results.length,
  policy: 'Diagnostic only. Values above 20 identify review candidates, not an automatic refactoring mandate.',
  findings,
}, null, 2)}\n`);
console.log(`${findings.length} functions exceed diagnostic complexity 20 across ${results.length} files.`);
for (const finding of findings.slice(0, 10)) console.log(`${finding.file}:${finding.line} ${finding.message}`);
