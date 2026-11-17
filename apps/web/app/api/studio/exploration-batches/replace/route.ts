import {authConfig} from '../../../../../lib/supabase.ts';
import {withWebOpenAiCredential} from '../../../../../lib/web-openai-credential.ts';
import {explorationBatchRuntime} from '../../../../../lib/exploration-batch-runtime.ts';
import {MAX_VISUAL_REQUEST_BYTES} from '@compor/agents-api/visual-input-contract';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=300;
const unavailable=()=>Response.json({error:'unavailable'},{status:503,headers:{'Cache-Control':'no-store'}});
export async function POST(request:Request){
 const config=authConfig();
 if(!config||process.env.COMPOR_PARALLEL_EXPLORATION_ENABLED!=='true')return unavailable();
 return withWebOpenAiCredential(request,config,{bodyLimit:MAX_VISUAL_REQUEST_BYTES,bodyTooLargeStatus:413,keyLocation:'header'},prepared=>explorationBatchRuntime(prepared)?.replace(prepared.request)??Promise.resolve(unavailable()));
}
