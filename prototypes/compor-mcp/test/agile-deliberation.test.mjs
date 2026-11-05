import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

test('processo stdio executa deliberação e refinamento sem gerar imagem nem afirmar preferência', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'compor-deliberation-'));
  const client = new Client({ name: 'agile-test', version: '1' });
  const transport = new StdioClientTransport({ command: process.execPath, args: ['dist/stdio.js'], cwd: fileURLToPath(new URL('..', import.meta.url)), env: { COMPOR_PROFILE_DIR: directory }, stderr: 'pipe' });
  try {
    await client.connect(transport);
    const criterion = { id: 'c1', viewpoint: 'creator', dimension: 'visual', statement: 'Natural', ambiguity: 'Foto de estúdio pode parecer natural?', example: { description: 'Luz de janela' }, counterexample: { description: 'Flash frontal' } };
    const result = await client.callTool({ name: 'prepare_deliberation', arguments: { objective: 'Divulgação', criteria: [criterion] } });
    assert.equal(result.isError, undefined);
    assert.equal(result.structuredContent.next.criterionId, 'c1');
    assert.equal(result.structuredContent.persistsData, false);
    const refinement = await client.callTool({ name: 'propose_criterion_refinement', arguments: { criterion, clarification: 'Estúdio pode usar luz natural', proposedStatement: 'Iluminação suave sem flash frontal' } });
    assert.equal(refinement.structuredContent.accepted, false);
    assert.equal(refinement.structuredContent.before.statement, 'Natural');
    assert.equal(refinement.structuredContent.proposed.statement, 'Iluminação suave sem flash frontal');
    assert.match(client.getInstructions(), /simulação da persona não é evidência/);
  } finally { await client.close(); await rm(directory, { recursive: true, force: true }); }
});
