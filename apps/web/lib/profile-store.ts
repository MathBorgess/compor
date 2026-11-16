import {z} from 'zod';
import type {Actor} from './agent-auth.ts';
import type {AuthConfig} from './supabase.ts';
import {exploredReferenceSchema} from './reference-exploration-contract.ts';
import {PROFILE_PROJECT_PAGE,PROFILE_SIGNAL_LIMIT,profileResponseSchema,type ProfileSignal,type ProfilePage} from './profile-contract.ts';

const projectRow = z.strictObject({id:z.uuid(),owner_id:z.uuid(),title:z.string().min(1).max(200),deleted_at:z.iso.datetime({offset:true}).nullable()});
const signalFields = {id:z.uuid(),owner_id:z.uuid(),project_id:z.uuid(),piece_id:z.uuid().nullable(),action:z.enum(['selected','rejected','comment']),comment:z.string().max(1000),supersedes:z.uuid().nullable(),created_at:z.iso.datetime({offset:true})};
const referenceRow = z.strictObject({...signalFields,origin_url:z.string(),reference_data:z.unknown()});
const generatedRow = z.strictObject({...signalFields,image_id:z.uuid()});

export function createProfileStore({config,actor,fetchApi=fetch}:{config:AuthConfig;actor:Actor;fetchApi?:typeof fetch}) {
  const headers={apikey:config.key,authorization:`Bearer ${actor.token}`};
  async function read(table:string,parameters:Record<string,string>):Promise<unknown> {
    const url=new URL(`/rest/v1/${table}`,config.service);
    for(const [key,value] of Object.entries({...parameters,owner_id:`eq.${actor.userId}`}))url.searchParams.set(key,value);
    const response=await fetchApi(url,{headers,redirect:'error',signal:AbortSignal.timeout(5000)});
    if(!response.ok)throw Error('profile_unavailable');
    return response.json();
  }
  return {
    async read(offset=0):Promise<ProfilePage> {
      const rows=z.array(projectRow).max(PROFILE_PROJECT_PAGE+1).parse(await read('projects',{select:'id,owner_id,title,deleted_at',order:'created_at.desc,id.desc',offset:String(offset),limit:String(PROFILE_PROJECT_PAGE+1)}));
      if(rows.some(row=>row.owner_id!==actor.userId))throw Error('invalid_profile_owner');
      const projects=rows.slice(0,PROFILE_PROJECT_PAGE).map(row=>({id:row.id,title:row.title,deletedAt:row.deleted_at}));
      const signals:ProfileSignal[]=[];
      const limitedSources:ProfilePage['limitedSources']=[];
      if(projects.length){
        const ids=new Set(projects.map(project=>project.id));
        const parameters={project_id:`in.(${projects.map(project=>project.id).join(',')})`,order:'created_at.desc,id.desc',limit:String(PROFILE_SIGNAL_LIMIT+1)};
        const [rawReferences,rawGenerated]=await Promise.all([
          read('reference_signals',{...parameters,select:'id,owner_id,project_id,piece_id,action,comment,supersedes,created_at,origin_url,reference_data'}),
          read('generated_image_signals',{...parameters,select:'id,owner_id,project_id,piece_id,action,comment,supersedes,created_at,image_id'}),
        ]);
        const references=z.array(referenceRow).max(PROFILE_SIGNAL_LIMIT+1).parse(rawReferences);
        const generated=z.array(generatedRow).max(PROFILE_SIGNAL_LIMIT+1).parse(rawGenerated);
        if([...references,...generated].some(row=>row.owner_id!==actor.userId||!ids.has(row.project_id)))throw Error('invalid_profile_scope');
        if(references.length>PROFILE_SIGNAL_LIMIT)limitedSources.push('reference');
        if(generated.length>PROFILE_SIGNAL_LIMIT)limitedSources.push('generated');
        for(const row of references.slice(0,PROFILE_SIGNAL_LIMIT)){
          const reference=row.reference_data==null?null:exploredReferenceSchema.parse(row.reference_data);
          if(reference&&reference.originUrl!==row.origin_url)throw Error('invalid_profile_reference');
          signals.push({kind:'reference',id:row.id,projectId:row.project_id,pieceId:row.piece_id,action:row.action,comment:row.comment,supersedes:row.supersedes,createdAt:row.created_at,originUrl:row.origin_url,title:reference?.title??'Referência do Pinterest'});
        }
        for(const row of generated.slice(0,PROFILE_SIGNAL_LIMIT))signals.push({kind:'generated',id:row.id,projectId:row.project_id,pieceId:row.piece_id,action:row.action,comment:row.comment,supersedes:row.supersedes,createdAt:row.created_at,imageId:row.image_id});
      }
      signals.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id));
      return profileResponseSchema.parse({userId:actor.userId,projects,signals,nextOffset:rows.length>PROFILE_PROJECT_PAGE?offset+PROFILE_PROJECT_PAGE:null,limitedSources});
    },
  };
}
