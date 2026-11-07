import { z } from 'zod';
import type { Actor } from './agent-auth.ts';
import type { AuthConfig } from './supabase.ts';
import { generatedSignalSchema, explorationPlanSchema, type GeneratedSignal } from './generated-feedback-contract.ts';

const rowSchema=z.strictObject({id:z.uuid(),project_id:z.uuid(),image_id:z.uuid(),action:z.enum(['selected','rejected','comment']),comment:z.string(),supersedes:z.uuid().nullable(),created_at:z.iso.datetime({offset:true})});
const planRowSchema=z.strictObject({image_id:z.uuid(),project_id:z.uuid(),composition:z.string(),contrast:z.string()});
export function createGeneratedFeedbackStore({config,actor,fetchApi=fetch}:{config:AuthConfig;actor:Actor;fetchApi?:typeof fetch}) {
  const headers={apikey:config.key,authorization:`Bearer ${actor.token}`};
  async function list(projectId?:string):Promise<GeneratedSignal[]> {
    const url=new URL('/rest/v1/generated_image_signals',config.service);
    for(const [key,value] of Object.entries({select:'id,project_id,image_id,action,comment,supersedes,created_at',order:'created_at.desc,id.desc',limit:'500'}))url.searchParams.set(key,value);
    if(projectId)url.searchParams.set('project_id',`eq.${projectId}`);
    const response=await fetchApi(url,{headers,redirect:'error',signal:AbortSignal.timeout(5000)});
    if(!response.ok)throw Error('signals unavailable');
    const rows=z.array(rowSchema).max(500).parse(await response.json());
    if(projectId && rows.some(row=>row.project_id!==projectId))throw Error('scope');
    if(!rows.length)return [];
    const ids=[...new Set(rows.map(row=>row.image_id))],groups:string[][]=[];
    for(let position=0;position<ids.length;position+=50)groups.push(ids.slice(position,position+50));
    const plans=(await Promise.all(groups.map(async group=>{
      const planUrl=new URL('/rest/v1/exploration_plans',config.service);
      planUrl.searchParams.set('select','image_id,project_id,composition,contrast');
      planUrl.searchParams.set('image_id',`in.(${group.join(',')})`);
      planUrl.searchParams.set('limit','50');
      const planResponse=await fetchApi(planUrl,{headers,redirect:'error',signal:AbortSignal.timeout(5000)});
      if(!planResponse.ok)throw Error('plans unavailable');
      const result=z.array(planRowSchema).max(50).parse(await planResponse.json());
      if(result.some(plan=>!group.includes(plan.image_id)))throw Error('invalid plan response');
      return result;
    }))).flat();
    return rows.map(row=>{
      const plan=plans.find(value=>value.image_id===row.image_id && value.project_id===row.project_id);
      return generatedSignalSchema.parse({id:row.id,projectId:row.project_id,imageId:row.image_id,action:row.action,comment:row.comment,supersedes:row.supersedes,createdAt:row.created_at,plan:plan?explorationPlanSchema.parse({composition:plan.composition,contrast:plan.contrast}):null});
    });
  }
  async function insert(signal:Omit<GeneratedSignal,'createdAt'|'plan'>) {
    const url=new URL('/rest/v1/generated_image_signals',config.service);
    url.searchParams.set('select','id,project_id,image_id,action,comment,supersedes,created_at');
    const response=await fetchApi(url,{method:'POST',headers:{...headers,'content-type':'application/json',prefer:'return=representation'},body:JSON.stringify({id:signal.id,project_id:signal.projectId,image_id:signal.imageId,action:signal.action,comment:signal.comment,supersedes:signal.supersedes}),redirect:'error',signal:AbortSignal.timeout(5000)});
    let rows:unknown;
    if(response.status===409) {
      // Reconcile a retry using the same ID; a conflicting payload is never accepted.
      const existingUrl=new URL('/rest/v1/generated_image_signals',config.service);
      existingUrl.searchParams.set('select','id,project_id,image_id,action,comment,supersedes,created_at');
      existingUrl.searchParams.set('id',`eq.${signal.id}`);
      existingUrl.searchParams.set('project_id',`eq.${signal.projectId}`);
      const existing=await fetchApi(existingUrl,{headers,redirect:'error',signal:AbortSignal.timeout(5000)});
      if(!existing.ok)throw Error('signal unavailable');
      rows=await existing.json();
    } else {
      if(!response.ok)throw Error('signal unavailable');
      rows=await response.json();
    }
    const row=z.array(rowSchema).length(1).parse(rows)[0];
    if(row.id!==signal.id||row.project_id!==signal.projectId||row.image_id!==signal.imageId||row.action!==signal.action||row.comment!==signal.comment||row.supersedes!==signal.supersedes)throw Error('invalid response');
    return row;
  }
  return {list,insert};
}
