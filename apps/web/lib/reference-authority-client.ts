import {sha256Hex} from './browser-bytes.ts';
import * as z from './schema.ts';
import {parseVisualInputManifest,type VisualInputManifest} from '@compor/agents-api/visual-input-contract';

const uuid=z.uuid(), revision=z.number().check(z.int()).check(z.minimum(0)).check(z.maximum(Number.MAX_SAFE_INTEGER));
const digest=z.string().check(z.regex(/^[0-9a-f]{64}$/));
const reference=z.strictObject({id:uuid,inputOrigin:z.enum(['local-upload','external','generated']),sourceDigest:digest});
const post=z.strictObject({pieceId:uuid,referenceIds:z.array(uuid).check(z.maxLength(20)),excludedReferenceIds:z.array(uuid).check(z.maxLength(20))});
const state=z.strictObject({version:z.literal(1),references:z.array(reference).check(z.maxLength(500)),projectReferenceIds:z.array(uuid).check(z.maxLength(20)),posts:z.array(post).check(z.maxLength(500))});
const readResult=z.strictObject({status:z.literal('ready'),revision,state});
const commandResult=z.strictObject({status:z.enum(['applied','existing']),commandId:uuid,revision});
const resolvedCommand=z.union([z.strictObject({status:z.literal('applied'),commandId:uuid,revision}),z.strictObject({status:z.literal('fenced'),commandId:uuid})]);
const receiptResult=z.union([resolvedCommand,z.strictObject({status:z.literal('absent')})]);
const consentGrant=z.union([z.strictObject({status:z.literal('granted'),consentId:uuid,capability:z.string().check(z.regex(/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/))}),z.strictObject({status:z.literal('existing'),consentId:uuid})]);
const consentState=z.strictObject({state:z.enum(['active','revoked','absent']),consentId:uuid});
const consentRevoked=z.strictObject({status:z.literal('revoked'),consentId:uuid});
const snapshot=z.strictObject({requestId:uuid,projectId:uuid,conversationId:z.union([z.literal('references'),uuid]),batchId:z.nullable(uuid),purpose:z.enum(['parallel','replacement','artwork']),selectionRevision:revision,manifestDigest:digest,consentId:z.nullable(uuid)});
const snapshotCreate=z.strictObject({status:z.enum(['created','existing']),snapshot});
const snapshotRead=z.union([z.strictObject({status:z.literal('found'),snapshot}),z.strictObject({status:z.literal('absent')})]);
export type ReferenceAuthoritySnapshotInput={projectId:string;conversationId:string;requestId:string;batchId:string|null;purpose:'parallel'|'replacement'|'artwork';selectionRevision:number;visualInput:VisualInputManifest;consentId?:string};
export type ReferenceAuthorityWrite={version:1;references:{id:string;inputOrigin:'local-upload'|'external'|'generated';source:null|{originUrl:string;board:string}|{projectId:string;imageId:string}}[];projectReferenceIds:string[];posts:{pieceId:string;referenceIds:string[];excludedReferenceIds:string[]}[]};
export type ReferenceAuthorityRead=z.infer<typeof readResult>;

export function visualManifestDigest(input:VisualInputManifest){
 const manifest=parseVisualInputManifest(input);
 return sha256Hex(`compor-visual-input-v${manifest.version}\0${JSON.stringify(manifest)}`);
}

/** Each call makes exactly one request. Conflicts and lost replies require explicit reconciliation. */
export function createReferenceAuthorityClient(fetchApi:typeof fetch=fetch){
 async function post(path:'selection'|'consent'|'snapshot',body:Record<string,unknown>,capability?:string){
  const response=await fetchApi(`/api/studio/reference-authority/${path}`,{method:'POST',headers:{'content-type':'application/json',...(capability?{'x-compor-reference-consent':capability}:{})},body:JSON.stringify(body)});
  if(!response.ok)throw Error(response.status===409?'reference_authority_conflict':'reference_authority_unavailable');
  return await response.json() as unknown;
 }
 return {
  async read(projectId:string){return readResult.parse(await post('selection',{op:'read',projectId}));},
  async write(projectId:string,commandId:string,expectedRevision:number,value:ReferenceAuthorityWrite){const result=commandResult.parse(await post('selection',{op:'write',projectId,commandId,expectedRevision,state:value}));if(result.commandId!==commandId)throw Error('reference_authority_mismatch');return result;},
  async receipt(projectId:string,commandId:string){const result=receiptResult.parse(await post('selection',{op:'receipt',projectId,commandId}));if(result.status!=='absent'&&result.commandId!==commandId)throw Error('reference_authority_mismatch');return result;},
  async fence(projectId:string,commandId:string){const result=resolvedCommand.parse(await post('selection',{op:'fence',projectId,commandId}));if(result.commandId!==commandId)throw Error('reference_authority_mismatch');return result;},
  async grant(consentId:string){const result=consentGrant.parse(await post('consent',{op:'grant',consentId}));if(result.consentId!==consentId)throw Error('reference_authority_mismatch');return result;},
  async consentState(consentId:string){const result=consentState.parse(await post('consent',{op:'state',consentId}));if(result.consentId!==consentId)throw Error('reference_authority_mismatch');return result;},
  async createSnapshot(input:ReferenceAuthoritySnapshotInput,capability?:string){const result=snapshotCreate.parse(await post('snapshot',{op:'create',...input},capability));const value=result.snapshot;if(value.requestId!==input.requestId||value.projectId!==input.projectId||value.conversationId!==input.conversationId||value.batchId!==input.batchId||value.purpose!==input.purpose||value.selectionRevision!==input.selectionRevision||value.manifestDigest!==await visualManifestDigest(input.visualInput)||value.consentId!==(input.consentId??null))throw Error('reference_authority_mismatch');return result;},
  async readSnapshot(projectId:string,requestId:string){const result=snapshotRead.parse(await post('snapshot',{op:'read',projectId,requestId}));if(result.status==='found'&&(result.snapshot.projectId!==projectId||result.snapshot.requestId!==requestId))throw Error('reference_authority_mismatch');return result;},
  async revoke(consentId:string){const result=consentRevoked.parse(await post('consent',{op:'revoke',consentId}));if(result.consentId!==consentId)throw Error('reference_authority_mismatch');return result;},
 };
}
