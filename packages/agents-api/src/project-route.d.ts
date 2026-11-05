import type {ResolveActor,OwnsProject,ProjectScope,RequestHandler,McpTool,McpInvocation} from './contracts.js';
import type {AttemptStore} from './attempt-store.js';
import type {SessionBindings} from './session-binding.js';
import type {UsageStore} from './usage-store.js';
export interface ProjectAgentOptions {appOrigin:string;resolveActor:ResolveActor;ownsProject:OwnsProject;attempts:AttemptStore;bindings:SessionBindings;usage?:UsageStore;withMcp?:(scope:ProjectScope,submit:(tool?:McpTool)=>Promise<void>)=>Promise<McpInvocation>;fetch?:typeof fetch;enableRecovery?:boolean}
export function createProjectAgentHandler(options:ProjectAgentOptions):RequestHandler;
