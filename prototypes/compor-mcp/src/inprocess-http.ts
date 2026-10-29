import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { createComporServer, type ComporServerOptions } from './server.js';
import { EphemeralReferenceStore } from './staging/ephemeral_store.js';

export function createStreamableHttpHandler(
  serverOptions: ComporServerOptions = {},
  transportOptions: { enableJsonResponse?: boolean; allowedUrl?: string } = {},
) {
  const enableJsonResponse = transportOptions.enableJsonResponse ?? true;
  const allowedUrl = transportOptions.allowedUrl ?? 'https://compor.invalid/mcp';
  const sessionReferenceStore = serverOptions.referenceStore ?? new EphemeralReferenceStore();

  return async function handleStreamableHttp(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const request = new Request(input, init);
    if (allowedUrl && request.url !== allowedUrl) {
      throw new Error('Endereço inválido para o transporte de teste.');
    }
    const server = createComporServer({
      ...serverOptions,
      referenceStore: sessionReferenceStore,
    });
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse,
    });
    try {
      await server.connect(transport);
      const response = await transport.handleRequest(request);
      if (enableJsonResponse) {
        const body = response.body ? await response.text() : null;
        return new Response(body, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        });
      }
      return response;
    } finally {
      if (enableJsonResponse) {
        await server.close();
      }
    }
  };
}

const defaultFetchInProcessStore = new EphemeralReferenceStore();

/**
 * Test adapter: handles each MCP Streamable HTTP request in process without a socket,
 * retaining reference state across sequential requests for the logical client.
 * It does not authenticate users and must not be exposed as an unauthenticated public HTTP endpoint.
 */
export async function fetchInProcess(
  input: RequestInfo | URL,
  init?: RequestInit,
  serverOptions?: ComporServerOptions,
): Promise<Response> {
  const effectiveStore = serverOptions?.referenceStore ?? defaultFetchInProcessStore;
  const handler = createStreamableHttpHandler(
    { ...serverOptions, referenceStore: effectiveStore },
    {
      enableJsonResponse: true,
      allowedUrl: 'https://compor.invalid/mcp',
    },
  );
  return handler(input, init);
}
