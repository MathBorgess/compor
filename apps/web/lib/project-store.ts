import {z} from 'zod';
import {projectSchema, type StoreOptions,type StoreContext,type ProjectMutation} from './web-contracts.ts';
import { createSupabaseProjectStore } from '@compor/remote-mcp';
const integer = (value:unknown):value is number => typeof value==='number' && Number.isSafeInteger(value) && value > 0 && value <= 2147483647;
export function createWebProjectStore({ url, anonKey, fetchImpl = fetch }:StoreOptions) {
  createSupabaseProjectStore({ url, anonKey, fetchImpl });
  const project = (value:unknown) => {
    const row=projectSchema.parse(value);
    if (typeof row?.id !== 'string' || typeof row.title !== 'string' || typeof row.created_at !== 'string' || !integer(row.revision)) throw Error('invalid project');
    return { id: row.id, title: row.title, created_at: row.created_at, revision: row.revision };
  };
  async function request(context:StoreContext, title?:string) {
    const endpoint = new URL('/rest/v1/projects', url);
    endpoint.searchParams.set('select', 'id,owner_id,title,created_at,revision');
    if (title === undefined) {endpoint.searchParams.set('owner_id', `eq.${context.actor.userId}`);endpoint.searchParams.set('deleted_at','is.null');}
    const response = await fetchImpl(endpoint, { method: title === undefined ? 'GET' : 'POST', headers: { apikey: anonKey, authorization: `Bearer ${context.token}`, 'content-type': 'application/json', prefer: 'return=representation' }, ...(title === undefined ? {} : { body: JSON.stringify({ title }) }), redirect: 'error', signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw Error('unavailable');
    const rows = await response.json();
    if (!Array.isArray(rows) || rows.some(row => row?.owner_id !== context.actor.userId)) throw Error('invalid response');
    return rows.map(project);
  }
  return {
    async remove(context:StoreContext,{projectId,expectedRevision}:{projectId:string;expectedRevision:number}) {
      const response=await fetchImpl(new URL('/rest/v1/rpc/delete_project_from_list',url),{method:'POST',headers:{apikey:anonKey,authorization:`Bearer ${context.token}`,'content-type':'application/json'},body:JSON.stringify({p_project_id:projectId,p_expected_revision:expectedRevision}),redirect:'error',signal:AbortSignal.timeout(5000)});
      if(!response.ok)throw Error('unavailable');
      const result=z.discriminatedUnion('status',[z.strictObject({status:z.literal('deleted'),projectId:z.string().uuid()}),z.strictObject({status:z.literal('not_found')}),z.strictObject({status:z.literal('conflict'),currentRevision:z.number().int().positive()})]).parse(await response.json());
      if(result.status==='deleted'&&result.projectId!==projectId)throw Error('invalid response');
      return result;
    },
    list: (context:StoreContext) => request(context),
    async create(context:StoreContext, title:string) {
      const rows = await request(context, title);
      if (rows.length !== 1) throw Error('invalid response');
      return rows[0];
    },
    async rename(context:StoreContext, { projectId, title, expectedRevision }: {projectId:string;title:string;expectedRevision:number}):Promise<ProjectMutation> {
      const response = await fetchImpl(new URL('/rest/v1/rpc/rename_project', url), { method: 'POST', headers: { apikey: anonKey, authorization: `Bearer ${context.token}`, 'content-type': 'application/json' }, body: JSON.stringify({ p_project_id: projectId, p_title: title, p_expected_revision: expectedRevision }), redirect: 'error', signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw Error('unavailable');
      const result = z.object({status:z.string(),currentRevision:z.number().optional(),project:projectSchema.optional()}).parse(await response.json());
      if (result?.status === 'not_found') return { status: 'not_found' };
      if (result?.status === 'conflict' && integer(result.currentRevision)) return { status: 'conflict', currentRevision: result.currentRevision };
      if (result?.status !== 'renamed' || result.project?.id !== projectId || result.project.title !== title || result.project.revision !== expectedRevision + 1) throw Error('invalid response');
      return { status: 'renamed', project: project(result.project) };
    },
  };
}
