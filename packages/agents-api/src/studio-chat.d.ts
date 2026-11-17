import type {ResolveActor,OwnsProject,OwnsVersion,ProjectScope,RequestHandler} from './contracts.js';
import type {AttemptStore} from './attempt-store.js';
import type {SessionBindings} from './session-binding.js';
import type {UsageStore} from './usage-store.js';
import type {StudioStore} from './studio-chat-store.js';
import type {StudioBindings} from './studio-chat-bindings.js';
import type {StudioEventName,StudioEventMetadata} from './studio-telemetry.js';
import type {ActionInputByName} from './studio-chat-tools.js';
import type {VisualInputManifest} from './visual-input-contract.js';
export interface StudioOfferFact {id:string;label:string;value:string;status:'confirmed'|'pending'|'omitted'}
export type StudioAudienceResolution={status:'resolved';value:string}|{status:'conflict';brief:string;persona:string};
export interface StudioPostContext {objective:string;message:string;action:string}
export interface StudioPendingInspectionRequest {op:'inspect_pending';projectId:string;requestId:string;apiKey:string;conversationId?:string}
export type StudioPendingInspectionResponse={status:'failed';retryAutomatically:false;error?:'provider_usage_limit'}|{status:'running'|'action_required'|'completed'|'unknown';retryAutomatically:false};
export interface StudioContext {postContext?:StudioPostContext;revision:number;projectTitleProvisional?:boolean;offerFacts?:StudioOfferFact[];audienceResolution?:StudioAudienceResolution;[key:string]:unknown}
export type DurableAction=(ProjectScope & {name:'compor_renomear_projeto';args:ActionInputByName['compor_renomear_projeto'];result:{status:'completed';title:string}})|(ProjectScope & {name:'compor_salvar_versao';args:ActionInputByName['compor_salvar_versao'];result:{status:'completed';pieceId:string;version:number}});
type StudioVisualAuthority={pieceId:string|null;manifestDigest:string;consentSecret:string|null};
type StudioVisualScope=ProjectScope & {requestId:string;conversationId?:string};
export interface StudioChatOptions {appOrigin:string;resolveActor:ResolveActor;ownsProject:OwnsProject;ownsVersion?:OwnsVersion;verifyDurableResult?:(input:DurableAction)=>Promise<boolean>;selectedVisualsEnabled?:boolean;selectedVisualsRequired?:boolean;authorizeVisualInput?:(input:ProjectScope & {conversationId?:string;context:StudioContext;visualInput:VisualInputManifest})=>Promise<boolean>;prepareVisualAuthority?:(input:StudioVisualScope & {visualInput:VisualInputManifest;consentHeader:string|null})=>Promise<StudioVisualAuthority|null>;checkVisualAuthority?:(input:StudioVisualScope & {visualAuthority:StudioVisualAuthority})=>Promise<boolean>;store:StudioStore;attempts:AttemptStore;usage?:UsageStore;bindings:SessionBindings;studioBindings:StudioBindings;onEvent?:(name:StudioEventName,metadata:StudioEventMetadata)=>void|Promise<void>;fetch?:typeof fetch;readPages?:(message:string)=>Promise<Array<{url:string;status:'available'|'unavailable'|'not_requested';content?:string}>>;now?:()=>number}
export function createStudioChatHandlers(options:StudioChatOptions):{chat:RequestHandler;action:RequestHandler};
