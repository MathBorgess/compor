import {isAgentCallId} from './agent-call-id.mjs';

const events=new Set(['attempt_reserved','session_created','session_reused','turn_observed','action_received','action_accepted','unknown']);
const phases=new Set(['store_get','binding_missing','binding_verify','session_lookup','session_validate','turn_list','turn_list_validate','turn_match','turn_status','turn_state_write','turn_finish','action_validate','action_receipt_get','action_receipt_pending','action_sign','answer_items','answer_validate','prior_get','prior_binding','prior_lookup','prior_validate','provider_create','provider_create_parse','provider_create_validate','session_sign','session_bind','recovery_bind','provider_message','action_lookup','action_pending','action_durable','action_claim','action_local_unknown','action_result_send','action_receipt_write','action_store_get','action_binding','unknown']);
const statuses=new Set(['queued','in_progress','waiting','completed','failed','cancelled']);
const models=new Set(['gpt-6-astra','gpt-6.1-terra']);
const formats=new Set(['single','carousel','collection','story']);
const skillTag=value=>typeof value==='string'&&/^[a-z0-9._-]{1,64}$/.test(value);
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const identifier=(value,prefix)=>typeof value==='string'&&new RegExp(`^${prefix}_[A-Za-z0-9_-]{1,128}$`).test(value)&&!/sk-/i.test(value);
const count=(value,max)=>Number.isSafeInteger(value)&&value>=0&&value<=max;

/** Technical correlation only. Never serialize the caller's object or an error. */
export function recordStudioEvent(name,metadata={}){
 if(!events.has(name)||!metadata||typeof metadata!=='object')return;
 const row={event:'compor.studio',name};
 for(const field of ['requestId','attemptId'])if(uuid(metadata[field]))row[field]=metadata[field];
 if(identifier(metadata.sessionId,'sess'))row.sessionId=metadata.sessionId;
 if(identifier(metadata.turnId,'turn'))row.turnId=metadata.turnId;
 if(isAgentCallId(metadata.callId))row.callId=metadata.callId;
 if(phases.has(metadata.phase))row.phase=metadata.phase;
 if(statuses.has(metadata.turnStatus))row.turnStatus=metadata.turnStatus;
 if(models.has(metadata.model))row.model=metadata.model;
 if(formats.has(metadata.postFormat))row.postFormat=metadata.postFormat;
 if(skillTag(metadata.skillVersion))row.skillVersion=metadata.skillVersion;
 if(count(metadata.durationMs,3600000))row.durationMs=metadata.durationMs;
 if(count(metadata.inputTokens,100000000))row.inputTokens=metadata.inputTokens;
 if(count(metadata.outputTokens,100000000))row.outputTokens=metadata.outputTokens;
 if(Number.isSafeInteger(metadata.providerStatusCode)&&metadata.providerStatusCode>=100&&metadata.providerStatusCode<=599)row.providerStatusCode=metadata.providerStatusCode;
 if(typeof metadata.callIdAccepted==='boolean')row.callIdAccepted=metadata.callIdAccepted;
 try{console.info(JSON.stringify(row));}catch{/* Observability never changes an operation. */}
}
