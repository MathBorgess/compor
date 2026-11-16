import { resolve } from 'node:path';
import { startInfra, defaultRepoRoot } from './stack.mjs';

if (!process.argv[2]) throw Error('usage: node start.mjs RUN_DIRECTORY [REPO_ROOT]');
const stack = await startInfra({ runDir: resolve(process.argv[2]), repoRoot: process.argv[3] ? resolve(process.argv[3]) : defaultRepoRoot });
process.stdout.write(JSON.stringify(stack.manifest) + '\n');
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  try { process.stdout.write(JSON.stringify(await stack.close()) + '\n'); }
  catch (error) { process.stderr.write(JSON.stringify({ status: 'cleanup_failed', error: error.message }) + '\n'); process.exitCode = 1; }
}
process.once('SIGINT', close);
process.once('SIGTERM', close);
