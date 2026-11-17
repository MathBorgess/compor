import {z} from 'zod';
import {authClient,authConfig} from '../../../../../lib/supabase.ts';
import {ownsSupabaseProject,resolveSupabaseActor} from '../../../../../lib/agent-auth.ts';
import {createExplorationBatchStore} from '../../../../../lib/exploration-batch-store.ts';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const reply=(value:unknown,status:number)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
const input=z.strictObject({projectId:z.string().uuid(),batchId:z.string().uuid()});
async function readInput(request:Request){
 if(!request.body)throw Error('missing');
 const reader=request.body.getReader(),chunks:Uint8Array[]=[];let size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>4096)throw Error('large');chunks.push(value);}return input.parse(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks))));}
 finally{await reader.cancel().catch(()=>{});}
}
export async function POST(request:Request){
 const config=authConfig();
 if(!config)return reply({error:'unavailable'},503);
 if(request.headers.get('origin')!==config.app)return reply({error:'invalid_origin'},403);
 if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')??''))return reply({error:'invalid_request'},400);
 // This endpoint is read-only and remains available if the feature flag is
 // switched off, so an existing uncertain batch can still be inspected.
 let value:z.infer<typeof input>;
 try{value=await readInput(request);}catch{return reply({error:'invalid_request'},400);}
 try{
  const actor=await resolveSupabaseActor(await authClient(config));
  if(!actor)return reply({error:'unauthorized'},401);
  if(!await ownsSupabaseProject({config,actor,projectId:value.projectId}))return reply({error:'not_found'},404);
  const batch=await createExplorationBatchStore(config).getBatch(actor,value.projectId,value.batchId);
  return batch?reply(batch,200):reply({error:'not_found'},404);
 }catch{return reply({error:'unavailable'},503);}
}
