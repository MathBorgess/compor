import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createPreviewServer } from './preview_server.mjs';

// All paths/hashes come from the experiment host, never MCP arguments.
const server = await createPreviewServer({
  contextPath: process.env.COMPOR_PREVIEW_CONTEXT,
  contextSha256: process.env.COMPOR_PREVIEW_CONTEXT_SHA256,
  python: process.env.COMPOR_PREVIEW_PYTHON,
  workerPath: process.env.COMPOR_PREVIEW_WORKER,
  workerSha256: process.env.COMPOR_PREVIEW_WORKER_SHA256,
});
await server.connect(new StdioServerTransport());
