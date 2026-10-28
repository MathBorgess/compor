import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createComporServer } from './server.js';
import { parseGuidanceVariant } from './guidance.js';
// The evaluation runner selects this process-level arm; tools cannot change it.
const guidance = parseGuidanceVariant(process.env.COMPOR_MCP_GUIDANCE);
const server = createComporServer({ guidance });
await server.connect(new StdioServerTransport());
