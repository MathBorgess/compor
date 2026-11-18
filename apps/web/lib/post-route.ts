import type {Actor} from './agent-auth';
import type {createPostStore} from './post-store';
import {postCreationSchema,postDeletionSchema} from './post-catalog';
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export function createPostRoutes({appOrigin,resolveActor,ownsProject,postStore}:{appOrigin:string;resolveActor:()=>Promise<Actor|null>;ownsProject:(actor:Actor,projectId:string)=>Promise<boolean>;postStore:ReturnType<typeof createPostStore>}){
  async function handle(method:'POST'|'DELETE',request:Request){
    if(request.headers.get('origin')!==appOrigin)return reply({error:'invalid_origin'},403);
    if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')??''))return reply({error:'invalid_request'},400);
    try{
      const actor=await resolveActor();if(!actor?.userId||!actor.token)return reply({error:'unauthorized'},401);
      let data;
      try{
        if(!request.body)throw Error();const reader=request.body.getReader(),parts:Uint8Array[]=[];let size=0;
        try{for(;;){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>4096)throw Error();parts.push(chunk.value);}}finally{await reader.cancel().catch(()=>{});}
        data=(method==='POST'?postCreationSchema:postDeletionSchema).parse(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(parts))));
      }catch{return reply({error:'invalid_request'},400);}
      if(!await ownsProject(actor,data.projectId))return reply({error:'not_found'},404);
      const result=await postStore.mutate({actor:{userId:actor.userId},token:actor.token},method,data);
      if(result.status==='pending'||result.status==='conflict')return reply(result,409);
      return reply(result,result.status==='not_found'?404:200);
    }catch{return reply({error:'result_unknown',retryAutomatically:false},502);}
  }
  return {POST:(request:Request)=>handle('POST',request),DELETE:(request:Request)=>handle('DELETE',request)};
}
