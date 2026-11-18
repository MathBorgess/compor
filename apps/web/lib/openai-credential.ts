import { createHmac } from 'node:crypto';
import {byokJsonMediaType} from './openai-byok-transport.ts';
import type { Actor } from './agent-auth.ts';

export type OpenAiCredentialSource = 'byok' | 'default';
export type PreparedOpenAiRequest = {request:Request;source:OpenAiCredentialSource;actor?:Actor;apiKey?:string};
type CredentialDependencies = {
  appOrigin:string;
  defaultEnabled:boolean;
  resolveActor:()=>Promise<Actor|null>;
  ownsProject:(actor:Actor,projectId:string)=>Promise<boolean>;
  ownsVersion?:(actor:Actor,projectId:string,pieceId:string,version:number)=>Promise<boolean>;
  resolveDefault:()=>Promise<string|null>;
};
export type CredentialRequestOptions = {
  bodyLimit:number;
  bodyTooLargeStatus?:400|413;
  /** The last two modes accept either carrier for old clients, then normalize server-side. */
  keyLocation?:'body'|'header'|'header-or-legacy-body'|'separate';
  projectLocation?:'body'|'header';
  versionScope?:boolean;
  freshSubmission?:boolean;
  failure?:(error:string,status:number)=>Response;
};
const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const keyValid=(value:unknown):value is string=>typeof value==='string'&&/^sk-[^\s]{20,300}$/.test(value);
const reply=(error:string,status:number)=>Response.json({error},{status,headers:{'Cache-Control':'no-store'}});
const keyHeader='x-compor-openai-key';

/** BYOK keeps its historical proofs. Default credentials use a separate MAC
 * domain, never a key fingerprint or a provider secret in public claims. */
export function credentialSigningKey(secret:Buffer|null,source:OpenAiCredentialSource):Buffer|null {
  if(!secret)return null;
  return source==='byok'?secret:createHmac('sha256',secret).update('compor-default-openai-bindings-v1\0').digest();
}

class BodyTooLarge extends Error {}
async function readBody(request:Request,limit:number) {
  if(!request.body)throw Error('missing body');
  const reader=request.body.getReader(),chunks:Uint8Array[]=[];let length=0;
  try {
    for(;;){const {value,done}=await reader.read();if(done)break;length+=value.byteLength;if(length>limit)throw new BodyTooLarge();chunks.push(value);}
    const bytes=Buffer.concat(chunks),value:unknown=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
    if(!value||typeof value!=='object'||Array.isArray(value))throw Error('invalid object');
    return {bytes,value:value as Record<string,unknown>};
  } finally {try{Promise.resolve(reader.cancel()).catch(()=>{});}catch{}try{reader.releaseLock();}catch{}}
}
function rebuiltRequest(request:Request,bytes:Uint8Array,headers:Headers) {
  headers.delete('content-length');
  return new Request(request.url,{method:request.method,headers,body:Buffer.from(bytes),signal:request.signal});
}

/** The supplied key wins even when invalid. Missing credentials alone may use
 * Vault, and only after verified identity plus the exact resource scope. */
