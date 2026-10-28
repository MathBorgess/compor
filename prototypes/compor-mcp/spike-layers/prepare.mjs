import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createComporServer } from '../dist/server.js';
let payload = '';
for await (const chunk of process.stdin) payload += chunk;
const server = createComporServer();
const client = new Client({ name: 'synthetic-layer-spike', version: '1.0.0' });
const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
try {
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  const response = await client.callTool({ name: 'prepare_layered_creative', arguments: { piece: JSON.parse(payload) } });
  if (response.isError || !response.structuredContent) throw new Error(JSON.stringify(response));
  process.stdout.write(JSON.stringify(response.structuredContent));
} finally {
  await client.close();
  await server.close();
}
