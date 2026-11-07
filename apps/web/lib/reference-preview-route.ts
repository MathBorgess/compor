import { z } from 'zod';
import type { Actor } from './agent-auth.ts';
import { pinPreviewSchema } from './reference-exploration-contract.ts';
const inputSchema=z.strictObject({projectId:z.uuid(),previewUrl:pinPreviewSchema,consent:z.literal(true)});
const reply=(body:unknown,status:number)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
export function createReferencePreviewRoute({appOrigin,resolveActor,ownsProject,fetchApi=fetch}:{appOrigin:string;resolveActor:()=>Promise<Actor|null>;ownsProject:(actor:Actor,projectId:string)=>Promise<boolean>;fetchApi?:typeof fetch}) {
  return async(request:Request)=>{
    if(request.headers.get('origin')!==appOrigin||!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')??''))return reply({error:'invalid_request'},400);
    if(!request.body)return reply({error:'invalid_request'},400);
    let input:z.infer<typeof inputSchema>;
    try {
      const reader=request.body.getReader(),chunks:Uint8Array[]=[];let total=0;
      try{for(;;){const {value,done}=await reader.read();if(done)break;total+=value.length;if(total>4096)throw Error('too large');chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}
      input=inputSchema.parse(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks))));
    }catch{return reply({error:'invalid_request'},400);}
    try{
      const actor=await resolveActor();if(!actor?.userId||!actor.token||!await ownsProject(actor,input.projectId))return reply({error:'not_found'},404);
      const response=await fetchApi(input.previewUrl,{headers:{accept:'image/png,image/jpeg'},redirect:'error',signal:AbortSignal.timeout(5000)});
      if(!response.ok||!response.body)throw Error('unavailable');
      const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
      try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>2*1024*1024)throw Error('too large');chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}
      const bytes=Buffer.concat(chunks);
      const mime=bytes.length>=12&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'image/png':bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255?'image/jpeg':null;
      if(!mime)throw Error('invalid image');
      return new Response(bytes,{headers:{'Content-Type':mime,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
    }catch{return reply({error:'unavailable'},503);}
  };
}
