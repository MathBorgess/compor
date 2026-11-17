"use client";

import React, {useEffect,useRef,useState} from 'react';
import {createParallelJournalStore,type ParallelPreparation} from '../lib/parallel-exploration-journal.ts';
import {createParallelExplorationClient} from '../lib/parallel-exploration-client.ts';
import {createParallelIntentClient} from '../lib/parallel-exploration-intent-client.ts';
import {createReplacementRun} from '../lib/parallel-exploration-replacement-run.ts';
import type {ParallelProgress} from '../lib/parallel-exploration-progress.ts';
import type {StudioState} from '../lib/studio-domain.ts';
import {ParallelExplorationProgress} from './parallel-exploration-progress.tsx';

type Props={userId:string;projectId:string;conversationId:string;credentialSource:'byok'|'default';credentialEpoch?:number;replacementAvailable?:boolean;allowReplacement?:boolean;generationFingerprint?:string;getReplacementContext?:()=>Promise<unknown>;getApiKey:()=>string;isAuthenticated:()=>boolean;onContinuePlan?:()=>void;onCompleted:(imageId:string,ordinal:number,conversationId:string,creationContext?:StudioState['drafts'][number]['creationContext'])=>Promise<void>};

/** Read-only recovery. No button starts or repeats a planning or image request. */
export default function ParallelExplorationRecovery(props:Props){
  const [preparation,setPreparation]=useState<ParallelPreparation|null>(null),[progress,setProgress]=useState<ParallelProgress|null>(null),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
  const current=useRef(props),sequence=useRef(0),lock=useRef(false);current.current=props;
  const replacing=useRef<{stop:()=>Promise<void>;valid:()=>boolean}|null>(null);
  useEffect(()=>{if(replacing.current&&!replacing.current.valid())void replacing.current.stop();});
  useEffect(()=>{const stop=()=>{if(replacing.current&&!replacing.current.valid())void replacing.current.stop();};const leave=()=>{void replacing.current?.stop();};document.addEventListener('visibilitychange',stop);window.addEventListener('blur',stop);window.addEventListener('pagehide',leave);return()=>{document.removeEventListener('visibilitychange',stop);window.removeEventListener('blur',stop);window.removeEventListener('pagehide',leave);leave();};},[]);
  useEffect(()=>{
    let alive=true;const store=createParallelJournalStore();
    void (async()=>{try{
      const saved=await store.loadPreparation(props.userId);if(!alive)return;setPreparation(saved);
      if(saved?.stage==='executing'&&saved.projectId===props.projectId){const journal=await store.loadForRecovery({userId:saved.userId,projectId:saved.projectId,batchId:saved.batchId});if(alive)setProgress(journal?.progress??null);}
    }catch{if(alive)setNotice('Não foi possível ler a tentativa anterior. Ela permanece preservada.');}})();
    return ()=>{alive=false;sequence.current++;store.close();};
  },[props.userId,props.projectId]);
  if(!preparation&&!notice)return null;
  const sameProject=preparation?.projectId===props.projectId,sameConversation=preparation?.conversationId===props.conversationId;
  async function replace(position:number){
    if(!preparation||preparation.stage!=='executing'||!sameProject||!sameConversation||lock.current||!props.allowReplacement||!props.getReplacementContext||props.credentialSource!==preparation.credentialSource||!props.isAuthenticated()||document.visibilityState!=='visible'||!document.hasFocus())return;
    const key=props.getApiKey(),source=props.credentialSource,credentialEpoch=props.credentialEpoch,fingerprint=props.generationFingerprint,serial=++sequence.current;
    const valid=()=>sequence.current===serial&&current.current.userId===preparation.userId&&current.current.projectId===preparation.projectId&&current.current.conversationId===preparation.conversationId&&current.current.credentialSource===source&&current.current.credentialEpoch===credentialEpoch&&current.current.generationFingerprint===fingerprint&&current.current.getApiKey()===key&&Boolean(current.current.allowReplacement)&&current.current.isAuthenticated()&&document.visibilityState==='visible'&&document.hasFocus();
    lock.current=true;setBusy(true);setNotice('');
    const run=createReplacementRun({preparation,position,key,allowed:valid,currentContext:props.getReplacementContext,onNotice:value=>{if(valid())setNotice(value);},onSnapshot:async(snapshot,journal)=>{if(!valid())return;setProgress(journal.progress);for(const image of snapshot.images.filter(item=>item.status==='completed').sort((a,b)=>a.ordinal-b.ordinal)){if(!valid())return;await current.current.onCompleted(image.requestId,image.ordinal,preparation.conversationId,preparation.creationContext);}}});
    replacing.current={stop:run.stop,valid};
    try{await run.run();}finally{if(replacing.current?.stop===run.stop)replacing.current=null;if(sequence.current===serial){lock.current=false;setBusy(false);}}
  }
  async function inspect(){
    if(!preparation||!sameProject||!sameConversation||lock.current||!current.current.isAuthenticated())return;
    if(['planning','planned'].includes(preparation.stage)&&current.current.credentialSource!==preparation.credentialSource){setNotice('Escolha a fonte de IA usada no planejamento para consultar a tentativa original.');return;}
    const serial=++sequence.current;lock.current=true;setBusy(true);setNotice('');const store=createParallelJournalStore();
    const inScope=()=>sequence.current===serial&&current.current.userId===preparation.userId&&current.current.projectId===preparation.projectId&&current.current.conversationId===preparation.conversationId&&current.current.isAuthenticated()&&(preparation.stage==='executing'||current.current.credentialSource===preparation.credentialSource);
    const client=createParallelExplorationClient({store,canInspect:inScope});
    try{
      if(preparation.stage==='planning'||preparation.stage==='planned'){
        const result=await client.inspectPlan(preparation,current.current.getApiKey());if(!inScope())return;
        setPreparation(result.preparation);
        setNotice(result.status==='completed'?'Plano recuperado. A execução permanece pausada.':result.status==='failed'?'O planejamento anterior terminou sem um plano.':'O planejamento ainda não foi confirmado. Nenhuma nova tentativa foi enviada.');
      }else if(preparation.stage==='executing'){
        const {snapshot,journal}=await client.inspectBatch(preparation,()=>Date.now(),false);if(!inScope())return;
        setProgress(journal.progress);
        for(const image of [...snapshot.images].filter(item=>item.status==='completed').sort((a,b)=>a.ordinal-b.ordinal)){
          if(!inScope())return;
          await current.current.onCompleted(image.requestId,image.ordinal,preparation.conversationId,preparation.creationContext);
        }
        if(inScope())setNotice(snapshot.state==='completed'?'As imagens foram confirmadas. A continuação permanece pausada.':'A consulta terminou. Os resultados ainda não confirmados permanecem preservados.');
      }else setNotice('A tentativa anterior permanece preservada.');
    }catch{if(inScope())setNotice('Não foi possível confirmar a tentativa. Nada foi repetido.');}
    finally{store.close();if(sequence.current===serial){lock.current=false;setBusy(false);}}
  }
  async function archive(){
    if(!preparation||!sameProject||!sameConversation||lock.current||!current.current.isAuthenticated()||!navigator.locks)return;
    if(!preparation.intentId||!['planning','planned','executing','failed'].includes(preparation.stage))return;
    const serial=++sequence.current;lock.current=true;setBusy(true);setNotice('');const store=createParallelJournalStore();
    const inScope=()=>sequence.current===serial&&current.current.userId===preparation.userId&&current.current.projectId===preparation.projectId&&current.current.conversationId===preparation.conversationId&&current.current.isAuthenticated();
    try{
      await navigator.locks.request(`compor-exploration:${preparation.userId}`,{ifAvailable:true},async lock=>{
        if(!lock||!inScope())throw Error('unavailable');
        let latest=await store.loadPreparation(preparation.userId);
        if(!latest||latest.intentId!==preparation.intentId||latest.batchId!==preparation.batchId||!['planning','planned','executing','failed'].includes(latest.stage))throw Error('unavailable');
        if(latest.stage==='executing'){
          const scope={userId:latest.userId,projectId:latest.projectId,batchId:latest.batchId};let journal=await store.load(scope);let replacement=journal?.replacements?.at(-1);
          if(journal&&replacement&&['prepared','submitted'].includes(replacement.state)){
            const replacementIntent={...latest,intentId:replacement.intentId,expectedEpoch:replacement.expectedEpoch,intentEpoch:replacement.intentEpoch};
            const intents=createParallelIntentClient(),observed=await intents.inspect(replacementIntent);if(!inScope())throw Error('unavailable');
            if(!replacement.revocationRequested)journal=await store.updateReplacement(scope,journal.revision,{kind:'revoke'});
            const revoked=observed.state==='revoked'?{status:'revoked' as const,revocationEpoch:observed.revocationEpoch}:await intents.revoke(replacementIntent);if(revoked.status!=='revoked'||!inScope())throw Error('unavailable');
            replacement=journal.replacements?.at(-1);if(!replacement?.revocationConfirmed)journal=await store.updateReplacement(scope,journal.revision,{kind:'revoke_confirmed',...(revoked.revocationEpoch==null?{}:{epoch:revoked.revocationEpoch})});
            const client=createParallelExplorationClient({store,canInspect:inScope}),result=await client.inspectBatch(latest,Date.now,false);if(!inScope())throw Error('unavailable');
            journal=result.journal;replacement=journal.replacements?.at(-1);
            const image=result.snapshot.images.find(item=>item.position===replacement?.position);
            if(replacement&&['prepared','submitted'].includes(replacement.state)&&image?.requestId===replacement.previousId&&image.status==='rejected'){
              journal=await store.abandonReplacement(scope,journal.revision,{position:image.position,requestId:image.requestId,status:image.status,revision:image.revision});setProgress(journal.progress);setNotice('Reposição encerrada e preservada. Um novo pedido precisa ser explícito.');
            }else{setProgress(journal.progress);setNotice('A reposição possui recibo. Consulte o resultado antes de continuar.');}
            return;
          }
        }
        const intents=createParallelIntentClient(),observed=await intents.inspect(latest);
        if(!inScope())throw Error('unavailable');
        if(!latest.revocationRequested)latest=await store.updatePreparation(latest.userId,latest.revision,{kind:'revoke'});
        const revoked=observed.state==='revoked'?{status:'revoked' as const,revocationEpoch:observed.revocationEpoch}:await intents.revoke(latest);
        if(revoked.status!=='revoked')throw Error('unavailable');
        if(!inScope())throw Error('unavailable');
        if(!latest.revocationConfirmed)latest=await store.updatePreparation(latest.userId,latest.revision,{kind:'revoke_confirmed',...(revoked.revocationEpoch==null?{}:{epoch:revoked.revocationEpoch})});
        const client=createParallelExplorationClient({store,canInspect:inScope});
        let evidence:'plan_absent'|'plan_failed'|'batch_absent';
        if(latest.stage==='planning'||latest.stage==='failed'){
          const status=await client.inspectPlanRecord(latest);
          if(latest.stage==='planning'&&status==='absent')evidence='plan_absent';
          else if(latest.stage==='failed'&&status==='failed')evidence='plan_failed';
          else throw Error('unavailable');
        }else{
          if(!await client.inspectBatchAbsent(latest)){if(inScope()){setPreparation(latest);setNotice('A intenção foi revogada. O lote possui recibos; consulte seus resultados antes de continuar.');}return;}
          evidence='batch_absent';
        }
        if(!inScope())throw Error('unavailable');
        await store.archiveTerminalPreparation({userId:latest.userId,projectId:latest.projectId,batchId:latest.batchId},latest.revision,evidence);
        if(inScope()){setPreparation(null);setProgress(null);setNotice('Tentativa encerrada e preservada no histórico local. Para pedir novas propostas, faça um novo pedido.');}
      });
    }catch{if(inScope())setNotice('Não foi possível confirmar e preservar o encerramento. A tentativa continua bloqueada.');}
    finally{store.close();if(sequence.current===serial){lock.current=false;setBusy(false);}}
  }
  return <React.Fragment><section className="studio-exploration-recovery" aria-label="Tentativa paralela anterior">
    <p role="status">{!sameProject?'Há uma tentativa anterior em outro projeto. Abra o projeto de origem para consultá-la.':!sameConversation?'Há uma tentativa anterior em outra conversa. Abra a conversa de origem para consultá-la.':'Há uma tentativa paralela anterior. Ela não será repetida automaticamente.'}</p>
    {sameProject&&sameConversation&&progress&&<ParallelExplorationProgress progress={progress}/>}
    {props.replacementAvailable&&props.getReplacementContext&&sameProject&&sameConversation&&preparation?.stage==='executing'&&progress?.children.filter(item=>item.status==='rejected').map(item=><button key={item.requestId} type="button" disabled={busy||!props.allowReplacement||props.credentialSource!==preparation.credentialSource||progress.children.some(child=>!['completed','rejected'].includes(child.status))} onClick={()=>{void replace(item.position);}}>Repor proposta {item.position}</button>)}
    {props.replacementAvailable&&sameProject&&sameConversation&&preparation?.stage==='executing'&&progress?.children.some(item=>item.status==='rejected')&&props.credentialSource!==preparation.credentialSource&&<p>Use a fonte e a chave originais para repor uma proposta; o plano não pode ser reutilizado com outra credencial.</p>}
    {sameProject&&sameConversation&&preparation&&['planning','planned','executing'].includes(preparation.stage)&&<button type="button" disabled={busy} onClick={()=>{void inspect();}}>{busy?'Consultando…':'Consultar tentativa anterior'}</button>}
    {sameProject&&sameConversation&&preparation?.stage==='planned'&&props.onContinuePlan&&<><p>Para continuar o mesmo plano, use a fonte e a chave originais; o servidor confirma o vínculo antes da execução.</p><button type="button" disabled={busy||props.credentialSource!==preparation.credentialSource} onClick={props.onContinuePlan}>Continuar mesmo plano</button></>}
    {sameProject&&sameConversation&&preparation?.intentId&&['planning','planned','executing','failed'].includes(preparation.stage)&&<><p>O encerramento revoga a intenção. Se houver efeito ainda não confirmado, a tentativa continua bloqueada.</p><button type="button" disabled={busy} onClick={()=>{void archive();}}>Verificar encerramento da tentativa</button></>}
    {notice&&<p role="status">{notice}</p>}
  </section></React.Fragment>;
}
