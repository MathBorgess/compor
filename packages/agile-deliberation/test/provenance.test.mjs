import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { methodology } from '../src/methodology.js';

test('fontes vendorizadas correspondem ao manifesto e commit da adaptação', async () => {
  const base = new URL('../../../third_party/google-research/agile_deliberation/', import.meta.url);
  const manifest = JSON.parse(await readFile(new URL('provenance.json', base), 'utf8'));
  assert.equal(manifest.commit, methodology.sourceCommit);
  assert.equal(manifest.license, 'Apache-2.0');
  for (const item of manifest.files) {
    const bytes = await readFile(new URL(item.file, base));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), item.sha256, item.file);
    assert.equal(createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'), item.gitBlobSha, item.file);
    if (item.file.endsWith('.py')) assert.match(bytes.toString(), /Copyright 2026 The Google Research Authors/);
  }
});
