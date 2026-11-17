import {createHmac,timingSafeEqual} from 'node:crypto';
import {createSessionBindings} from '@compor/agents-api/session-binding';
import type {SessionBindings} from '@compor/agents-api/session-binding';
import {createStudioBindings} from '@compor/agents-api/studio-chat-bindings';
import type {StudioBindings} from '@compor/agents-api/studio-chat-bindings';
import {credentialSigningKey} from './openai-credential.ts';
import type {OpenAiCredentialSource} from './openai-credential.ts';

type Configuration={secret:Buffer;source:OpenAiCredentialSource;apiKey?:string};
const boundBase=(secret:Buffer,source:OpenAiCredentialSource)=>createHmac('sha256',secret).update('compor-credential-bound-proofs-v1\0').update(source).digest();
function credentialMacKey({secret,source,apiKey}:Configuration) {
  return typeof apiKey==='string'&&/^sk-[^\s]{20,300}$/.test(apiKey)
    ? createHmac('sha256',secret).update('compor-provider-credential-v1\0').update(source).update('\0').update(apiKey).digest():null;
}
function readEnvelope(token:string,key:Buffer) {
  try{
    if(typeof token!=='string'||token.length>4096)return null;
    const parts=token.split('.');
    if(parts.length!==3||!['v1','v4','v5','v6','s1'].includes(parts[0])||!parts.slice(1).every(part=>/^[A-Za-z0-9_-]+$/.test(part)))return null;
    const raw=Buffer.from(parts[1],'base64url');if(raw.toString('base64url')!==parts[1])return null;
    const value:unknown=JSON.parse(raw.toString('utf8'));
    if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!=='credentialBound,credentialMac,proof'||!('credentialBound'in value)||value.credentialBound!==1||!('proof'in value)||typeof value.proof!=='string'||!value.proof.startsWith(parts[0]+'.')||!('credentialMac'in value)||typeof value.credentialMac!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(value.credentialMac))return null;
    const signature=Buffer.from(parts[2],'base64url'),expected=createHmac('sha256',key).update(`credential-envelope-v1\0${parts[0]}.${parts[1]}`).digest();
    if(signature.length!==expected.length||signature.toString('base64url')!==parts[2]||!timingSafeEqual(signature,expected))return null;
    return {inner:value.proof,signature:value.credentialMac};
  }catch{return null;}
}
function tokenCodec(options:Configuration) {
  const key=credentialMacKey(options),base=boundBase(options.secret,options.source);
  const sign=(token:string)=>key?createHmac('sha256',key).update(token).digest():null;
  return {
    issue(token:string){
      const signature=sign(token);if(!signature)throw Error('credential unavailable');
      const prefix=token.split('.')[0],payload=Buffer.from(JSON.stringify({credentialBound:1,proof:token,credentialMac:signature.toString('base64url')})).toString('base64url');
      const outer=createHmac('sha256',base).update(`credential-envelope-v1\0${prefix}.${payload}`).digest('base64url');
      return `${prefix}.${payload}.${outer}`;
    },
    verify(token:string){
      const value=readEnvelope(token,base);if(!value)return null;
      const signature=Buffer.from(value.signature,'base64url'),expected=sign(value.inner);
      return expected&&signature.length===expected.length&&signature.toString('base64url')===value.signature&&timingSafeEqual(signature,expected)?value.inner:null;
    },
  };
}
function verifyProvider<T extends {token:string},R>(value:T,decode:(token:string)=>string|null,current:(input:T)=>R|null,legacy:((input:T)=>R|null)|null):R|null {
  const inner=decode(value.token);if(inner)return current({...value,token:inner});
  return legacy?legacy(value):null;
}

/** New proofs bind both source and effective credential. The per-message MAC
 * is opaque, not a stable fingerprint. Historical unbound BYOK proofs remain
 * readable; new inner proofs use a different signing domain, so stripping the
 * envelope cannot downgrade them into that historical compatibility path. */
export function createCredentialSessionBindings(options:Configuration):Readonly<SessionBindings> {
  const current=createSessionBindings({secret:boundBase(options.secret,options.source)});
  const legacy=options.source==='byok'?createSessionBindings({secret:options.secret}):null;
  const stable=createSessionBindings({secret:credentialSigningKey(options.secret,options.source)??options.secret});
  const codec=tokenCodec(options);
  const bindings:SessionBindings={
    issue:value=>codec.issue(current.issue(value)),
    verify:value=>verifyProvider(value,codec.verify,current.verify,legacy?.verify??null),
    issueRecovery:value=>codec.issue(current.issueRecovery(value)),
    verifyRecovery:value=>verifyProvider(value,codec.verify,current.verifyRecovery,legacy?.verifyRecovery??null),
    verifyBoundRecovery:value=>verifyProvider(value,codec.verify,current.verifyRecovery,null),
    recoveryAttemptKey:stable.recoveryAttemptKey,
    issueAction:value=>codec.issue(current.issueAction(value)),
    verifyAction:value=>verifyProvider(value,codec.verify,current.verifyAction,legacy?.verifyAction??null),
    issueApprovedAction:value=>{
      const inner=codec.verify(value.actionBinding);
      if(inner){
        return codec.issue(current.issueApprovedAction({...value,actionBinding:inner}));
      }
      if(!legacy)throw Error('invalid legacy proof');
      return legacy.issueApprovedAction(value);
    },
    verifyApprovedAction:value=>verifyProvider(value,codec.verify,current.verifyApprovedAction,legacy?.verifyApprovedAction??null),
  };
  return Object.freeze(bindings);
}

export function createCredentialStudioBindings(options:Configuration):StudioBindings {
  const current=createStudioBindings({secret:boundBase(options.secret,options.source)});
  const legacy=options.source==='byok'?createStudioBindings({secret:options.secret}):null;
  const stable=createStudioBindings({secret:credentialSigningKey(options.secret,options.source)??options.secret});
  const codec=tokenCodec(options);
  // Content digests and local action IDs stay stable across credential rotation.
  // verify({...,args}) checks arguments in the current or legacy proof domain.
  return {digest:stable.digest,actionRequestId:stable.actionRequestId,
    issue:value=>codec.issue(current.issue(value)),
    verify:value=>verifyProvider(value,codec.verify,current.verify,legacy?.verify??null),
  };
}

/** Local SQL fencing does not contact a provider. It may verify the original
 * signed action without possessing the old key; actor/version ownership and
 * the inner server signature are still mandatory. Never use for generation. */
export function createCredentialReconciliationBindings({secret}:{secret:Buffer}):Pick<SessionBindings,'verifyAction'> {
  const own=createSessionBindings({secret:boundBase(secret,'byok')}),shared=createSessionBindings({secret:boundBase(secret,'default')}),legacy=createSessionBindings({secret});
  return {verifyAction:value=>{
    const envelope=readEnvelope(value.token,boundBase(secret,'byok'))??readEnvelope(value.token,boundBase(secret,'default'));
    if(envelope){
      return own.verifyAction({...value,token:envelope.inner})??shared.verifyAction({...value,token:envelope.inner});
    }
    return legacy.verifyAction(value);
  }};
}
