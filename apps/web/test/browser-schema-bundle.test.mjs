import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { createExplorationPrompt } from '@compor/agile-deliberation/exploration';
import { assessReadiness } from '@compor/agile-deliberation/readiness';
import { versionsSchema } from '../lib/studio-piece-contract.ts';
import nextConfig from '../next.config.mjs';

const webRoot = fileURLToPath(new URL('../', import.meta.url));
const studioSchema = path.join(webRoot, 'lib/schema.ts');
const agileSchema = fileURLToPath(new URL('schema.js', import.meta.resolve('@compor/agile-deliberation/readiness')));
const requireFromWeb = createRequire(new URL('../next.config.mjs', import.meta.url));

async function buildBrowserContracts() {
  const loaded = new Set();
  const result = await build({
    stdin: {
      resolveDir: webRoot,
      contents: `
        export { createExplorationPrompt } from '@compor/agile-deliberation/exploration';
        export { assessReadiness } from '@compor/agile-deliberation/readiness';
        export { versionsSchema } from './lib/studio-piece-contract.ts';
        export { string as studioString } from './lib/schema.ts';
        export { string as agileString } from ${JSON.stringify(agileSchema)};
      `,
    },
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'esm',
    plugins: [{
      name: 'studio-schema-rules',
      setup(builder) {
        builder.onLoad({ filter: /schema\.(?:js|ts)$/ }, async ({ path: file }) => {
          if (file !== studioSchema && file !== agileSchema) return;
          const rule = nextConfig.turbopack.rules[path.basename(file)];
          const entry = rule.loaders[0];
          const { loader, options = {} } = typeof entry === 'string' ? { loader: entry } : entry;
          const context = { resourcePath: file, getOptions: () => options, addDependency() {} };
          const contents = requireFromWeb(loader).call(context, await readFile(file, 'utf8'));
          loaded.add(file);
          return { contents, loader: 'js', resolveDir: path.dirname(file) };
        });
      },
    }],
  });
  assert.deepEqual(loaded, new Set([studioSchema, agileSchema]));
  return import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].contents).toString('base64'));
}

function validationError(run) {
  try {
    run();
  } catch (error) {
    assert.ok(error instanceof Error);
    assert.ok(error.issues.length > 0);
    return { name: error.name, message: error.message, issues: error.issues };
  }
  assert.fail('O contrato deveria rejeitar a entrada');
}

test('o bundle do navegador compartilha os construtores e preserva os contratos do estúdio e do Agile', async () => {
  const browser = await buildBrowserContracts();
  assert.equal(typeof browser.studioString, 'function');
  assert.equal(browser.studioString, browser.agileString);

  const exploration = { offer: ' Oficina ', audience: '', goal: '', direction: '', accepted: [], rejected: [], sequence: 0 };
  assert.deepEqual(browser.createExplorationPrompt(exploration), createExplorationPrompt(exploration));
  assert.deepEqual(browser.assessReadiness({}), assessReadiness({}));
  const previousVersions = { versions: [], extra: true };
  const restored = browser.versionsSchema.parse(previousVersions);
  assert.deepEqual(restored, { versions: [], posts: [] });
  assert.deepEqual(restored, versionsSchema.parse(previousVersions));

  const invalidPrompt = { ...exploration, accepted: [false], sequence: -1 };
  assert.deepEqual(validationError(() => browser.createExplorationPrompt(invalidPrompt)),
    validationError(() => createExplorationPrompt(invalidPrompt)));
  const invalidReadiness = { references: [{ id: null }], explicitRequest: 'sim' };
  assert.deepEqual(validationError(() => browser.assessReadiness(invalidReadiness)),
    validationError(() => assessReadiness(invalidReadiness)));
});
