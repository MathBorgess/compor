import { execFile, spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { readFile, writeFile, mkdir, chown, chmod, unlink } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { resolve, join } from 'node:path';
import { preflight, verifyMigrations, defaultRepoRoot } from './preflight.mjs';
export { defaultRepoRoot } from './preflight.mjs';

export const FIXTURE_JWT_SECRET = 'compor-offline-synthetic-jwt-secret-v1-only-for-tests';
export const FIXTURE_OPENAI_KEY = 'sk-compor-offline-synthetic-provider-fixture-key';
export const FIXTURE_USERS = Object.freeze({
  alice: '11111111-1111-4111-8111-111111111111',
  bob: '22222222-2222-4222-8222-222222222222',
});
const baseEnvironment = () => ({ PATH: process.env.PATH, LANG: 'C.UTF-8', HOME: '/tmp' });
const quote = value => "'" + String(value).replaceAll("'", "''") + "'";
const statePath = runDir => join(runDir, 'infra-state.json');
const delay = ms => new Promise(resolvePromise => setTimeout(resolvePromise, ms));

function command(file, args, { input = '', env = {}, timeout = 30_000 } = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = execFile(file, args, { env: { ...baseEnvironment(), ...env }, timeout, maxBuffer: 4 * 1024 * 1024, encoding: 'utf8' }, (error, stdout, stderr) => {
      if (error) {
        const failure = Error('command_failed:' + file + ':' + (error.code ?? error.signal));
        failure.stderr = stderr;
        return reject(failure);
      }
      resolvePromise(stdout.trim());
    });
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}

async function identity(pid) {
  const stat = await readFile('/proc/' + pid + '/stat', 'utf8');
  const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
  return { pid, state: fields[0], startTime: fields[19], executable: (await readFile('/proc/' + pid + '/cmdline', 'utf8')).split('\0')[0] };
}

async function sameProcess(saved) {
  try {
    const current = await identity(saved.pid);
    return current.state !== 'Z' && current.startTime === saved.startTime && current.executable === saved.executable;
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ESRCH') return false;
    throw error;
  }
}

function sqlRunner(password) {
  return text => command('psql', ['-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', '5432', '-U', 'postgres', '-d', 'compor_verify'], {
    input: text,
    env: { PGPASSWORD: password, PGCONNECT_TIMEOUT: '3' },
  });
}

async function saveState(runDir, state) {
  await writeFile(statePath(runDir), JSON.stringify(state, null, 2) + '\n', { mode: 0o600 });
}

export async function stopInfra({ runDir }) {
  const state = JSON.parse(await readFile(statePath(resolve(runDir)), 'utf8'));
  if (state.schemaVersion !== 1 || state.runDir !== resolve(runDir)) throw Error('invalid_infra_ownership_record');
  const results = [];
  const failures = [];
  try {
    if (state.postgrest && await sameProcess(state.postgrest)) {
      process.kill(state.postgrest.pid, 'SIGTERM');
      for (let i = 0; i < 50 && await sameProcess(state.postgrest); i++) await delay(100);
      if (await sameProcess(state.postgrest)) throw Error('owned_postgrest_did_not_stop');
      results.push('postgrest_stopped');
    }
  } catch (error) { failures.push(error.message); }
  try {
    if (state.postgres && await sameProcess(state.postgres)) {
      await command('gosu', ['postgres', 'pg_ctl', '-D', state.pgdata, '-m', 'fast', '-w', '-t', '10', 'stop'], { timeout: 15_000 });
      if (await sameProcess(state.postgres)) throw Error('owned_postgres_did_not_stop');
      results.push('postgres_stopped');
    }
  } catch (error) { failures.push(error.message); }
  state.status = failures.length ? 'cleanup_failed' : 'stopped';
  state.stoppedAt = new Date().toISOString();
  await saveState(resolve(runDir), state);
  const receipt = { schemaVersion: 1, status: state.status, results, failures, preserved: ['logs', 'infra-manifest.json', 'infra-preflight.json', 'database-directory'] };
  await writeFile(join(runDir, 'infra-stop.json'), JSON.stringify(receipt, null, 2) + '\n');
  if (failures.length) throw Object.assign(Error('infra_cleanup_failed'), { receipt });
  return receipt;
}

export async function startInfra({ repoRoot = defaultRepoRoot, runDir, jwtSecret = FIXTURE_JWT_SECRET, users = FIXTURE_USERS, openAiKey = FIXTURE_OPENAI_KEY } = {}) {
  if (!runDir || !/^[A-Za-z0-9_-]{32,128}$/.test(jwtSecret)) throw Error('invalid_synthetic_infra_configuration');
  if (openAiKey !== FIXTURE_OPENAI_KEY || Object.values(users).some(id => !/^[0-9a-f-]{36}$/.test(id))) throw Error('invalid_synthetic_seed');
  runDir = resolve(runDir);
  repoRoot = resolve(repoRoot);
  if (!/^\/[A-Za-z0-9_./-]+$/.test(runDir) || runDir === '/' || runDir === repoRoot) throw Error('invalid_ephemeral_run_directory');
  await mkdir(runDir, { recursive: true, mode: 0o700 });
  const report = await preflight({ repoRoot });
  await writeFile(join(runDir, 'infra-preflight.json'), JSON.stringify(report, null, 2) + '\n');
  if (report.status !== 'ready') throw Error('infra_preflight_blocked');
  const pgdata = join(runDir, 'postgres');
  const socketDir = join(runDir, 'pgsocket');
  const logs = join(runDir, 'logs');
  const adminPassword = randomBytes(24).toString('hex');
  const authenticatorPassword = randomBytes(24).toString('hex');
  const state = { schemaVersion: 1, status: 'starting', runDir, pgdata, startedAt: new Date().toISOString() };
  // Exclusive creation prevents a second supervisor adopting or resetting a run.
  await writeFile(statePath(runDir), JSON.stringify(state), { flag: 'wx', mode: 0o600 });
  let postgrestChild;
  let postgrestLog;
  try {
    await mkdir(pgdata, { mode: 0o700 });
    await mkdir(socketDir, { mode: 0o700 });
    await mkdir(logs, { mode: 0o700 });
    await chown(pgdata, 999, 999);
    await chown(socketDir, 999, 999);
    // postgres needs traversal, but no access to supervisor evidence/credentials.
    await chmod(runDir, 0o711);
    // initdb requires an empty data directory, so hold the password next to it.
    const initPassword = join(runDir, 'init-password');
    await writeFile(initPassword, adminPassword, { mode: 0o600 });
    await chown(initPassword, 999, 999);
    try {
      await command('gosu', ['postgres', 'initdb', '-D', pgdata, '--username=postgres', '--pwfile=' + initPassword, '--auth-local=scram-sha-256', '--auth-host=scram-sha-256', '--encoding=UTF8', '--locale=C.UTF-8', '--no-instructions']);
    } finally { await unlink(initPassword); }
    const pglog = join(pgdata, 'server.log');
    let startupError;
    try {
      await command('gosu', ['postgres', 'pg_ctl', '-D', pgdata, '-l', pglog, '-w', '-t', '20', '-o', "-h 127.0.0.1 -p 5432 -k " + socketDir + " -c shared_buffers=64MB -c max_connections=20 -c jit=off -c log_statement=none", 'start'], { timeout: 25_000 });
    } catch (error) { startupError = error; }
    // pg_ctl can time out after spawning postgres; still acquire its exact PID.
    // Keep its original error if ownership recording also fails.
    try {
      state.postgres = await identity(Number((await readFile(join(pgdata, 'postmaster.pid'), 'utf8')).split('\n')[0]));
      await saveState(runDir, state);
    } catch (error) {
      if (!startupError) startupError = error;
      else if (error.code !== 'ENOENT' && error.code !== 'ESRCH') startupError.ownershipError = error.message;
    }
    if (startupError) throw startupError;
    await command('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', '5432', '-U', 'postgres', '-d', 'postgres'], { input: 'create database compor_verify;', env: { PGPASSWORD: adminPassword } });
    const sql = sqlRunner(adminPassword);
    const inventory = await verifyMigrations(repoRoot);
    const baseline = await readFile(new URL('./baseline.sql', import.meta.url), 'utf8');
    const migrations = [];
    for (const item of inventory.migrations) migrations.push(await readFile(join(repoRoot, 'supabase/migrations', item.name), 'utf8'));
    await sql("begin; set local compor.verification_baseline='synthetic-offline-v1';\n" + baseline + '\n' + migrations.join('\n') + '\ncommit;');
    await sql('begin; alter role authenticator password ' + quote(authenticatorPassword) + ';\n' +
      'insert into auth.users(id) values ' + Object.values(users).map(id => '(' + quote(id) + ')').join(',') + ';\n' +
      'insert into vault.synthetic_secrets(name,decrypted_secret) values (\'COMPOR_CIN_OPENAI\',' + quote(openAiKey) + ');\ncommit;');
    const postgresUrl = 'postgresql://postgres:' + adminPassword + '@127.0.0.1:5432/compor_verify';
    const configPath = join(runDir, 'postgrest.conf');
    const config = [
      'db-uri = "postgresql://authenticator:' + authenticatorPassword + '@127.0.0.1:5432/compor_verify"',
      'db-schemas = "public,storage"', 'db-anon-role = "anon"', 'db-pool = 4',
      'db-channel-enabled = false', 'db-config = false', 'db-extra-search-path = "public"',
      'server-host = "127.0.0.1"', 'server-port = 3001', 'admin-server-host = "127.0.0.1"', 'admin-server-port = 3002',
      'jwt-secret = "' + jwtSecret + '"', 'log-level = "error"',
    ].join('\n') + '\n';
    await writeFile(configPath, config, { mode: 0o600 });
    postgrestLog = createWriteStream(join(logs, 'postgrest.log'), { mode: 0o600 });
    postgrestChild = spawn('postgrest', [configPath], { env: baseEnvironment(), stdio: ['ignore', 'pipe', 'pipe'] });
    postgrestChild.stdout.pipe(postgrestLog, { end: false });
    postgrestChild.stderr.pipe(postgrestLog, { end: false });
    await new Promise((resolvePromise, reject) => { postgrestChild.once('spawn', resolvePromise); postgrestChild.once('error', reject); });
    state.postgrest = await identity(postgrestChild.pid);
    await saveState(runDir, state);
    const until = Date.now() + 20_000;
    for (;;) {
      if (postgrestChild.exitCode !== null) throw Error('postgrest_exited_before_ready');
      try {
        const health = await fetch('http://127.0.0.1:3002/ready', { signal: AbortSignal.timeout(1000) });
        if (health.status === 200) break;
      } catch {}
      if (Date.now() >= until) throw Error('postgrest_readiness_timeout');
      await delay(100);
    }
    const manifest = { schemaVersion: 1, status: 'ready', profile: 'synthetic-supabase-boundary', postgresVersion: await sql('show server_version;'), postgrestVersion: await command('postgrest', ['--version']), ports: { postgres: 5432, postgrest: 3001, postgrestHealth: 3002 }, users, ...inventory, omissions: ['Supabase Auth service and OAuth', 'Supabase Storage service', 'Vault encryption', 'managed infrastructure'], startedAt: state.startedAt, readyAt: new Date().toISOString() };
    state.status = 'ready';
    await saveState(runDir, state);
    await writeFile(join(runDir, 'infra-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    return {
      manifest, postgresUrl, postgrestUrl: 'http://127.0.0.1:3001', sql,
      async close() {
        const result = await stopInfra({ runDir });
        postgrestLog.end();
        return result;
      },
    };
  } catch (error) {
    if (postgrestChild && !state.postgrest && postgrestChild.exitCode === null) postgrestChild.kill('SIGTERM');
    try { await stopInfra({ runDir }); } catch (cleanupError) { error.cleanupError = cleanupError.message; }
    postgrestLog?.end();
    throw error;
  }
}
