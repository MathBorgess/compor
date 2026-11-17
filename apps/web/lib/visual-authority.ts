import {visualInputDigest} from '@compor/agents-api/visual-input';
import type {VisualInputManifest} from '@compor/agents-api/visual-input-contract';
import type {Actor} from './agent-auth.ts';
import type {AuthConfig} from './supabase.ts';
import {referenceConsentSecret} from './reference-authority-route.ts';
import {createReferenceAuthorityStore} from './reference-authority-store.ts';

export type VisualAuthorityScope={actor:Actor;projectId:string;conversationId:string;batchId:string|null;requestId:string;purpose:'parallel'|'replacement'|'artwork';visualInput:VisualInputManifest;consentHeader:string|null};
export type VisualAuthority={requestId:string;manifestDigest:string;consentSecret:string|null};

/** An authenticated snapshot and its capability are checked again transactionally at admission. */
export function createVisualAuthority(config:Pick<AuthConfig,'service'|'key'>,enabled:boolean,fetchApi:typeof fetch=fetch){
 const store=createReferenceAuthorityStore(config,fetchApi);
 return async(input:VisualAuthorityScope):Promise<VisualAuthority|null>=>{
  if(!enabled)return null;
  const authority={requestId:input.requestId,manifestDigest:visualInputDigest(input.visualInput),consentSecret:referenceConsentSecret(input.consentHeader)};
  return await store.check(input.actor,{projectId:input.projectId,conversationId:input.conversationId,batchId:input.batchId,requestId:input.requestId,purpose:input.purpose,manifestDigest:authority.manifestDigest,consentSecret:authority.consentSecret})?authority:null;
 };
}
