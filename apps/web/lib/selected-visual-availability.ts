import {agentSigningKey} from './agent-config.ts';
import {validateVisualInputManifest,type VisualInputManifest} from '@compor/agents-api/visual-input-contract';

/** Capability is exposed only when all server-side image and chat dependencies are configured. */
export function selectedVisualsAvailable(authConfigured:boolean,env:NodeJS.ProcessEnv=process.env):boolean {
 return authConfigured&&env.COMPOR_SELECTED_LOCAL_VISUALS_ENABLED==='true'&&env.COMPOR_REFERENCE_AUTHORITY_ENABLED==='true'&&env.COMPOR_STUDIO_CHAT_ENABLED==='true'&&env.COMPOR_PRIVATE_IMAGES_ENABLED==='true'&&agentSigningKey(env)!==null;
}

/** The selection is a statement from the authenticated app, not proof of physical file provenance. */
export async function authorizeLocalVisualInput({context,visualInput}:{context:Record<string,unknown>;visualInput:VisualInputManifest}):Promise<boolean> {
 if(!validateVisualInputManifest(visualInput)||!Array.isArray(context.references)||context.references.length>20)return false;
 const localIds:string[]=[];
 for(const value of context.references){
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  const reference=value as Record<string,unknown>,source=reference.source;
  if(source===undefined||source===null)continue;
  if(!source||typeof source!=='object'||Array.isArray(source))return false;
  if((source as Record<string,unknown>).kind!=='local-upload'||typeof reference.id!=='string')return false;
  localIds.push(reference.id.toLowerCase());
 }
 return visualInput.entries.every(entry=>entry.inputOrigin==='local-upload')&&localIds.length===visualInput.entries.length&&localIds.every((id,index)=>id===visualInput.entries[index].id);
}
