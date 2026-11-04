const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const count=value=>Number.isSafeInteger(value)&&value>=0&&value<=100_000_000?value:null;
function publicKey(value) {
 if(typeof value!=='string'||/\s/.test(value))return false;
 if(/^sb_publishable_[A-Za-z0-9_-]+$/.test(value))return true;
 try {const p=value.split('.');return p.length===3&&JSON.parse(Buffer.from(p[1],'base64url').toString()).role==='anon';}catch{return false;}
}
export function createUsageStore({url,anonKey,fetch:fetchApi=globalThis.fetch}={}) {
 const base=new URL(url);
 if(base.protocol!=='https:'||base.username||base.password||base.search||base.hash||base.pathname!=='/'||!publicKey(anonKey)||typeof fetchApi!=='function')throw Error('invalid configuration');
 async function rpc(name,{actor,projectId,attemptId,part,partId},extra={}) {
  if(!uuid.test(actor?.userId??'')||typeof actor?.token!=='string'||!/^\S{1,8192}$/.test(actor.token)||![projectId,attemptId,partId].every(x=>uuid.test(x??''))||!['agent','image'].includes(part))throw Error('invalid context');
  const response=await fetchApi(new URL(`/rest/v1/rpc/${name}`,base),{method:'POST',headers:{apikey:anonKey,authorization:`Bearer ${actor.token}`,'content-type':'application/json'},body:JSON.stringify({p_project_id:projectId,p_attempt_id:attemptId,p_part:part,p_part_id:partId,...extra}),redirect:'error',signal:AbortSignal.timeout(5000)});
  if(!response.ok)throw Error('usage unavailable');
  const result=await response.json();if(typeof result!=='boolean')throw Error('invalid usage response');return result;
 }
 return Object.freeze({
  start:context=>rpc('start_usage_measurement',context),
  async finish({state,usage,...context}) {
   if(!['completed','unknown'].includes(state))throw Error('invalid state');
   const result=await rpc('finish_usage_measurement',context,{p_state:state,p_input_tokens:count(usage?.input_tokens),p_output_tokens:count(usage?.output_tokens),p_total_tokens:count(usage?.total_tokens)});
   if(!result)throw Error('usage unavailable');
  },
 });
}
