import {isAgentCallId} from './agent-call-id.mjs';
import {createHmac,timingSafeEqual} from 'node:crypto';
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
const identifier=(value,prefix)=>typeof value==='string'&&new RegExp(`^${prefix}_[A-Za-z0-9_-]{1,128}$`).test(value)&&!/sk-/i.test(value);
export function createStudioBindings({secret,now=Date.now}={}) {
 if(!Buffer.isBuffer(secret)||secret.length<32||typeof now!=='function')throw TypeError('invalid binding configuration');
 const key=Buffer.from(secret);
 const digest=value=>createHmac('sha256',key).update('studio-content-v1\0').update(JSON.stringify(value)).digest('hex');
 function issue(value){
  const {userId,projectId,requestId,attemptId,sessionId,turnId,callId,name,args}=value;
  if(![userId,projectId,requestId,attemptId].every(uuid)||!identifier(sessionId,'sess')||!identifier(turnId,'turn')||!isAgentCallId(callId)||typeof name!=='string'||!/^[a-z_]{1,80}$/.test(name))throw Error('invalid action binding');
  const issuedAt=now(),expiresAt=issuedAt+10*60*1000;
  const payload=Buffer.from(JSON.stringify({userId,projectId,requestId,attemptId,sessionId,turnId,callId,name,argsDigest:digest(args),issuedAt,expiresAt})).toString('base64url');
  return `s1.${payload}.${createHmac('sha256',key).update(`s1.${payload}`).digest('base64url')}`;
 }
 function verify(input){
  try{
   const {token,userId,projectId,requestId}=input;
   if(typeof token!=='string'||token.length>3072||![userId,projectId,requestId].every(uuid))return null;
   const p=token.split('.');if(p.length!==3||p[0]!=='s1'||!p.slice(1).every(x=>/^[A-Za-z0-9_-]+$/.test(x)))return null;
   const sig=Buffer.from(p[2],'base64url'),expected=createHmac('sha256',key).update(`s1.${p[1]}`).digest();
   if(sig.length!==expected.length||!timingSafeEqual(sig,expected)||sig.toString('base64url')!==p[2])return null;
   const raw=Buffer.from(p[1],'base64url');if(raw.toString('base64url')!==p[1])return null;
   const v=JSON.parse(raw.toString()),clock=now();
   if(Object.keys(v).length!==11||v.userId!==userId||v.projectId!==projectId||v.requestId!==requestId||!uuid(v.attemptId)||!identifier(v.sessionId,'sess')||!identifier(v.turnId,'turn')||!isAgentCallId(v.callId)||typeof v.name!=='string'||!/^[a-z_]{1,80}$/.test(v.name)||!/^[0-9a-f]{64}$/.test(v.argsDigest)||!Number.isSafeInteger(v.issuedAt)||v.expiresAt!==v.issuedAt+10*60*1000||clock<v.issuedAt||clock>=v.expiresAt)return null;
   // Argument checks must use the signing domain of this proof. A credential
   // wrapper may intentionally expose another digest for stable idempotency.
   if(Object.hasOwn(input,'args')&&digest(input.args)!==v.argsDigest)return null;
   return v;
  }catch{return null;}
 }
 function actionRequestId(value){const h=digest(value).slice(0,32).split('');h[12]='4';h[16]=((parseInt(h[16],16)&3)|8).toString(16);const s=h.join('');return`${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`;}
 return {digest,issue,verify,actionRequestId};
}
