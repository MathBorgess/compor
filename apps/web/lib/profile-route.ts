import * as z from './schema.ts';
import type {Actor} from './agent-auth.ts';
import {profileResponseSchema,type ProfilePage} from './profile-contract.ts';

const profileRequestSchema = z.strictObject({offset:z.optional(z.number().check(z.int()).check(z.minimum(0)).check(z.maximum(1_000_000)))});

const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
type Dependencies={appOrigin:string;resolveActor:()=>Promise<Actor|null>;read:(actor:Actor,offset:number)=>Promise<ProfilePage>};

export function createProfileRoute({appOrigin,resolveActor,read}:Dependencies) {
  return async(request:Request)=>{
    if(request.headers.get('origin')!==appOrigin)return reply({error:'invalid_origin'},403);
    if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')??'')||!request.body)return reply({error:'invalid_request'},400);
    let offset:number;
    try{
      const reader=request.body.getReader();let body='',bytes=0;
      const decoder=new TextDecoder('utf-8',{fatal:true});
      try{for(;;){const chunk=await reader.read();if(chunk.done)break;bytes+=chunk.value.length;if(bytes>512)throw Error('too_large');body+=decoder.decode(chunk.value,{stream:true});}body+=decoder.decode();}
      finally{await reader.cancel();}
      offset=profileRequestSchema.parse(JSON.parse(body)).offset??0;
    }catch{return reply({error:'invalid_request'},400);}
    try{
      const actor=await resolveActor();
      if(!actor?.userId||!actor.token)return reply({error:'unauthorized'},401);
      const page=profileResponseSchema.parse(await read(actor,offset));
      if(page.userId!==actor.userId)throw Error('invalid_profile_owner');
      return reply(page);
    }catch{return reply({error:'unavailable'},503);}
  };
}
