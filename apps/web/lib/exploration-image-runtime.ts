import { createImageHandler } from '@compor/images-api';
import { z } from 'zod';
import { authClient, authConfig } from './supabase.ts';
import { ownsSupabaseProject, resolveSupabaseActor } from './agent-auth.ts';
import { createExplorationImageRoute } from './exploration-image-route.ts';
import { createExplorationImageStore } from './exploration-image-store.ts';
import type { Actor } from './agent-auth.ts';

export function explorationRuntime(mcpActor?:Actor) {
  const config=authConfig();
  if(!config || process.env.COMPOR_PRIVATE_IMAGES_ENABLED!=='true')return null;
  return createExplorationImageRoute({
    appOrigin:config.app,
    resolveActor:async()=>mcpActor ?? resolveSupabaseActor(await authClient(config)),
    ownsProject:async(actor,projectId)=>ownsSupabaseProject({config,actor,projectId}),
    store:createExplorationImageStore(config),
    generate:async(actor,key,prompt)=> {
      const imageHandler=createImageHandler({authenticate:async()=>actor});
      const response=await imageHandler(new Request(`${config.app}/internal-image`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({apiKey:key,prompt,authorizeGeneration:true})}));
      if(!response.ok)throw Error('generation uncertain');
      const result=z.object({imageBase64:z.string().max(11200000),mediaType:z.literal('image/png')}).parse(await response.json());
      const image=Buffer.from(result.imageBase64,'base64');
      if(image.length<8||image.length>8388608||!image.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw Error('invalid image');
      return image;
    },
  });
}