export async function prepareOpenAiRequest(request:Request,deps:CredentialDependencies,options:CredentialRequestOptions):Promise<PreparedOpenAiRequest|Response> {
  const fail=options.failure??reply;
  if(request.method!=='POST')return fail('method_not_allowed',405);
  if(request.headers.get('origin')!==deps.appOrigin)return fail('invalid_origin',403);
  const location=options.keyLocation??'body';
  const contentType=request.headers.get('content-type')??'';
  const inHeader=request.headers.has(keyHeader);
  const markedByok=contentType.trim().toLowerCase()===byokJsonMediaType;
  if(markedByok){
    if(!inHeader||(location!=='header-or-legacy-body'&&location!=='separate'))return fail('invalid_request',400);
  }else if(!/^application\/json(?:\s*;|$)/i.test(contentType))return fail('invalid_request',400);
  let parsed:Awaited<ReturnType<typeof readBody>>;
  try{parsed=await readBody(request,options.bodyLimit);}catch(error){return fail('invalid_request',error instanceof BodyTooLarge?(options.bodyTooLargeStatus??400):400);}
  const inBody=Object.hasOwn(parsed.value,'apiKey');
  if((inHeader&&inBody)||(inHeader&&location==='body')||(inBody&&location==='header'))return fail('invalid_request',400);
  function prepare(source:OpenAiCredentialSource,apiKey:unknown,actor?:Actor):PreparedOpenAiRequest {
    const headers=new Headers(request.headers);
    if(markedByok)headers.set('content-type','application/json');
    let bytes=parsed.bytes;
    if(location==='separate'){
      headers.delete(keyHeader);
      if(inBody){const body={...parsed.value};delete body.apiKey;bytes=Buffer.from(JSON.stringify(body));}
    }else if(location==='header'){
      if(source==='default'&&keyValid(apiKey))headers.set(keyHeader,apiKey);
    }else if(inHeader||source==='default'){
      // The managed chat handlers still consume this field in their internal contract.
      headers.delete(keyHeader);
      bytes=Buffer.from(JSON.stringify({...parsed.value,apiKey}));
    }
    return {request:rebuiltRequest(request,bytes,headers),source,...(actor?{actor}:{}),...(keyValid(apiKey)?{apiKey}:{})};
  }
  if(inHeader||inBody||!deps.defaultEnabled)return prepare('byok',inHeader?request.headers.get(keyHeader):parsed.value.apiKey);
  const projectId=options.projectLocation==='header'?request.headers.get('x-compor-project-id'):parsed.value.projectId;
  if(!uuid(projectId))return fail('invalid_request',400);
  let actor:Actor|null;
  try{actor=await deps.resolveActor();}catch{return fail('unavailable',503);}
  if(!actor||!uuid(actor.userId)||typeof actor.token!=='string'||!actor.token)return fail('unauthorized',401);
  try{
    if(!await deps.ownsProject(actor,projectId))return fail('not_found',404);
    if(options.versionScope){
      const {pieceId,version}=parsed.value;
      if(!uuid(pieceId)||typeof version!=='number'||!Number.isSafeInteger(version)||version<1||version>2147483647)return fail('invalid_request',400);
      if(!deps.ownsVersion||!await deps.ownsVersion(actor,projectId,pieceId,version))return fail('not_found',404);
    }
  }catch{return fail('unavailable',503);}
  const newChatOperation=parsed.value.op===undefined||parsed.value.op==='submit'||parsed.value.op==='reference_selection';
  const unavailable=()=>options.freshSubmission&&uuid(parsed.value.requestId)&&newChatOperation
    // This proves only this invocation did not enter a handler. Clients may
    // close a fresh local send, never an older uncertain attempt or a poll.
    ? Response.json({status:'failed',error:'default_credential_unavailable',failurePhase:'before_submission',requestId:parsed.value.requestId,retryAutomatically:false},{status:503,headers:{'Cache-Control':'no-store'}})
    : fail('default_credential_unavailable',503);
  let apiKey:string|null;
  try{apiKey=await deps.resolveDefault();}catch{return unavailable();}
  if(!keyValid(apiKey)||request.signal.aborted)return unavailable();
  return prepare('default',apiKey,actor);
}

/** Availability is not authorization to generate and never exposes the key. */
export function createCredentialStatusHandler(deps:Pick<CredentialDependencies,'appOrigin'|'resolveActor'|'resolveDefault'>) {
  const status=(available:boolean,code=200)=>Response.json({defaultAvailable:available},{status:code,headers:{'Cache-Control':'no-store','Vary':'Cookie'}});
  return async(request:Request)=>{
    if(request.method!=='GET')return status(false,405);
    const origin=request.headers.get('origin');
    if((origin!==null&&origin!==deps.appOrigin)||request.headers.get('sec-fetch-site')==='cross-site')return status(false,403);
    try{
      const actor=await deps.resolveActor();
      if(!actor||!uuid(actor.userId)||typeof actor.token!=='string'||!actor.token)return status(false,401);
      return status(keyValid(await deps.resolveDefault()));
    }catch{return status(false,503);}
  };
}
