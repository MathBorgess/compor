import {mkdirSync, rmSync, rmdirSync, writeFileSync} from 'node:fs';

// Loaded by every test file process. `next dev` locks its dist dir, so two test files running at once each claim their own.
// The slots are namespaced by the runner's pid, so locks left by an interrupted run never block the next one.
const distDirs = ['.next', '.next/test'];
const run = new URL(`../.next/test-slots/${process.ppid}/`, import.meta.url);
mkdirSync(run, {recursive: true});

function claim(index) {
  try {
    writeFileSync(new URL(String(index), run), String(process.pid), {flag: 'wx'});
    return true;
  } catch (error) {
    if (error.code === 'EEXIST') return false;
    throw error;
  }
}

const slot = distDirs.findIndex((_, index) => claim(index));
if (slot === -1) throw Error(`Há mais arquivos de teste simultâneos do que diretórios do Next (${distDirs.length}).`);
process.env.COMPOR_TEST_NEXT_DIST_DIR = distDirs[slot];
process.on('exit', () => {
  rmSync(new URL(String(slot), run), {force: true});
  try { rmdirSync(run); } catch {}
});
