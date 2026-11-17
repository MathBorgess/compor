const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
function publicKey(value){if(typeof value!=='string'||/\s/.test(value))return false;if(/^sb_publishable_[A-Za-z0-9_-]+$/.test(value))return true;try{return JSON.parse(Buffer.from(value.split('.')[1],'base64url')).role==='anon';}catch{return false;}}
function turn(value){
 if(!value||![value.request_id,value.project_id,value.owner_id,value.attempt_id].every(uuid)||!['starting','running','action_required','completed','failed','unknown'].includes(value.state)||!/^[0-9a-f]{64}$/.test(value.input_digest))throw Error('invalid studio response');
 return {requestId:value.request_id,projectId:value.project_id,userId:value.owner_id,attemptId:value.attempt_id,inputDigest:value.input_digest,state:value.state,binding:value.session_binding,expiresAt:value.session_expires_at,priorTurnId:value.prior_turn_id,turnId:value.turn_id,initialInput:value.initial_input_tokens,initialOutput:value.initial_output_tokens};
}
export function createStudioStore({url,anonKey,fetch:fetchApi=globalThis.fetch}={}){
 const base=new URL(url);if(base.protocol!=='https:'||base.username||base.password||base.pathname!=='/'||base.search||base.hash||!publicKey(anonKey))throw Error('invalid configuration');
 async function rpc(name,{actor,projectId,requestId},extra={}){
  if(![actor?.userId,projectId,requestId].every(uuid)||typeof actor?.token!=='string'||!/^\S{1,8192}$/.test(actor.token))throw Error('invalid studio context');
  const r=await fetchApi(new URL(`/rest/v1/rpc/${name}`,base),{method:'POST',headers:{apikey:anonKey,authorization:`Bearer ${actor.token}`,'Content-Type':'application/json'},body:JSON.stringify({p_project_id:projectId,p_request_id:requestId,...extra}),redirect:'error',signal:AbortSignal.timeout(5000)});
  if(!r.ok)throw Error('studio metadata unavailable');return r.json();
 }
 return {
  async reserve(c){const visual=c.visualAuthority;if(visual&&(!/^[a-f0-9]{64}$/.test(visual.manifestDigest)||(visual.pieceId!==null&&!uuid(visual.pieceId))||(visual.consentSecret!==null&&!/^[a-f0-9]{64}$/.test(visual.consentSecret))))throw Error('invalid visual authority');const r=await rpc(visual?'reserve_studio_turn_authorized':'reserve_studio_turn',c,{p_input_digest:c.inputDigest,...(visual?{p_piece_id:visual.pieceId,p_manifest_digest:visual.manifestDigest,p_consent_secret:visual.consentSecret}:{})});if(!['reserved','existing','busy','conflict','not_found'].includes(r?.status))throw Error('invalid reservation');return {...r,...(r.turn?{turn:turn(r.turn)}:{})};},
  async get(c){const r=await rpc('get_studio_turn',c);return r===null?null:turn(r);},
  async bind(c){if(await rpc('bind_studio_session',c,{p_binding:c.binding,p_expires_at:c.expiresAt,p_prior_turn_id:c.priorTurnId??null,p_initial_input:c.initialInput??null,p_initial_output:c.initialOutput??null})!==true)throw Error('studio binding unavailable');},
  async state(c){if(await rpc('set_studio_turn_state',c,{p_state:c.state,p_turn_id:c.turnId??null})!==true)throw Error('studio state unavailable');},
  async claimAction(c){const r=await rpc('claim_studio_action',c,{p_turn_id:c.turnId,p_call_id:c.callId,p_action_digest:c.actionDigest,p_result_digest:c.resultDigest});if(!['claimed','existing','conflict','unavailable'].includes(r?.status)||(['claimed','existing'].includes(r.status)&&!uuid(r.id)))throw Error('invalid action claim');return r;},
  async getAction(c){const r=await rpc('get_studio_action',c,{p_turn_id:c.turnId,p_call_id:c.callId});if(r===null)return null;if(!['sending','accepted','unknown'].includes(r?.state))throw Error('invalid action state');return r;},
  async finishAction(c){if(await rpc('finish_studio_action',c,{p_submission_id:c.submissionId,p_state:c.state})!==true)throw Error('studio action unavailable');},
 };
}
