import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
import {validateExplorationContext,validateExplorationPlan,validateCompletedExplorationPlan} from './exploration-plan-contract.mjs';
export {validateExplorationContext,validateExplorationPlan,validateCompletedExplorationPlan} from './exploration-plan-contract.mjs';

const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
const identifier=(x,prefix)=>typeof x==='string'&&new RegExp(`^${prefix}_[A-Za-z0-9_-]{1,128}$`).test(x)&&!/sk-/i.test(x);
const object=x=>Boolean(x)&&typeof x==='object'&&!Array.isArray(x);
const exact=(x,keys)=>object(x)&&Object.keys(x).sort().join(',')===keys.slice().sort().join(',');
const canonical=x=>Array.isArray(x)?`[${x.map(canonical).join(',')}]`:object(x)?`{${Object.keys(x).sort().map(k=>`${JSON.stringify(k)}:${canonical(x[k])}`).join(',')}}`:JSON.stringify(x);
const result=status=>({status,retryAutomatically:false});

/** New domain, bound to both source and effective credential. Never accepts
 * historical unbound proofs; tokens contain identifiers and keyed digests only. */
export function createExplorationPlannerBindings({secret,source,apiKey}={}){
 if(!Buffer.isBuffer(secret)||secret.length<32||!['byok','default'].includes(source)||typeof apiKey!=='string'||!/^sk-[^\s]{20,300}$/.test(apiKey))throw Error('invalid configuration');
 const key=createHmac('sha256',secret).update('compor-exploration-planner-v1\0').update(source).update('\0').update(apiKey).digest();
 const mac=value=>createHmac('sha256',key).update(value).digest();
 const digest=value=>mac(`digest\0${canonical(value)}`).toString('hex');
 const issue=value=>{const payload=Buffer.from(JSON.stringify(value)).toString('base64url');return `ep1.${payload}.${mac(`proof\0${payload}`).toString('base64url')}`;};
 const verify=token=>{try{if(typeof token!=='string'||token.length>4096)return null;const [prefix,payload,signature,...extra]=token.split('.');if(prefix!=='ep1'||extra.length||!payload||!signature)return null;const raw=Buffer.from(payload,'base64url'),actual=Buffer.from(signature,'base64url'),expected=mac(`proof\0${payload}`);if(raw.toString('base64url')!==payload||actual.toString('base64url')!==signature||actual.length!==expected.length||!timingSafeEqual(actual,expected))return null;return JSON.parse(raw.toString('utf8'));}catch{return null;}};
 return Object.freeze({digest,issue,verify});
}


/** Pure orchestration around injected auth, durable store and managed provider.
 * Reserve must be atomic. This package does not itself provide a durable store. */
