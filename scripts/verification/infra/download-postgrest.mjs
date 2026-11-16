// Build-time only. Runtime preflight never downloads or installs a dependency.
import { readFile, writeFile, chmod, unlink, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const manifest = JSON.parse(await readFile(new URL('./dependencies.json', import.meta.url), 'utf8'));
const asset = manifest.postgrest.assets[process.arch];
if (process.platform !== 'linux' || !asset) throw Error('unsupported_postgrest_platform');
const response = await fetch(asset.url, { signal: AbortSignal.timeout(60_000) });
if (!response.ok) throw Error('postgrest_download_failed:' + response.status);
const bytes = Buffer.from(await response.arrayBuffer());
if (bytes.length !== asset.bytes || createHash('sha256').update(bytes).digest('hex') !== asset.sha256) throw Error('postgrest_asset_integrity_failed');
const archive = join(tmpdir(), 'compor-postgrest-' + process.pid + '.tar.xz');
await writeFile(archive, bytes, { flag: 'wx', mode: 0o600 });
try {
  const members = execFileSync('tar', ['-tJf', archive], { encoding: 'utf8' }).trim().split('\n');
  if (members.length !== 1 || !['postgrest', './postgrest'].includes(members[0])) throw Error('unexpected_postgrest_archive');
  execFileSync('tar', ['-xJf', archive, '-C', '/usr/local/bin', '--no-same-owner'], { stdio: 'inherit' });
  await chmod('/usr/local/bin/postgrest', 0o755);
  const version = execFileSync('/usr/local/bin/postgrest', ['--version'], { encoding: 'utf8' }).trim();
  if (!version.includes(' ' + manifest.postgrest.version)) throw Error('unexpected_postgrest_version');
  const licenseResponse = await fetch(manifest.postgrest.license.url, { signal: AbortSignal.timeout(15_000) });
  if (!licenseResponse.ok) throw Error('postgrest_license_download_failed');
  const license = Buffer.from(await licenseResponse.arrayBuffer());
  if (createHash('sha256').update(license).digest('hex') !== manifest.postgrest.license.sha256) throw Error('postgrest_license_integrity_failed');
  await mkdir('/usr/local/share/licenses/postgrest', { recursive: true });
  await writeFile('/usr/local/share/licenses/postgrest/LICENSE', license);
  process.stdout.write(JSON.stringify({ status: 'verified', version, assetSha256: asset.sha256 }) + '\n');
} finally { await unlink(archive); }
