const catalogs=new WeakMap();
/** Isolated browser fixture; never used by the application or the local review server. */
export async function mockPostCatalog(page){
 if(catalogs.has(page))return catalogs.get(page);
 const state={records:new Map(),calls:[],failCreate:false,failDelete:false,createGate:null};catalogs.set(page,state);
 await page.route('**/api/posts',async route=>{
  const request=route.request(),body=request.postDataJSON(),key=body.projectId+':'+body.pieceId;
  state.calls.push({method:request.method(),body});
  if(request.method()==='POST'){
   if(state.createGate)await state.createGate;
   if(state.failCreate)return route.fulfill({status:502,json:{error:'result_unknown'}});
   const existing=state.records.get(key);
   if(existing?.deleted)return route.fulfill({status:404,json:{status:'not_found'}});
   if(existing&&existing.name!==body.name)return route.fulfill({status:409,json:{status:'conflict'}});
   const post=existing??{...body,deleted:false};state.records.set(key,post);return route.fulfill({json:{status:'created',post}});
  }
  if(state.failDelete)return route.fulfill({status:502,json:{error:'result_unknown'}});
  const post={...state.records.get(key),projectId:body.projectId,pieceId:body.pieceId,name:state.records.get(key)?.name??'',deleted:true};
  state.records.set(key,post);return route.fulfill({json:{status:'deleted',post}});
 });
 return state;
}
