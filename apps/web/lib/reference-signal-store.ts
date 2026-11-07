import type { Actor } from './agent-auth.ts';
import type { AuthConfig } from './supabase.ts';
import { referenceSignalSchema, type ReferenceSignal } from './reference-exploration-contract.ts';
import { z } from 'zod';

const databaseSignalSchema=z.strictObject({id:z.uuid(),project_id:z.uuid(),origin_url:z.string(),board:z.string(),action:z.enum(['selected','rejected','comment']),comment:z.string(),supersedes:z.uuid().nullable(),created_at:z.iso.datetime({offset:true})});
function convert(value:unknown):ReferenceSignal {
  const row=databaseSignalSchema.parse(value);
  return referenceSignalSchema.parse({id:row.id,projectId:row.project_id,originUrl:row.origin_url,board:row.board,action:row.action,comment:row.comment,supersedes:row.supersedes,createdAt:row.created_at});
}
export function createReferenceSignalStore({config,actor,fetchApi=fetch}:{config:AuthConfig;actor:Actor;fetchApi?:typeof fetch}) {
  const headers={apikey:config.key,authorization:`Bearer ${actor.token}`};
  async function list(projectId?:string) {
    const url=new URL('/rest/v1/reference_signals',config.service);
    for (const [key,value] of Object.entries({select:'id,project_id,origin_url,board,action,comment,supersedes,created_at',order:'created_at.desc,id.desc',limit:'500'}))url.searchParams.set(key,value);
    if(projectId)url.searchParams.set('project_id',`eq.${projectId}`);
    const response=await fetchApi(url,{headers,redirect:'error',signal:AbortSignal.timeout(5000)});
    if(!response.ok)throw Error('signals unavailable');
    const rows=z.array(databaseSignalSchema).max(500).parse(await response.json());
    const signals=rows.map(convert);
    if(projectId&&signals.some(signal=>signal.projectId!==projectId))throw Error('invalid project response');
    return signals;
  }
  async function insert(signal:Omit<ReferenceSignal,'createdAt'>) {
    const url=new URL('/rest/v1/reference_signals',config.service);
    url.searchParams.set('select','id,project_id,origin_url,board,action,comment,supersedes,created_at');
    const response=await fetchApi(url,{method:'POST',headers:{...headers,'content-type':'application/json',prefer:'return=representation'},redirect:'error',signal:AbortSignal.timeout(5000),body:JSON.stringify({id:signal.id,project_id:signal.projectId,origin_url:signal.originUrl,board:signal.board,action:signal.action,comment:signal.comment,supersedes:signal.supersedes})});
    if(!response.ok)throw Error('signal unavailable');
    const rows=z.array(databaseSignalSchema).length(1).parse(await response.json());
    const saved=convert(rows[0]);
    if(saved.projectId!==signal.projectId||saved.id!==signal.id||saved.originUrl!==signal.originUrl||saved.board!==signal.board||saved.action!==signal.action||saved.comment!==signal.comment||saved.supersedes!==signal.supersedes)throw Error('invalid signal response');
    return saved;
  }
  return {list,insert};
}
