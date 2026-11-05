import type {AttemptScope,VersionScope,OwnsVersion} from './contracts.js';
import type {SessionBindings} from './session-binding.js';
import type {ImageReservationStore} from './image-tool-reservation.js';
import type {UsageStore} from './usage-store.js';
export type ImageResultInput=AttemptScope & VersionScope & {actionBinding:string;executionId:string;apiKey:string};
export type ImageResult={status:'accepted'|'rejected'}|{status:'unknown';retryAutomatically:false};
export function createImageToolResultSender(options:{bindings:SessionBindings;ownsVersion:OwnsVersion;reservations:ImageReservationStore;usage?:UsageStore;fetch?:typeof fetch;sendTimeoutMs?:number}):(input:ImageResultInput)=>Promise<ImageResult>;
