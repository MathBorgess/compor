import type {AuthClient,AuthConfig} from './supabase.ts';
export interface Actor {userId:string;token:string}
export interface OwnershipInput {config:AuthConfig;actor:Actor;projectId:string;fetch?:typeof fetch}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The JWT read from cookies is not trusted until Supabase verifies that same token. */
export async function resolveSupabaseActor(client:Pick<AuthClient,"auth">) {
  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  if (sessionError) throw new Error('session unavailable');
  const token = sessionData?.session?.access_token;
  if (!token) return null;
  const { data, error } = await client.auth.getUser(token);
  if (error?.status === 401 || error?.status === 403) return null;
  if (error) throw new Error('identity unavailable');
  if (!uuid.test(data?.user?.id ?? '')) return null;
  return { userId: data.user.id, token };
}

/** Query as the user: neither a service role nor a locally decoded JWT grants ownership. */
export async function ownsSupabaseProject({ config, actor, projectId, fetch: fetchApi = fetch }:OwnershipInput) {
  if (!uuid.test(actor?.userId ?? '') || !uuid.test(projectId ?? '')) return false;
  const endpoint = new URL('/rest/v1/projects', config.service);
  endpoint.searchParams.set('select', 'id,owner_id');
  endpoint.searchParams.set('id', `eq.${projectId}`);
  endpoint.searchParams.set('owner_id', `eq.${actor.userId}`);
  endpoint.searchParams.set('limit', '1');
  const result = await fetchApi(endpoint, { headers: { apikey: config.key, authorization: `Bearer ${actor.token}` }, redirect: 'error', signal: AbortSignal.timeout(5000) });
  if (!result.ok) throw new Error('project service unavailable');
  const rows = await result.json();
  if (!Array.isArray(rows) || rows.length > 1) throw new Error('invalid project response');
  if (!rows.length) return false;
  return rows[0]?.id === projectId && rows[0]?.owner_id === actor.userId;
}

/** Recheck the exact version under the verified user's token on each sensitive operation. */
export async function ownsSupabaseVersion({config,actor,projectId,pieceId,version,fetch:fetchApi=fetch}:OwnershipInput & {pieceId:string;version:number}) {
 if(!uuid.test(actor?.userId??'') || typeof actor?.token!=='string' || !/^[^\s]{1,8192}$/.test(actor.token) || !uuid.test(projectId??'') || !uuid.test(pieceId??'') || !Number.isSafeInteger(version) || version<1 || version>2147483647)return false;
 const endpoint=new URL('/rest/v1/piece_versions',config.service);
 for(const [name,value] of Object.entries({select:'project_id,piece_id,version,projects!inner(owner_id)',project_id:`eq.${projectId}`,piece_id:`eq.${pieceId}`,version:`eq.${version}`,'projects.owner_id':`eq.${actor.userId}`,limit:'1'}))endpoint.searchParams.set(name,value);
 const result=await fetchApi(endpoint,{headers:{apikey:config.key,authorization:`Bearer ${actor.token}`},redirect:'error',signal:AbortSignal.timeout(5000)});
 if(!result.ok)throw Error('version service unavailable');
 const rows=await result.json();if(!Array.isArray(rows)||rows.length>1)throw Error('invalid version response');
 return rows.length===1 && rows[0]?.project_id===projectId && rows[0]?.piece_id===pieceId && rows[0]?.version===version && rows[0]?.projects?.owner_id===actor.userId;
}
