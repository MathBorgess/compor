import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectId = 'prj_48C8lO4W6WdEMScyAfZRSnkvN6QS';
export const previewRef = 'diagnostico/carrossel-linux-x64-1a2e261';
const appDir = fileURLToPath(new URL('../', import.meta.url));
const routeTrace = 'server/pages/api/studio/carousel/render.js.nft.json';
const requiredPaths = [
  'node_modules/@sparticuz/chromium/bin/chromium.br',
  'node_modules/@sparticuz/chromium/bin/al2023.tar.br',
  'node_modules/@sparticuz/chromium/bin/fonts.tar.br',
  'node_modules/@sparticuz/chromium/bin/swiftshader.tar.br',
  'node_modules/playwright-core-carousel/package.json',
  'node_modules/sharp/package.json',
  'public/studio/dm-sans-regular.ttf',
  'public/studio/dm-sans-bold.ttf',
];

export function selectedPreview(env) {
  return env.VERCEL === '1' && env.VERCEL_ENV === 'preview' &&
    env.VERCEL_PROJECT_ID === projectId && env.VERCEL_GIT_COMMIT_REF === previewRef;
}

export function verifyCarouselTrace(directory, distDir = '.next') {
  const manifestPath = resolve(directory, distDir, routeTrace);
  const { files } = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (!Array.isArray(files) || !files.every(file => typeof file === 'string' && file.length > 0)) {
    throw Error('Invalid Next output file trace for carousel render');
  }
  const traced = new Set(files.map(file => resolve(dirname(manifestPath), file)));
  const paths = requiredPaths.map(file => resolve(directory, file));
  const missing = requiredPaths.filter((_, index) => !traced.has(paths[index]));
  for (const [directoryName, filename] of [
    ['node_modules/@img/sharp-linux-x64/lib', /^sharp-linux-x64(?:-[\d.]+)?\.node$/],
    ['node_modules/@img/sharp-libvips-linux-x64/lib', /\.so(?:\.\d+)*$/],
  ]) {
    const prefix = resolve(directory, directoryName) + sep;
    const match = [...traced].find(file => file.startsWith(prefix) && filename.test(file.slice(prefix.length)));
    if (match) paths.push(match);
    else missing.push(directoryName);
  }
  if (missing.length) throw Error('Carousel route trace missing: ' + missing.join(', '));

  let requiredAssetBytes = 0;
  for (const file of paths) {
    const info = statSync(file);
    if (!info.isFile() || info.size === 0) throw Error('Required carousel build asset must be a non-empty file: ' + file);
    requiredAssetBytes += info.size;
  }
  return { traceEntries: traced.size, checkedAssets: paths.length, requiredAssetBytes };
}

if (selectedPreview(process.env)) {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA;
  if (!/^[0-9a-f]{40}$/.test(sha ?? '')) throw Error('Native carousel build probe requires a Git commit SHA');
  if (process.platform !== 'linux' || process.arch !== 'x64') {
    throw Error('Native carousel build probe requires linux/x64');
  }
  const trace = verifyCarouselTrace(appDir, process.env.COMPOR_TEST_NEXT_DIST_DIR || '.next');
  console.log('[carousel-native-preview]', JSON.stringify({
    sha, ref: previewRef, deployment: process.env.VERCEL_DEPLOYMENT_ID ?? null,
    platform: process.platform, arch: process.arch, node: process.version, ...trace,
  }));

  // A private empty temp directory forces extraction from the pinned package.
  const runtimeTmp = mkdtempSync(join(tmpdir(), 'compor-carousel-native-'));
  try {
    // The test child gets the packaged browser path and no project credentials.
    const result = spawnSync(process.execPath, [
      '--import', 'tsx', '--test', '--test-isolation=none',
      'test/carousel-runtime-browser.test.mjs',
      '../../packages/carousel-renderer/test/plan.test.mjs',
      '../../packages/carousel-renderer/test/contrast-coverage.test.mjs',
    ], {
      cwd: appDir,
      env: { PATH: process.env.PATH ?? '/usr/bin:/bin', VERCEL: '1', NODE_ENV: 'production', TMPDIR: runtimeTmp },
      stdio: 'inherit',
      timeout: 60_000,
    });
    if (result.error) throw result.error;
    if (result.status !== 0) throw Error('Packaged Chromium build canary failed: ' + (result.signal ?? result.status));
    console.log('[carousel-native-preview] packaged runtime canary passed');
  } finally {
    rmSync(runtimeTmp, { recursive: true, force: true });
  }
}
