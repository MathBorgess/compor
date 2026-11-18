import { explorationRuntime } from '../../../../../lib/exploration-image-runtime.ts';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(request:Request) {
  return explorationRuntime()?.status(request) ?? Response.json({error:'unavailable'},{status:503,headers:{'Cache-Control':'no-store'}});
}