export function createExplorationPlanner({store,bindings,provider,authorize}={}){
 if(!['reserve','get','bind','finish'].every(k=>typeof store?.[k]==='function')||!['digest','issue','verify'].every(k=>typeof bindings?.[k]==='function')||!['create','get'].every(k=>typeof provider?.[k]==='function')||typeof authorize!=='function')throw Error('invalid configuration');
 async function prepare(input){
  if(!object(input)||![input.actor?.userId,input.projectId,input.batchId,input.requestId].every(uuid)||!(input.conversationId==='references'||uuid(input.conversationId))||typeof input.actor?.token!=='string'||!input.actor.token||!validateExplorationContext(input.context))return null;
  const permitted=await authorize({actor:input.actor,projectId:input.projectId,conversationId:input.conversationId});if(permitted!==true)return null;
  const scope={userId:input.actor.userId,projectId:input.projectId,conversationId:input.conversationId,batchId:input.batchId,requestId:input.requestId};
  const inputDigest=bindings.digest({scope,context:input.context});
  const completionSecret=bindings.digest({type:'planner-store-capability-v1',scope,inputDigest});
  if(!/^[0-9a-f]{64}$/.test(completionSecret))throw Error('invalid capability');
  const completionDigest=createHash('sha256').update(Buffer.from(completionSecret,'hex')).digest('hex');
  return {scope,inputDigest,completionSecret,completionDigest,db:{actor:input.actor,projectId:input.projectId,conversationId:input.conversationId,batchId:input.batchId,requestId:input.requestId}};
 }
 const validRecord=(record,scope,inputDigest)=>object(record)&&record.userId===scope.userId&&record.projectId===scope.projectId&&record.conversationId===scope.conversationId&&record.batchId===scope.batchId&&record.requestId===scope.requestId&&uuid(record.attemptId)&&record.inputDigest===inputDigest;
 async function submit(input){
  let c;try{c=await prepare(input);}catch{return result('unavailable');}if(!c)return result('unavailable');
  let reservation;try{reservation=await store.reserve({...c.db,userId:c.scope.userId,inputDigest:c.inputDigest,completionDigest:c.completionDigest});}catch{return result('unknown');}
  if(!['reserved','existing','busy','conflict','not_found'].includes(reservation?.status))return result('unknown');
  if(reservation.status==='not_found')return result('unavailable');
  if(reservation.status==='busy'||reservation.status==='conflict')return result(reservation.status);
  const record=reservation.record;if(!validRecord(record,c.scope,c.inputDigest))return result('unknown');
  if(reservation.status==='existing')return result(record.state==='failed'?'failed':'unknown');
  if(record.state!=='starting')return result('unknown');
  try{
   const confirmed=input.context.offerFacts.filter(f=>f.status==='confirmed');
   const created=await provider.create({scope:c.scope,context:{...input.context,offerFacts:confirmed}});
   if(!identifier(created?.sessionId,'sess'))throw Error('invalid provider result');
   const binding=bindings.issue({type:'recovery',...c.scope,attemptId:record.attemptId,inputDigest:c.inputDigest,sessionId:created.sessionId});
   await store.bind({...c.db,binding,completionSecret:c.completionSecret});
   return {...result('running'),requestId:c.scope.requestId};
  }catch{return result('unknown');}
 }
 async function poll(input){
  let c;try{c=await prepare(input);}catch{return result('unavailable');}if(!c)return result('unavailable');
  let record;try{record=await store.get(c.db);}catch{return result('unknown');}
  if(!validRecord(record,c.scope,c.inputDigest))return result('unknown');
  if(record.state==='failed')return result('failed');
  const claim=bindings.verify(record.binding);
  const expected={type:'recovery',...c.scope,attemptId:record.attemptId,inputDigest:c.inputDigest};
  if(!object(claim)||!Object.entries(expected).every(([k,v])=>claim[k]===v)||Object.keys(claim).length!==Object.keys(expected).length+1||!identifier(claim.sessionId,'sess'))return result('unknown');
  try{
   const observed=await provider.get({sessionId:claim.sessionId});
   if(observed?.status==='running')return result('running');
   if(observed?.status==='failed'){await store.finish({...c.db,state:'failed',completionSecret:c.completionSecret});return result('failed');}
   if(observed?.status!=='completed'||!identifier(observed.turnId,'turn'))return result('unknown');
   const plan=validateExplorationPlan(observed.plan,input.context);
   if(!plan){await store.finish({...c.db,state:'failed',completionSecret:c.completionSecret});return result('failed');}
   const planBinding=bindings.issue({type:'plan',...c.scope,attemptId:record.attemptId,inputDigest:c.inputDigest,sessionId:claim.sessionId,turnId:observed.turnId,planDigest:bindings.digest(plan)});
   await store.finish({...c.db,state:'completed',completionSecret:c.completionSecret});
   return {...result('completed'),requestId:c.scope.requestId,batchId:c.scope.batchId,plan,planBinding};
  }catch{return result('unknown');}
 }
 return Object.freeze({submit,poll});
}

/** Verifies provenance and exact content only; caller must separately authorize
 * identity, project, current context, intention and execution. */
export function verifyExplorationPlan({bindings,input,plan,token}={}){
 try{
  if(!bindings||!validateExplorationContext(input?.context)||![input.actor?.userId,input.projectId,input.batchId,input.requestId].every(uuid)||!(input.conversationId==='references'||uuid(input.conversationId))||!exact(plan,['version','items'])||!Array.isArray(plan.items))return false;
  if(!validateCompletedExplorationPlan(plan,input.context))return false;
  const scope={userId:input.actor.userId,projectId:input.projectId,conversationId:input.conversationId,batchId:input.batchId,requestId:input.requestId};
  const claim=bindings.verify(token),expected={type:'plan',...scope,inputDigest:bindings.digest({scope,context:input.context}),planDigest:bindings.digest(plan)};
  return object(claim)&&Object.keys(claim).length===Object.keys(expected).length+3&&uuid(claim.attemptId)&&identifier(claim.sessionId,'sess')&&identifier(claim.turnId,'turn')&&Object.entries(expected).every(([k,v])=>claim[k]===v);
 }catch{return false;}
}
