import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { createComporServer, type ComporServerOptions } from './server.js';
import { EphemeralReferenceStore } from './staging/ephemeral_store.js';
import { createPhoenixHyperparams } from './phoenix_engine/config/hyperparams.js';
import { PhoenixMemoryStore } from './phoenix_engine/services/memory_store.js';
import { ProfileLedger } from './phoenix_engine/services/profile_ledger.js';
import { randomUUID } from 'node:crypto';

export function createStreamableHttpHandler(
  serverOptions: ComporServerOptions = {},
  transportOptions: { enableJsonResponse?: boolean; allowedUrl?: string } = {},
) {
  const enableJsonResponse = transportOptions.enableJsonResponse ?? true;
  const allowedUrl = transportOptions.allowedUrl ?? 'https://compor.invalid/mcp';
  const phoenixActorId = serverOptions.phoenixActorId ?? `local_${randomUUID()}`;
  const phoenixProfileSession = serverOptions.phoenixProfileSession ?? { ledger: new ProfileLedger(phoenixActorId) };
  const sessionReferenceStore = serverOptions.referenceStore ?? new EphemeralReferenceStore();
  const sessionPhoenixMemoryStore =
    serverOptions.phoenixMemoryStore ??
    new PhoenixMemoryStore({ hp: createPhoenixHyperparams(serverOptions.phoenixHyperparams) });

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
      phoenixMemoryStore: sessionPhoenixMemoryStore,
      phoenixActorId,
      phoenixProfileSession,
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

/**
 * One-shot test adapter. For a stateful logical client use createStreamableHttpHandler.
 * It does not authenticate users and must not be exposed as an unauthenticated public HTTP endpoint.
 */
export async function fetchInProcess(
  input: RequestInfo | URL,
  init?: RequestInit,
  serverOptions?: ComporServerOptions,
): Promise<Response> {
  const handler = createStreamableHttpHandler(
    {
      ...serverOptions,
    },
    {
      enableJsonResponse: true,
      allowedUrl: 'https://compor.invalid/mcp',
    },
  );
  return handler(input, init);
}
