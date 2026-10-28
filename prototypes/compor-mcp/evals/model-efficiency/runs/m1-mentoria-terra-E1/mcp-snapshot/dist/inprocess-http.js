import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { createComporServer } from './server.js';
/**
 * Test adapter only: handles each MCP HTTP request in process without a socket.
 * It does not authenticate users and must not be exposed as an HTTP endpoint.
 */
export async function fetchInProcess(input, init) {
    const request = new Request(input, init);
    if (request.url !== 'https://compor.invalid/mcp') {
        throw new Error('Endereço inválido para o transporte de teste.');
    }
    const server = createComporServer();
    const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
    });
    try {
        await server.connect(transport);
        const response = await transport.handleRequest(request);
        // Buffer before cleanup: this prototype uses JSON response mode, not streaming.
        const body = response.body ? await response.text() : null;
        return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
    }
    finally {
        await server.close();
    }
}
