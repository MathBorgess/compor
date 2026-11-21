import { z } from 'zod';
import type { Actor } from './agent-auth.ts';
import type { AuthConfig } from './supabase.ts';
import { explorationImageRecordSchema, type ExplorationStore } from './exploration-image-route.ts';

// The serial HTTP contract describes the provider outcome. A local closure
// releases admission but cannot turn that outcome into a confirmed rejection.
const serialOutcome=explorationImageRecordSchema.shape.state.or(z.literal('closed_unknown'))
  .transform(state=>state==='closed_unknown'?'unknown':state);
const reservation=z.array(z.object({state:serialOutcome.or(z.enum(['busy','blocked','awaiting_feedback'])),is_new:z.boolean()})).length(1);
const entries=z.array(explorationImageRecordSchema.extend({state:serialOutcome})).max(101);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
async function readBounded(response:Response):Promise<Buffer> {
  const length=response.headers.get('content-length');
  if(length && (!/^\d+$/.test(length) || Number(length)>8388608))throw Error('invalid image');
  if(!response.body)throw Error('invalid image');
  const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
  try {
    for(;;) {const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>8388608)throw Error('invalid image');chunks.push(value);}
    return Buffer.concat(chunks);
  } finally {await reader.cancel().catch(()=>{});}
}

export function createExplorationImageStore(config:AuthConfig, fetchApi:typeof fetch=fetch):ExplorationStore {
  const headers=(actor:Actor)=>({apikey:config.key,authorization:`Bearer ${actor.token}`});
  const objectUrl=(actor:Actor,project:string,image:string,read:boolean)=> {
    if(![actor.userId,project,image].every(value=>uuid.test(value)))throw Error('invalid path');
    return new URL(`/storage/v1/object/${read?'authenticated/':''}compor-exploration-images/${actor.userId.toLowerCase()}/${project.toLowerCase()}/${image.toLowerCase()}.png`,config.service);
  };
  async function rpc(actor:Actor,name:string,body:unknown) {
    const response=await fetchApi(new URL(`/rest/v1/rpc/${name}`,config.service),{method:'POST',headers:{...headers(actor),'content-type':'application/json'},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(5000)});
    if(!response.ok)throw Error('unavailable');
    return await response.json();
  }
  return {
    async reserve(actor,projectId,requestId,digest,rejectionDigest,batch) {
      const params={p_project_id:projectId,p_id:requestId,p_prompt_digest:digest,p_rejection_digest:rejectionDigest};
      const row=reservation.parse(await rpc(actor,batch?'reserve_exploration_image_batched_proven':'reserve_exploration_image_proven',batch?{...params,p_batch_id:batch.id,p_batch_position:batch.position}:params))[0];
      if(row.is_new && row.state!=='running')throw Error('invalid reservation');
      return {state:row.state,isNew:row.is_new};
    },
    async finish(actor,projectId,requestId,state,secret) {
      const params={p_project_id:projectId,p_id:requestId,p_rejection_secret:secret};
      const name=state==='completed'?'complete_exploration_image_proven':'mark_exploration_image_unknown_proven';
      if(await rpc(actor,name,params)!==true)throw Error('unavailable');
    },
    async reject(actor,projectId,requestId,secret) {
      if(await rpc(actor,'reject_exploration_image',{p_project_id:projectId,p_id:requestId,p_rejection_secret:secret})!==true)throw Error('unavailable');
    },
    async hold(actor,projectId,requestId,secret,reason) {
      if(await rpc(actor,'hold_exploration_image_quality',{p_project_id:projectId,p_id:requestId,p_rejection_secret:secret,p_quality_reason:reason})!==true)throw Error('unavailable');
    },
    async fail(actor,projectId,requestId,secret,closureReason,providerOutcome) {
      if(await rpc(actor,'fail_exploration_image',{p_project_id:projectId,p_id:requestId,p_rejection_secret:secret,p_closure_reason:closureReason,p_provider_outcome:providerOutcome})!==true)throw Error('unavailable');
    },
    async resume(actor,projectId) {
      return z.enum(['resumed','not_paused','blocked']).parse(await rpc(actor,'resume_exploration_review',{p_project_id:projectId}));
    },
    async status(actor,projectId) {
      return z.enum(['active','awaiting_feedback']).parse(await rpc(actor,'exploration_review_status',{p_project_id:projectId}));
    },
    async plan(actor,projectId,requestId,plan) {
      const result=await fetchApi(new URL('/rest/v1/exploration_plans',config.service),{method:'POST',headers:{...headers(actor),'content-type':'application/json'},body:JSON.stringify({image_id:requestId,project_id:projectId,composition:plan.composition,contrast:plan.contrast}),redirect:'error',signal:AbortSignal.timeout(5000)});
      if(!result.ok)throw Error('plan unavailable');
    },
    async put(actor,projectId,requestId,bytes) {
      if(bytes.length<8||bytes.length>8388608)throw Error('invalid image');
      const result=await fetchApi(objectUrl(actor,projectId,requestId,false),{method:'POST',headers:{...headers(actor),'content-type':'image/png','cache-control':'no-store','x-upsert':'false'},body:Buffer.from(bytes),redirect:'error',signal:AbortSignal.timeout(30000)});
      if(!result.ok)throw Error('storage uncertain');
    },
    async list(actor,projectId,beforeOrdinal) {
      const url=new URL('/rest/v1/exploration_images',config.service);
      for(const [key,value] of Object.entries({select:'id,project_id,state,created_at,ordinal,batch_id,batch_position,quality_reason',owner_id:`eq.${actor.userId}`,project_id:`eq.${projectId}`,order:'ordinal.desc',limit:'101'}))url.searchParams.set(key,value);
      if(beforeOrdinal!==undefined)url.searchParams.set('ordinal',`lt.${beforeOrdinal}`);
      const response=await fetchApi(url,{headers:headers(actor),redirect:'error',signal:AbortSignal.timeout(5000)});
      if(!response.ok)throw Error('unavailable');
      return entries.parse(await response.json());
    },
    async read(actor,projectId,requestId) {
      const result=await fetchApi(objectUrl(actor,projectId,requestId,true),{headers:headers(actor),redirect:'error',signal:AbortSignal.timeout(30000)});
      if(!result.ok || !/^image\/png(?:\s*;|$)/i.test(result.headers.get('content-type')??''))throw Error('unavailable');
      const bytes=await readBounded(result);
      if(bytes.length<8||bytes.length>8388608||!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw Error('invalid image');
      return new Response(new Uint8Array(bytes),{headers:{'Content-Type':'image/png','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
    },
  };
}
