import type {ProjectAgentOptions} from './project-route.js';
import type {RequestHandler} from './contracts.js';
export function createAgentRecoveryHandler(options:Pick<ProjectAgentOptions,'appOrigin'|'resolveActor'|'ownsProject'|'attempts'|'bindings'|'fetch'>):RequestHandler;
