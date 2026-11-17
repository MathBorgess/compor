import type {Actor} from './contracts.js';
export type PlannerFact={id:string;label:string;value:string;status:'confirmed'|'pending'|'omitted'};
export type ExplorationPlannerContext={idea:string;offer:string;audience:string;goal:string;direction:string;offerFacts:PlannerFact[];accepted:string[];rejected:string[];feedback:Array<{action:'selected'|'rejected'|'comment';comment:string;composition:string;contrast:string}>};
export type ExplorationPlannerInput={actor:Actor;projectId:string;conversationId:string;batchId:string;requestId:string;context:ExplorationPlannerContext};
export type ExplorationPlanItem={position:number;creativePrompt:string;composition:string;contrast:string;differenceFromOthers:string;prompt:string};
export type ExplorationPlan={version:1;items:ExplorationPlanItem[]};
export type PlannerBindings={digest(value:unknown):string;issue(value:Record<string,unknown>):string;verify(token:unknown):unknown};
export type PlannerRecord={userId:string;projectId:string;conversationId:string;batchId:string;requestId:string;attemptId:string;inputDigest:string;state:'starting'|'running'|'completed'|'failed'|'unknown';binding:string|null};
type DbScope=Pick<ExplorationPlannerInput,'actor'|'projectId'|'conversationId'|'batchId'|'requestId'>;
export interface PlannerStore {
 reserve(input:DbScope & {userId:string;inputDigest:string}):Promise<{status:'reserved'|'existing';record:PlannerRecord}|{status:'busy'|'conflict'|'not_found'}>;
 get(input:DbScope):Promise<PlannerRecord|null>;
 bind(input:DbScope & {binding:string}):Promise<void>;
 finish(input:DbScope & {state:'completed'|'failed'}):Promise<void>;
}
export interface PlannerProvider {
 create(input:{scope:{userId:string;projectId:string;conversationId:string;batchId:string;requestId:string};context:ExplorationPlannerContext}):Promise<{sessionId:string}>;
 get(input:{sessionId:string}):Promise<{status:'running'|'failed'}|{status:'completed';turnId:string;plan:unknown}>;
}
export type PlannerResult={status:'running'|'failed'|'unknown'|'unavailable'|'busy'|'conflict';retryAutomatically:false;requestId?:string}|{status:'completed';retryAutomatically:false;requestId:string;batchId:string;plan:ExplorationPlan;planBinding:string};
export function createExplorationPlannerBindings(options:{secret:Buffer;source:'byok'|'default';apiKey:string}):Readonly<PlannerBindings>;
export function validateExplorationContext(value:unknown):value is ExplorationPlannerContext;
export function validateExplorationPlan(value:unknown,context:ExplorationPlannerContext):ExplorationPlan|null;
export function validateCompletedExplorationPlan(value:unknown,context:ExplorationPlannerContext):value is ExplorationPlan;
export function verifyExplorationPlan(input:{bindings:PlannerBindings;input:ExplorationPlannerInput;plan:ExplorationPlan;token:string}):boolean;
export function createExplorationPlanner(options:{store:PlannerStore;bindings:PlannerBindings;provider:PlannerProvider;authorize:(input:Pick<ExplorationPlannerInput,'actor'|'projectId'|'conversationId'>)=>Promise<boolean>}):Readonly<{submit(input:ExplorationPlannerInput):Promise<PlannerResult>;poll(input:ExplorationPlannerInput):Promise<PlannerResult>}>;
