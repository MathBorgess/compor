import { pendingImageAction } from './index.mjs';

const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const sessionId = value => typeof value === 'string' && /^sess_[A-Za-z0-9_-]{1,128}$/.test(value);
const turnId = value => typeof value === 'string' && /^turn_[A-Za-z0-9_-]{1,128}$/.test(value);
// The transient delegated MCP grant is not persisted, so its exact value is
// unavailable during recovery. Refuse opaque long tokens in returned content.
const opaqueToken = value => /[A-Za-z0-9_-]{128,}/.test(value);
const reply = (data,status=200) => Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
async function bounded(stream, limit) {
  if (!stream) throw Error('missing body');
  const reader=stream.getReader(), parts=[]; let size=0;
  try { for(;;) { const {value,done}=await reader.read(); if(done)break; size+=value.byteLength; if(size>limit)throw Error('too large'); parts.push(value); } }
  finally {try {Promise.resolve(reader.cancel()).catch(()=>{});}catch{} try {reader.releaseLock();}catch{}}
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(parts)));
}

/** Read-only reconciliation; never starts an agent, submits a tool result or generates. */
export function createAgentRecoveryHandler({ appOrigin, resolveActor, ownsProject, attempts, bindings, fetch: fetchApi=globalThis.fetch }={}) {
  return async request => {
    if(request.method!=='POST')return reply({error:'method_not_allowed'},405);
    if(!appOrigin || typeof resolveActor!=='function' || typeof ownsProject!=='function' || typeof attempts?.getRecovery!=='function' || typeof attempts?.start!=='function' || typeof bindings?.verifyRecovery!=='function' || typeof bindings?.recoveryAttemptKey!=='function' || typeof bindings?.issueAction!=='function')return reply({error:'unavailable'},503);
    if(request.headers.get('origin')!==appOrigin)return reply({error:'invalid_origin'},403);
    if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')??''))return reply({error:'invalid_request'},400);
    let body; try {body=await bounded(request.body,16*1024);} catch {return reply({error:'invalid_request'},400);}
    if(!body || Object.keys(body).sort().join(',')!=='apiKey,idempotencyKey,projectId' || typeof body.apiKey!=='string' || !/^sk-[^\s]{20,300}$/.test(body.apiKey) || !uuid(body.projectId) || !uuid(body.idempotencyKey))return reply({error:'invalid_request'},400);
    const {projectId,idempotencyKey,apiKey}=body;
    let actor;try {actor=await resolveActor();}catch{return reply({error:'unavailable'},503);}
    if(!uuid(actor?.userId) || typeof actor?.token!=='string' || !actor.token)return reply({error:'unauthorized'},401);
    try {
      if(!await ownsProject({actor,projectId}))return reply({error:'not_found'},404);
      const record=await attempts.getRecovery({actor,projectId,idempotencyKey});
      if(!record)return reply({error:'not_found'},404);
      const context={userId:actor.userId,projectId,attemptId:record.attemptId};
      const proof=bindings.verifyRecovery({...context,token:record.binding});
      if(!proof || !sessionId(proof.sessionId))throw Error('invalid proof');
      const base=`https://api.openai.com/v1/agents/sessions/${encodeURIComponent(proof.sessionId)}`;
      const get=async path=>{const r=await fetchApi(base+path,{method:'GET',headers:{Authorization:`Bearer ${apiKey}`,'OpenAI-Beta':'agents=v1'},redirect:'error',signal:AbortSignal.timeout(10_000)});if(!r.ok)throw Error('provider unavailable');return bounded(r.body,256*1024);};
      const session=await get('');
      if(session?.id!==proof.sessionId || !Array.isArray(session.required_actions))throw Error('invalid session');
      if(session.status==='in_progress')return reply({status:'in_progress',retryAutomatically:false},202);
      if(session.status==='failed')return reply({status:'failed',retryAutomatically:false});
      if(session.status==='requires_action') {
        if(record.state==='completed')throw Error('already completed');
        const action=pendingImageAction(session,apiKey);
        if (opaqueToken(action.prompt)) throw Error('unsafe action');
        let attemptId=record.attemptId;
        if(record.state==='unknown') {
          const recoveryKey=bindings.recoveryAttemptKey(context);
          const child=await attempts.start({actor,projectId,idempotencyKey:recoveryKey});
          if(!uuid(child?.id) || child.state!=='started')throw Error('recovery attempt unavailable');
          attemptId=child.id;
        }
        const actionBinding=bindings.issueAction({userId:actor.userId,projectId,attemptId,sessionId:proof.sessionId,...action});
        return reply({status:'consent_required',attemptId,prompt:action.prompt,actionBinding},202);
      }
      if(session.status!=='idle' || session.required_actions.length)throw Error('invalid session state');
      const turns=await get('/turns?limit=100&order=asc');
      if(!Array.isArray(turns?.data)||turns.has_more!==false)throw Error('incomplete turns');
      const roots=turns.data.filter(t=>t?.subagent_id===null);
      if(roots.length!==1 || roots[0].status!=='completed' || roots[0].session_id!==proof.sessionId || !turnId(roots[0].id))return reply({status:'completed_unavailable',retryAutomatically:false});
      const items=await get(`/turns/${encodeURIComponent(roots[0].id)}/items?limit=100&order=asc`);
      if(!Array.isArray(items?.data)||items.has_more!==false)throw Error('incomplete items');
      const messages=items.data.filter(i=>i?.type==='message'&&i.role==='assistant'&&i.status==='completed'&&i.phase==='final_answer'&&i.turn_id===roots[0].id);
      if(messages.length!==1 || !Array.isArray(messages[0].content))return reply({status:'completed_unavailable',retryAutomatically:false});
      const text=messages[0].content.filter(c=>c?.type==='output_text'&&typeof c.text==='string').map(c=>c.text).join('');
      if(!text || text.length>64*1024 || text.includes(apiKey) || /sk-[^\s]+/i.test(text) || opaqueToken(text))return reply({status:'completed_unavailable',retryAutomatically:false});
      return reply({status:'completed',text,retryAutomatically:false});
    } catch {return reply({error:'recovery_unavailable',retryAutomatically:false},503);}
  };
}
