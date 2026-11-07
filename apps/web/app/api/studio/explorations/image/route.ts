import { explorationRuntime } from '../../../../../lib/exploration-image-runtime.ts';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request) {
  return explorationRuntime()?.image(request) ?? Response.json({error:'unavailable'},{status:503,headers:{'Cache-Control':'no-store'}});
}
