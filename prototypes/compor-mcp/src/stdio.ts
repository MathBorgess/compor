import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createComporServer } from './server.js';

const server = createComporServer();
await server.connect(new StdioServerTransport());
