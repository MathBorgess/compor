const noStore = { 'Cache-Control':'no-store' };

export function createSignOutRoute({appOrigin,signOut}:{appOrigin:string;signOut:()=>Promise<void>}) {
  return async (request:Request) => {
    if(request.method!=='POST')return Response.json({error:'method_not_allowed'},{status:405,headers:noStore});
    if(request.headers.get('origin')!==appOrigin)return Response.json({error:'invalid_origin'},{status:403,headers:noStore});
    try { await signOut(); return Response.json({state:'signed-out'},{headers:noStore}); }
    catch { return Response.json({error:'unavailable'},{status:503,headers:noStore}); }
  };
}
