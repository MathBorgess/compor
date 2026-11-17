import {agentSigningKey} from './agent-config.ts';

/** Server configuration only; the person's credential and intent are checked separately per request. */
export function parallelExplorationAvailable(authConfigured:boolean,env:NodeJS.ProcessEnv=process.env):boolean{
  return authConfigured&&env.COMPOR_PARALLEL_EXPLORATION_ENABLED==='true'&&env.COMPOR_PRIVATE_IMAGES_ENABLED==='true'&&agentSigningKey(env)!==null;
}
