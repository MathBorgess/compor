import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createRemoteMcpHandler } from '../src/index.js';

test('MCP autenticado esclarece tensão, propõe revisão e não mantém contexto entre chamadas', async () => {
  let authorized = true;
  const handle = createRemoteMcpHandler({ authenticate: async () => authorized ? { userId: 'creator' } : null });
  const client = new Client({ name: 'deliberation-test', version: '1' });
  const transport = new StreamableHTTPClientTransport(new URL('https://compor.example/mcp'), {
    requestInit: { headers: { Authorization: 'Bearer synthetic' } },
    fetch: (input, init) => handle(new Request(input, init)),
  });
  try {
    await client.connect(transport);
    const criterion = { id: 'c1', viewpoint: 'recipient', dimension: 'message', statement: 'Mensagem acolhedora', tension: 'Poesia pode esconder a oferta', example: { description: 'Convite com atividade e data' }, counterexample: { description: 'Slogan sem dizer qual é a atividade' } };
    const result = await client.callTool({ name: 'prepare_deliberation', arguments: { objective: 'Divulgar oficina', criteria: [criterion] } });
    assert.equal(result.isError, undefined);
    assert.equal(result.structuredContent.next.decisionOwner, 'creator');
    assert.equal(result.structuredContent.next.stage, 'reflect');
    assert.equal(result.structuredContent.criteria[0].provenance, 'hypothesis');
    const proposal = await client.callTool({ name: 'propose_criterion_refinement', arguments: { criterion, clarification: 'Quero convidar sem esconder a atividade', proposedStatement: 'Convite acolhedor com atividade explícita' } });
    assert.equal(proposal.structuredContent.accepted, false);
    assert.equal(proposal.structuredContent.before.statement, criterion.statement);
    const fresh = await client.callTool({ name: 'prepare_deliberation', arguments: { objective: 'Outro projeto' } });
    assert.deepEqual(fresh.structuredContent.criteria, []);
    const invalid = await client.callTool({ name: 'prepare_deliberation', arguments: { objective: 'Oficina', criteria: [criterion, criterion] } });
    assert.equal(invalid.isError, true);
    authorized = false;
    await assert.rejects(() => client.callTool({ name: 'prepare_deliberation', arguments: { objective: 'Oficina' } }));
  } finally { await client.close(); }
});
