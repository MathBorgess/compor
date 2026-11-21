import { createImageToolReservationStore } from '@compor/agents-api/image-tool-reservation';
import { resolveSupabaseActor, ownsSupabaseProject } from '../../../../../lib/agent-auth.ts';
import { authClient, authConfig } from '../../../../../lib/supabase.ts';
import * as z from '../../../../../lib/schema.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.strictObject({ projectId: z.uuid() });

export async function POST(request: Request) {
  const config = authConfig();
  if (!config || request.headers.get('origin') !== config.app) return Response.json({ screen: 'none' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') ?? '')) return Response.json({ screen: 'none' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  let projectId: string;
  try { projectId = bodySchema.parse(await request.json()).projectId; } catch { return Response.json({ screen: 'none' }, { status: 400, headers: { 'Cache-Control': 'no-store' } }); }
  try {
    const actor = await resolveSupabaseActor(await authClient(config));
    if (!actor || !await ownsSupabaseProject({ config, actor, projectId })) return Response.json({ screen: 'none' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
    const store = createImageToolReservationStore({ url: config.service, anonKey: config.key });
    if (!store.getAccountHold) return Response.json({ screen: 'none' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
    return Response.json(await store.getAccountHold({ actor, projectId }), { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ screen: 'none' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
