import type {ResolveActor,OwnsProject,OwnsVersion,ProjectScope,RequestHandler} from './contracts.js';
import type {AttemptStore} from './attempt-store.js';
import type {SessionBindings} from './session-binding.js';
import type {UsageStore} from './usage-store.js';
import type {StudioStore} from './studio-chat-store.js';
import type {StudioBindings} from './studio-chat-bindings.js';
import type {StudioEventName,StudioEventMetadata} from './studio-telemetry.js';
import type {ActionInputByName} from './studio-chat-tools.js';
export type DurableAction=(ProjectScope & {name:'compor_renomear_projeto';args:ActionInputByName['compor_renomear_projeto'];result:{status:'completed';title:string}})|(ProjectScope & {name:'compor_salvar_versao';args:ActionInputByName['compor_salvar_versao'];result:{status:'completed';pieceId:string;version:number}});
export interface StudioChatOptions {appOrigin:string;resolveActor:ResolveActor;ownsProject:OwnsProject;ownsVersion?:OwnsVersion;verifyDurableResult?:(input:DurableAction)=>Promise<boolean>;store:StudioStore;attempts:AttemptStore;usage?:UsageStore;bindings:SessionBindings;studioBindings:StudioBindings;onEvent?:(name:StudioEventName,metadata:StudioEventMetadata)=>void|Promise<void>;fetch?:typeof fetch;now?:()=>number}
export function createStudioChatHandlers(options:StudioChatOptions):{chat:RequestHandler;action:RequestHandler};
