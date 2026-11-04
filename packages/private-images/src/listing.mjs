const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const reply = (body,status) => Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
function publicKey(value) {
 if(typeof value!=='string'||/\s/.test(value))return false;
 if(/^sb_publishable_[A-Za-z0-9_-]+$/.test(value))return true;
 try{const parts=value.split('.');return parts.length===3&&JSON.parse(Buffer.from(parts[1],'base64url').toString('utf8')).role==='anon';}catch{return false;}
}
async function boundedJson(stream) {
 if(!stream)throw Error('missing');const reader=stream.getReader(),chunks=[];let total=0;
 try{for(;;){const {value,done}=await reader.read();if(done)break;total+=value.byteLength;if(total>16384)throw Error('large');chunks.push(value);}return JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(Buffer.concat(chunks)));}
 finally{try{Promise.resolve(reader.cancel()).catch(()=>{});}catch{}try{reader.releaseLock();}catch{}}
}
/** Internal HTTP boundary; authenticate verifies the exact Supabase token. */
export function createPrivateImageListingHandler({supabaseUrl,publishableKey,authenticate,fetch:fetchApi=globalThis.fetch}={}) {
 const base=new URL(supabaseUrl);
 if(base.protocol!=='https:'||base.username||base.password||base.search||base.hash||base.pathname!=='/'||!publicKey(publishableKey)||typeof authenticate!=='function'||typeof fetchApi!=='function')throw Error('invalid configuration');
 return async request=>{
  if(request.method!=='GET')return reply({error:'method_not_allowed'},405);
  const query=new URL(request.url).searchParams;
  if(['projectId','pieceId','version'].some(key=>query.getAll(key).length!==1)||query.getAll('after').length>1)return reply({error:'invalid_request'},400);
  const project=query.get('projectId'),piece=query.get('pieceId'),version=query.get('version'),after=query.get('after');
  if(!uuid(project)||!uuid(piece)||!/^[1-9][0-9]{0,9}$/.test(version??'')||Number(version)>2147483647||(after!==null&&!uuid(after)))return reply({error:'invalid_request'},400);
  let actor;try{actor=await authenticate(request);}catch{return reply({error:'unavailable'},503);}
  if(!uuid(actor?.userId)||typeof actor?.token!=='string'||!/^\S{1,8192}$/.test(actor.token))return reply({error:'unauthorized'},401);
  try {
   const result=await fetchApi(new URL('/rest/v1/rpc/list_piece_image_assets',base),{method:'POST',headers:{apikey:publishableKey,authorization:`Bearer ${actor.token}`,'content-type':'application/json'},body:JSON.stringify({p_project_id:project.toLowerCase(),p_piece_id:piece.toLowerCase(),p_version:Number(version),p_after:after?.toLowerCase()??null}),redirect:'error',signal:AbortSignal.timeout(5000)});
   if(!result.ok)throw Error('unavailable');const page=await boundedJson(result.body);
   if(!page||!Array.isArray(page.assets)||page.assets.length>50||!page.assets.every(item=>uuid(item)&&item===item.toLowerCase())||page.assets.some((item,i)=>i>0&&item<=page.assets[i-1])||(after&&page.assets.some(item=>item<=after.toLowerCase()))||!(page.nextCursor===null||(page.assets.length===50&&page.nextCursor===page.assets[49])))throw Error('invalid page');
   return reply({assets:page.assets.map(assetId=>({assetId,origin:'unknown'})),nextCursor:page.nextCursor},200);
  }catch{return reply({error:'unavailable'},503);}
 };
}
