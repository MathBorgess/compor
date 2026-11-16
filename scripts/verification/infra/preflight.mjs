import { execFileSync } from 'node:child_process';
import { access, readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { networkInterfaces } from 'node:os';
import { connect } from 'node:net';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const defaultRepoRoot = fileURLToPath(new URL('../../../', import.meta.url));
export const digest = bytes => createHash('sha256').update(bytes).digest('hex');

export async function verifyMigrations(repoRoot = defaultRepoRoot) {
  const expected = JSON.parse(await readFile(new URL('./migrations.json', import.meta.url), 'utf8'));
  const directory = resolve(repoRoot, 'supabase/migrations');
  const names = (await readdir(directory)).filter(name => name.endsWith('.sql')).sort();
  if (JSON.stringify(names) !== JSON.stringify(expected.migrations.map(item => item.name))) throw Error('migration_inventory_changed');
  const migrations = [];
  for (const item of expected.migrations) {
    const bytes = await readFile(resolve(directory, item.name));
    if (digest(bytes) !== item.sha256) throw Error('migration_digest_mismatch:' + item.name);
    migrations.push({ ...item, bytes: bytes.length });
  }
  const baseline = await readFile(new URL('./baseline.sql', import.meta.url));
  if (digest(baseline) !== expected.baselineSha256) throw Error('baseline_digest_mismatch');
  return { baselineSha256: expected.baselineSha256, migrations };
}

export function onlyLoopback(interfaces) {
  return Object.values(interfaces).every(entries => !entries || entries.every(entry => entry.internal === true));
}

export async function proveDeniedEgress() {
  if (!onlyLoopback(networkInterfaces())) throw Error('non_loopback_network_present');
  return new Promise((resolvePromise, reject) => {
    // TEST-NET-3: no real external service is contacted; a route must not exist.
    const socket = connect({ host: '203.0.113.1', port: 443 });
    const timer = setTimeout(() => { socket.destroy(); reject(Error('egress_denial_inconclusive')); }, 1500);
    socket.once('connect', () => { clearTimeout(timer); socket.destroy(); reject(Error('egress_not_denied')); });
    socket.once('error', error => {
      clearTimeout(timer);
      if (!['ENETUNREACH', 'EHOSTUNREACH'].includes(error.code)) return reject(Error('egress_denial_inconclusive:' + error.code));
      resolvePromise({ status: 'denied', code: error.code, target: '203.0.113.1:443' });
    });
  });
}

export async function preflight({ repoRoot = defaultRepoRoot } = {}) {
  const dependencies = JSON.parse(await readFile(new URL('./dependencies.json', import.meta.url), 'utf8'));
  const checks = [];
  const record = async (name, fn) => {
    try { checks.push({ name, status: 'passed', value: await fn() }); }
    catch (error) { checks.push({ name, status: 'failed', error: error.message }); }
  };
  await record('linux_container', async () => {
    if (process.platform !== 'linux' || ![0].includes(process.getuid?.())) throw Error('requires_linux_root_supervisor');
    await access('/.dockerenv');
    return { platform: process.platform, arch: process.arch };
  });
  await record('node', () => {
    if (process.versions.node !== dependencies.node.version) throw Error('expected_node_' + dependencies.node.version);
    return process.version;
  });
  for (const [name, command, version] of [
    ['postgres', 'postgres', dependencies.postgres.version],
    ['psql', 'psql', dependencies.postgres.version],
    ['postgrest', 'postgrest', dependencies.postgrest.version],
  ]) await record(name, () => {
    const value = execFileSync(command, ['--version'], { encoding: 'utf8', timeout: 3000, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    if (!value.includes(' ' + version)) throw Error('unexpected_' + name + '_version');
    return value;
  });
  for (const command of ['initdb', 'pg_ctl', 'gosu', 'openssl']) await record(command, () => {
    return execFileSync(command, [command === 'openssl' ? 'version' : '--version'], { encoding: 'utf8', timeout: 3000, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  });
  await record('migrations', () => verifyMigrations(repoRoot));
  await record('next_dependency', async () => {
    const value = JSON.parse(await readFile(resolve(repoRoot, 'apps/web/node_modules/next/package.json'), 'utf8'));
    return { version: value.version };
  });
  await record('network', async () => {
    if (process.platform !== 'linux') throw Error('network_proof_requires_linux');
    return proveDeniedEgress();
  });
  return { schemaVersion: 1, status: checks.every(item => item.status === 'passed') ? 'ready' : 'blocked', checks };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = await preflight({ repoRoot: process.argv[2] ? resolve(process.argv[2]) : defaultRepoRoot });
  process.stdout.write(JSON.stringify(result) + '\n');
  if (result.status !== 'ready') process.exitCode = 1;
}
