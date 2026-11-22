export type StudioEventName='attempt_reserved'|'session_created'|'session_reused'|'turn_observed'|'action_received'|'action_accepted'|'unknown';
export interface StudioEventMetadata {requestId?:string;attemptId?:string;sessionId?:string;turnId?:string;callId?:string;callIdAccepted?:boolean;phase?:string;turnStatus?:string;model?:string;postFormat?:'single'|'carousel'|'collection'|'story';skillVersion?:string;durationMs?:number;inputTokens?:number;outputTokens?:number;providerStatusCode?:number}
export function recordStudioEvent(name:StudioEventName,metadata?:StudioEventMetadata):void;
