import { explorationRuntime } from '../../../../lib/exploration-image-runtime.ts';
import { z } from 'zod';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=300;
const unavailable=()=>Response.json({error:'unavailable'},{status:503,headers:{'Cache-Control':'no-store'}});
export async function POST(request:Request) {
  const service=explorationRuntime();
  if(service)return service.post(request);
  const requestId=z.string().uuid().safeParse(request.headers.get('x-compor-exploration-request-id'));
  return requestId.success ? Response.json({status:'not_started',requestId:requestId.data,retryAutomatically:false},{status:503,headers:{'Cache-Control':'no-store'}}) : unavailable();
}
export async function GET(request:Request) { return explorationRuntime()?.get(request) ?? unavailable(); }
