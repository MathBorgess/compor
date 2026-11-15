import type { Actor } from './agent-auth.ts';
import type { AuthConfig } from './supabase.ts';
import { referenceHistoryEntrySchema, referenceSignalSchema, type ReferenceSignal } from './reference-exploration-contract.ts';
import { z } from 'zod';

const databaseSignalSchema=z.strictObject({id:z.uuid(),project_id:z.uuid(),piece_id:z.uuid().nullable().optional(),origin_url:z.string(),board:z.string(),action:z.enum(['selected','rejected','comment']),comment:z.string(),supersedes:z.uuid().nullable(),created_at:z.iso.datetime({offset:true}),reference_data:z.unknown().optional()});
function convert(value:unknown):ReferenceSignal {
  const row=databaseSignalSchema.parse(value);
  return referenceSignalSchema.parse({id:row.id,projectId:row.project_id,...(row.piece_id?{pieceId:row.piece_id}:{}),originUrl:row.origin_url,board:row.board,action:row.action,comment:row.comment,supersedes:row.supersedes,createdAt:row.created_at,...(row.reference_data==null?{}:{reference:row.reference_data})});
}
export function createReferenceSignalStore({config,actor,fetchApi=fetch}:{config:AuthConfig;actor:Actor;fetchApi?:typeof fetch}) {
  const headers={apikey:config.key,authorization:`Bearer ${actor.token}`};
  async function list(projectId?:string,pieceId?:string) {
    const url=new URL('/rest/v1/reference_signals',config.service);
    for (const [key,value] of Object.entries({select:'id,project_id,piece_id,origin_url,board,action,comment,supersedes,created_at,reference_data',order:'created_at.desc,id.desc',limit:'500'}))url.searchParams.set(key,value);
    url.searchParams.set('owner_id',`eq.${actor.userId}`);
    if(projectId)url.searchParams.set('project_id',`eq.${projectId}`);
    url.searchParams.set('piece_id',pieceId?`eq.${pieceId}`:'is.null');
    const response=await fetchApi(url,{headers,redirect:'error',signal:AbortSignal.timeout(5000)});
    if(!response.ok)throw Error('signals unavailable');
    const rows=z.array(databaseSignalSchema).max(500).parse(await response.json());
    const signals=rows.map(convert);
    if(signals.some(value=>value.pieceId!==pieceId))throw Error('invalid scope response');
    if(projectId&&signals.some(signal=>signal.projectId!==projectId))throw Error('invalid project response');
    return signals;
  }
  async function insert(signal:Omit<ReferenceSignal,'createdAt'>) {
    const url=new URL('/rest/v1/reference_signals',config.service);
    url.searchParams.set('select','id,project_id,piece_id,origin_url,board,action,comment,supersedes,created_at,reference_data');
    let response=await fetchApi(url,{method:'POST',headers:{...headers,'content-type':'application/json',prefer:'return=representation'},redirect:'error',signal:AbortSignal.timeout(5000),body:JSON.stringify({id:signal.id,project_id:signal.projectId,...(signal.pieceId?{piece_id:signal.pieceId}:{}),origin_url:signal.originUrl,board:signal.board,action:signal.action,comment:signal.comment,supersedes:signal.supersedes,...(signal.reference?{reference_data:signal.reference}:{})})});
    if(response.status===409){
      url.searchParams.set('id',`eq.${signal.id}`);url.searchParams.set('owner_id',`eq.${actor.userId}`);url.searchParams.set('project_id',`eq.${signal.projectId}`);
      response=await fetchApi(url,{headers,redirect:'error',signal:AbortSignal.timeout(5000)});
    }
    if(!response.ok)throw Error('signal unavailable');
    const rows=z.array(databaseSignalSchema).length(1).parse(await response.json());
    const saved=convert(rows[0]);
    const sameReference=(!saved.reference&&!signal.reference)||Boolean(saved.reference&&signal.reference&&(['id','title','board','originUrl','previewUrl'] as const).every(key=>saved.reference?.[key]===signal.reference?.[key]));
    if(saved.pieceId!==signal.pieceId||saved.projectId!==signal.projectId||saved.id!==signal.id||saved.originUrl!==signal.originUrl||saved.board!==signal.board||saved.action!==signal.action||saved.comment!==signal.comment||saved.supersedes!==signal.supersedes||!sameReference)throw Error('invalid signal response');
    return saved;
  }
  async function history(projectId:string){
    const response=await fetchApi(new URL('/rest/v1/rpc/list_reference_history',config.service),{method:'POST',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({p_project_id:projectId}),redirect:'error',signal:AbortSignal.timeout(5000)});
    if(!response.ok)throw Error('history unavailable');
    return z.array(referenceHistoryEntrySchema).max(100).parse(await response.json());
  }
  return {list,insert,history};
}
