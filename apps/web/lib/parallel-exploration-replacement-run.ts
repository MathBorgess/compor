import {createParallelJournalStore,type ParallelPreparation,type ParallelJournal} from './parallel-exploration-journal.ts';
import {createParallelExplorationClient,type BatchSnapshot} from './parallel-exploration-client.ts';
import {createParallelIntentClient} from './parallel-exploration-intent-client.ts';
import {createParallelReplacementClient,type ParallelReplacementClaim} from './parallel-exploration-replacement-client.ts';

type Options={preparation:ParallelPreparation;position:number;key:string;allowed:()=>boolean;currentContext:()=>Promise<unknown>;onSnapshot:(snapshot:BatchSnapshot,journal:ParallelJournal)=>Promise<void>;onNotice:(notice:string)=>void};
const sleep=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));

/** One explicit replacement; the durable claim and submission marker precede the network effect. */
export function createReplacementRun(options:Options){
  const {preparation,position,key,allowed,onSnapshot,onNotice}=options,store=createParallelJournalStore(),intents=createParallelIntentClient(),command=createParallelReplacementClient(),abort=new AbortController();
  const scope={userId:preparation.userId,projectId:preparation.projectId,batchId:preparation.batchId};
  let active=true,claim:ParallelReplacementClaim|null=null,stopPromise:Promise<void>|null=null;
  const valid=()=>active&&allowed();
  const ensure=()=>{if(!valid())throw Error('replacement_paused');};
  async function stop(){
    if(stopPromise)return stopPromise;active=false;abort.abort();const captured=claim;
    if(!captured)return;
    stopPromise=(async()=>{
      const journal=await store.load(scope).catch(()=>null),saved=journal?.replacements?.at(-1);
      if(!journal||!saved||saved.intentId!==captured.intentId)return;
      const authority={...preparation,intentId:saved.intentId,expectedEpoch:saved.expectedEpoch,intentEpoch:saved.intentEpoch};
      const remote=intents.revoke(authority).catch(()=>null);
      try{if(!saved.revocationRequested)await store.updateReplacement(scope,journal.revision,{kind:'revoke'});}catch{/* Remote revoke is still attempted. */}
      const result=await remote;if(!result||result.status!=='revoked')return;
      try{let current=await store.load(scope);let latest=current?.replacements?.at(-1);if(!current||!latest||latest.intentId!==captured.intentId)return;if(!latest.revocationRequested)current=await store.updateReplacement(scope,current.revision,{kind:'revoke'});latest=current.replacements?.at(-1);if(latest&&!latest.revocationConfirmed)await store.updateReplacement(scope,current.revision,{kind:'revoke_confirmed',...(result.revocationEpoch==null?{}:{epoch:result.revocationEpoch})});}catch{/* The saved claim remains blocked for explicit recovery. */}
    })();return stopPromise;
  }
  async function run(){
    try{
      if(!navigator.locks)throw Error('locks_unavailable');
      await navigator.locks.request(`compor-exploration:${preparation.userId}`,{ifAvailable:true},async lock=>{
        if(!lock)throw Error('busy');ensure();
        const context=await options.currentContext();ensure();if(JSON.stringify(context)!==JSON.stringify(preparation.context)){onNotice('O contexto mudou desde o plano. Revise a tentativa antes de pedir novas propostas.');return;}
        const client=createParallelExplorationClient({store,canInspect:valid});
        const planned=await client.inspectPlan(preparation,key);ensure();if(planned.status!=='completed'||!planned.binding)throw Error('plan_unconfirmed');
        const observed=await client.inspectBatch(preparation,Date.now,false);ensure();await onSnapshot(observed.snapshot,observed.journal);ensure();
        const child=observed.journal.progress.children.find(value=>value.position===position),last=observed.journal.replacements?.at(-1);
        const epoch=last?(last.revocationRequested?last.revocationConfirmed?last.revocationEpoch:undefined:last.intentEpoch):(preparation.revocationRequested?preparation.revocationConfirmed?preparation.revocationEpoch:undefined:preparation.intentEpoch);
        if(!child||child.status!=='rejected'||epoch===undefined)throw Error('replacement_unavailable');
        const next={position,previousId:child.requestId,requestId:crypto.randomUUID(),intentId:crypto.randomUUID(),expectedEpoch:epoch};
        let journal=await store.prepareReplacement(scope,observed.journal.revision,next);claim=next;ensure();
        const confirmed=await command.create(preparation,next,key,abort.signal);ensure();journal=await store.updateReplacement(scope,journal.revision,{kind:'intent_confirmed',epoch:confirmed});ensure();
        await store.updateReplacement(scope,journal.revision,{kind:'submitted'});ensure();
        onNotice('Aguardando confirmação da reposição.');
        let settled=false,checkedAfterSettlement=false;void command.dispatch(preparation,next,planned.binding,key,abort.signal).catch(()=>{}).finally(()=>{settled=true;});
        while(valid()){
          const value=await client.inspectBatch(preparation,Date.now,false);ensure();await onSnapshot(value.snapshot,value.journal);ensure();
          const result=value.journal.progress.children.find(item=>item.position===position);
          if(result?.requestId===next.requestId&&['completed','rejected','unknown'].includes(result.status)){
            if(result.status==='unknown')await stop();
            onNotice(result.status==='completed'?'Reposição confirmada.':result.status==='rejected'?'A reposição foi recusada.':'O resultado da reposição permanece desconhecido.');return;
          }
          if(settled){if(checkedAfterSettlement){onNotice('A reposição ainda não foi confirmada. Consulte a tentativa antes de continuar.');return;}checkedAfterSettlement=true;continue;}
          await sleep(2000);ensure();
        }
      });
    }catch{if(active){await stop();onNotice('Não foi possível confirmar a reposição. Ela permanece preservada.');}}
    finally{if(stopPromise)await stopPromise;store.close();}
  }
  return {run,stop};
}
