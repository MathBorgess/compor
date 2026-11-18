import { authConfig } from '../../../lib/supabase';
import { createConfiguredAgentMcpScope } from '../../../lib/agent-mcp-scope.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handle(request:Request) {
 const scope=createConfiguredAgentMcpScope(authConfig());
 if(!scope)return new Response('Serviço indisponível.',{status:503,headers:{'Cache-Control':'no-store'}});
 try {return await scope.handle(request);} catch {return new Response('Serviço indisponível.',{status:503,headers:{'Cache-Control':'no-store'}});}
}
export const GET=handle;
export const POST=handle;
export const DELETE=handle;
