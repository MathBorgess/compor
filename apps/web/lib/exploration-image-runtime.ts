import { studioImagePipeline } from './studio-image-pipeline.ts';
import { z } from 'zod';
import { authClient, authConfig } from './supabase.ts';
import { ownsSupabaseProject, resolveSupabaseActor } from './agent-auth.ts';
import { createExplorationImageRoute, ExplorationCredentialsRejected } from './exploration-image-route.ts';
import { ExplorationQualityHeld, explorationQualityReasons } from './exploration-image-outcome.ts';
import { createExplorationImageStore } from './exploration-image-store.ts';
import type { Actor } from './agent-auth.ts';

// The internal handler has other 401 responses (for example failed local
// authentication), so status alone is never proof of provider rejection.
export async function decodeExplorationImage(response:Response):Promise<Buffer> {
  if(!response.ok) {
    if(response.status===401 || response.status===403) {
      const value:unknown=await response.json().catch(()=>null);
      if(z.strictObject({error:z.literal('openai_credentials_rejected')}).safeParse(value).success)throw new ExplorationCredentialsRejected();
    }
    if(response.status===422 || response.status===503) {
      const value:unknown=await response.json().catch(()=>null);
      const quality=z.strictObject({error:z.enum(explorationQualityReasons),retryAutomatically:z.literal(false),usage:z.unknown()}).safeParse(value);
      const expected=response.status===422?'image_quality_rejected':'image_quality_inconclusive';
      if(quality.success&&quality.data.error===expected)throw new ExplorationQualityHeld(quality.data.error);
    }
    throw Error('generation uncertain');
  }
  const result=z.object({imageBase64:z.string().max(11200000),mediaType:z.literal('image/png')}).parse(await response.json());
  const image=Buffer.from(result.imageBase64,'base64');
  if(image.length<8||image.length>8388608||!image.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw Error('invalid image');
  return image;
}

export function explorationRuntime(mcpActor?:Actor) {
  const config=authConfig();
  if(!config || process.env.COMPOR_PRIVATE_IMAGES_ENABLED!=='true')return null;
  const imagePipeline=studioImagePipeline();
  return createExplorationImageRoute({
    generationAvailable:imagePipeline!==null,
    appOrigin:config.app,
    resolveActor:async()=>mcpActor ?? resolveSupabaseActor(await authClient(config)),
    ownsProject:async(actor,projectId)=>ownsSupabaseProject({config,actor,projectId}),
    store:createExplorationImageStore(config),
    generate:async(actor,key,prompt,review)=> {
      if (!imagePipeline) throw Error('image generation unavailable');
      const imageHandler=imagePipeline.createHandler(async()=>actor);
      const response=await imageHandler(new Request(`${config.app}/internal-image`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({apiKey:key,prompt,authorizeGeneration:true}),signal:review?.signal}),{authorizeReview:review?.authorizeReview});
      return decodeExplorationImage(response);
    },
  });
}
