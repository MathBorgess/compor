import {isReplaceableExplorationOutcome} from './exploration-image-outcome.ts';
import type {BatchSnapshot} from './parallel-exploration-client.ts';
import type {ParallelJournal} from './parallel-exploration-journal.ts';

type Observation={snapshot:BatchSnapshot;journal:ParallelJournal};
type Options={inspect:()=>Promise<Observation>;isActive:()=>boolean;onObservation:(value:Observation)=>void|Promise<void>;onUnavailable:()=>void;sleep:(ms:number)=>Promise<void>;intervalMs:number};

/** Read-only observation; the in-flight execute command is deliberately not owned here. */
export async function observeParallelBatch({inspect,isActive,onObservation,onUnavailable,sleep,intervalMs}:Options):Promise<void>{
  if(!Number.isSafeInteger(intervalMs)||intervalMs<500||intervalMs>60_000)throw Error('invalid_observation_interval');
  while(isActive()){
    try{
      const value=await inspect();
      if(!isActive())return;
      await onObservation(value);
      if(value.snapshot.images.some(image=>image.status==='unknown')||value.snapshot.images.every(image=>image.status==='completed'||isReplaceableExplorationOutcome(image.status)))return;
    }catch{
      if(!isActive())return;
      onUnavailable();
    }
    if(isActive())await sleep(intervalMs);
  }
}
