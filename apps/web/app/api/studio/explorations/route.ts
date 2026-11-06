import { explorationRuntime } from '../../../../lib/exploration-image-runtime.ts';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=300;
const unavailable=()=>Response.json({error:'unavailable'},{status:503,headers:{'Cache-Control':'no-store'}});
export async function POST(request:Request) { return explorationRuntime()?.post(request) ?? unavailable(); }
export async function GET(request:Request) { return explorationRuntime()?.get(request) ?? unavailable(); }
