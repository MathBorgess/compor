"use client";

import {useEffect,useRef,useState} from 'react';
import {readExplorationGate} from '../lib/exploration-feedback.ts';
import {audienceResolution} from '../lib/studio-context.ts';
import {pendingSelectionQuestion} from '../lib/studio-state.ts';
import {postContext} from '../lib/studio-post-context.ts';
import {parallelExplorationContext} from '../lib/parallel-exploration-context.ts';
import {createParallelJournalStore,type ParallelPreparation} from '../lib/parallel-exploration-journal.ts';
import {createParallelIntentClient} from '../lib/parallel-exploration-intent-client.ts';
import {createParallelDispatcher} from '../lib/parallel-exploration-dispatch.ts';
import {resumeParallelReview} from '../lib/parallel-exploration-resume-client.ts';
import {createParallelExplorationClient,type BatchSnapshot} from '../lib/parallel-exploration-client.ts';
import {PARALLEL_WAIT_MS,parallelWaitElapsed,type ParallelGates,type ParallelProgress} from '../lib/parallel-exploration-progress.ts';
import type {StudioState} from '../lib/studio-domain.ts';
import type {StoredReference} from '../lib/studio-storage.ts';
import {prepareSelectedVisualCandidates} from '../lib/selected-visual-input.ts';
import {readReferenceAuthorityConsent} from '../lib/reference-authority-consent.ts';
import {referenceConsentGranted} from '../lib/reference-session-consent.ts';
import type {VisualAuthorityScope} from '../lib/reference-visual-authority.ts';
import {parseVisualInputManifest,type VisualInputManifest} from '@compor/agents-api/visual-input-contract';

type Props={userId:string;projectId:string;conversationId:string;state:StudioState|null;getState:()=>StudioState|null;source:'byok'|'default';credentialEpoch:number;hasApiKey:boolean;getApiKey:()=>string;isAuthenticated:()=>boolean;available:boolean;selectedVisualsAvailable?:boolean;selectedVisualsRequired?:boolean;checkReferenceAuthority?:()=>Promise<boolean>;createVisualAuthoritySnapshot?:(scope:VisualAuthorityScope,manifest:VisualInputManifest)=>Promise<void>;visualAuthorityHeaders?:(scope:VisualAuthorityScope,manifest:VisualInputManifest)=>Promise<Record<string,string>>;loadReference?:(id:string)=>Promise<StoredReference|null|undefined>;visible:boolean;idea:string;onCompleted:(imageId:string,ordinal:number,conversationId:string,creationContext?:StudioState['drafts'][number]['creationContext'])=>Promise<void>};
const wait=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
const fingerprint=(state:StudioState,idea:string)=>JSON.stringify({idea,brief:state.brief,persona:state.persona,direction:state.direction,offerFacts:state.offerFacts,references:state.references});

/** Disabled unless the server explicitly supplies availability. A user gesture starts each session. */
export function useParallelExploration(props:Props){
  const [status,setStatus]=useState('Aguardando seu pedido.'),[progress,setProgress]=useState<ParallelProgress|null>(null),[completed,setCompleted]=useState(0),[phase,setPhase]=useState<'idle'|'generating'|'waiting'|'blocked'>('idle'),[countdown,setCountdown]=useState<number|null>(null),[paused,setPaused]=useState(false),[awaitingFeedback,setAwaitingFeedback]=useState(false),[legacyPending,setLegacyPending]=useState(false),[pageVisible,setPageVisible]=useState(true);
  const [epochStatus,setEpochStatus]=useState<'checking'|'ready'|'unavailable'>('checking');
  const [epochCheck,setEpochCheck]=useState(0);
  const current=useRef(props),epoch=useRef<number|null>(null),run=useRef<{stop:()=>void;valid:()=>boolean}|null>(null),pendingStart=useRef(false);current.current=props;
  const audienceConflict=props.state?audienceResolution(props.state).status==='conflict':false;
  const ready=!audienceConflict&&Boolean(props.idea.trim()||props.state?.brief.offer.trim()||props.state?.brief.direction.trim());
  useEffect(()=>{
    let live=true;epoch.current=null;setEpochStatus('checking');
    if(!props.available||!props.visible||!pageVisible||!props.isAuthenticated())return;
    void createParallelIntentClient().readEpoch(props.projectId).then(value=>{
      if(live){epoch.current=value;setEpochStatus('ready');}
    }).catch(()=>{if(live)setEpochStatus('unavailable');});
    return()=>{live=false;};
  },[props.available,props.visible,pageVisible,props.userId,props.projectId,epochCheck]);
  useEffect(()=>{if(run.current&&!run.current.valid()){run.current.stop();setPaused(true);setPhase('idle');setCountdown(null);setStatus('Exploração pausada.');}});
  useEffect(()=>{const onHide=()=>run.current?.stop();window.addEventListener('pagehide',onHide);return()=>{window.removeEventListener('pagehide',onHide);run.current?.stop();};},[]);
  useEffect(()=>{const update=()=>{const visible=document.visibilityState==='visible'&&document.hasFocus();setPageVisible(visible);if(!visible&&run.current){run.current.stop();setPaused(true);setPhase('idle');setCountdown(null);setStatus('Exploração pausada.');}};document.addEventListener('visibilitychange',update);window.addEventListener('blur',update);window.addEventListener('focus',update);update();return()=>{document.removeEventListener('visibilitychange',update);window.removeEventListener('blur',update);window.removeEventListener('focus',update);};},[]);

  function pause(){pendingStart.current=false;run.current?.stop();setPaused(true);setPhase('idle');setCountdown(null);setStatus('Exploração pausada.');}
  async function start(){
    if(props.selectedVisualsRequired&&!props.selectedVisualsAvailable){setStatus('O envio das imagens selecionadas está indisponível.');return;}
    if(pendingStart.current||run.current||!props.available||!props.visible||!pageVisible||!props.hasApiKey||!props.isAuthenticated()||!ready)return;
    const capturedEpoch=epoch.current;
    if(capturedEpoch===null){setStatus('Não foi possível verificar a intenção. Atualize a tela antes de pedir propostas.');return;}
    pendingStart.current=true;
    setPaused(false);
    setLegacyPending(false);
    setPhase('generating');
    setStatus('Verificando as condições para gerar propostas…');
    const identity={userId:props.userId,projectId:props.projectId,conversationId:props.conversationId,source:props.source,credentialEpoch:props.credentialEpoch,key:props.getApiKey(),visual:props.selectedVisualsAvailable===true};
    const initial=props.getState(),initialQuestion=initial?pendingSelectionQuestion(initial,identity.conversationId):null;
    let active=true,dispatcher:ReturnType<typeof createParallelDispatcher>|null=null,last:{preparation:ParallelPreparation;snapshot:BatchSnapshot;progress:ParallelProgress}|null=null,snapshotFingerprint:string|null=null;
    const store=createParallelJournalStore();
    const runtime:{stopping:Promise<unknown>|null;freezing:Promise<unknown>|null}={stopping:null,freezing:null};
    const valid=()=>{
      const p=current.current,s=p.getState();
      if(!s)return false;
      return active&&document.visibilityState==='visible'&&document.hasFocus()&&p.available&&p.visible&&!(p.selectedVisualsRequired&&!p.selectedVisualsAvailable)&&(p.selectedVisualsAvailable===true)===identity.visual&&p.userId===identity.userId&&p.projectId===identity.projectId&&p.conversationId===identity.conversationId&&p.source===identity.source&&p.credentialEpoch===identity.credentialEpoch&&p.hasApiKey&&p.getApiKey()===identity.key&&p.isAuthenticated()&&!s.adjustments.some(item=>!['completed','failed'].includes(item.status))&&audienceResolution(s).status!=='conflict'&&(pendingSelectionQuestion(s,identity.conversationId)===initialQuestion||pendingSelectionQuestion(s,identity.conversationId)===null)&&(snapshotFingerprint===null||fingerprint(s,p.idea)===snapshotFingerprint);
    };
    const stop=()=>{if(!active)return;active=false;const stoppedAt=Date.now();if(dispatcher)runtime.stopping=dispatcher.stop();if(last){const scope={userId:last.preparation.userId,projectId:last.preparation.projectId,batchId:last.preparation.batchId};runtime.freezing=(async()=>{const journal=await store.load(scope);if(journal)await store.update(scope,journal.revision,{kind:'pause',now:stoppedAt});})();}};run.current={stop,valid};
    async function requireGate(allowResume:boolean){
      const status=await readExplorationGate(identity.projectId);if(!valid())throw Error('paused');
      if(status==='active')return 'active' as const;
      if(!allowResume){setAwaitingFeedback(true);setStatus('Aguardando sua decisão sobre as propostas.');return 'blocked' as const;}
      return 'resume' as const;
    }
    async function watchCompleted(preparation:ParallelPreparation){
      const scope={userId:preparation.userId,projectId:preparation.projectId,batchId:preparation.batchId};
      let journal=await store.loadForRecovery(scope);if(!journal)throw Error('journal_missing');
      const client=createParallelExplorationClient({store,canInspect:valid});
      const observed=await client.inspectBatch(preparation,Date.now,false);
      journal=observed.journal;if(observed.snapshot.state!=='completed'||!journal.progress.children.every(item=>item.status==='completed'))throw Error('batch_unconfirmed');
      last={preparation,snapshot:observed.snapshot,progress:journal.progress};setProgress(journal.progress);setCompleted(value=>value+1);
      for(const image of [...observed.snapshot.images].sort((a,b)=>a.ordinal-b.ordinal)){if(!valid())throw Error('paused');await current.current.onCompleted(image.requestId,image.ordinal,preparation.conversationId,preparation.creationContext);if(!valid())throw Error('paused');}
    }
    async function finishWait(preparation:ParallelPreparation){
      const scope={userId:preparation.userId,projectId:preparation.projectId,batchId:preparation.batchId};
      let journal=await store.load(scope);if(!journal)throw Error('journal_missing');
      const gates:ParallelGates={visible:true,sessionActive:true,originalCredential:true,generationAllowed:true,questionResolved:true,feedbackAllowed:true,noOtherPending:true};
      journal=await store.update(scope,journal.revision,{kind:'resume',now:Date.now(),gates});
      while(valid()&&!parallelWaitElapsed(journal.progress,Date.now(),gates)){
        const next=journal.progress.wait.mode==='running'?journal.progress.wait.nextAt:Date.now()+PARALLEL_WAIT_MS;
        const seconds=Math.max(0,Math.ceil((next-Date.now())/1000));setPhase('waiting');setCountdown(seconds);setStatus(`Próximo lote em ${seconds}s.`);await wait(Math.min(1000,Math.max(1,next-Date.now())));
      }
      if(!valid()){
        if(runtime.freezing)await runtime.freezing.catch(()=>{});else{const saved=await store.load(scope);if(saved)await store.update(scope,saved.revision,{kind:'pause',now:Date.now()});}throw Error('paused');
      }
      const latest=await store.loadPreparation(identity.userId);if(!latest||latest.batchId!==preparation.batchId)throw Error('journal_missing');
      const nextEpoch=await store.retireCompleted(scope,latest.revision,Date.now(),gates);
      if(valid()){
        epoch.current=nextEpoch;
        setCountdown(null);
        setPhase('idle');
      }
      return nextEpoch;
    }
    try{
      if(!navigator.locks)throw Error('locks_unavailable');
      await navigator.locks.request(`compor-exploration:${identity.userId}`,{ifAvailable:true},async lock=>{
        if(!lock||!valid())throw Error('busy');
        if(localStorage.getItem(`compor-exploration-pending:${identity.userId}`)!==null){setPhase('blocked');setLegacyPending(true);setStatus('Há uma exploração anterior a consultar no fluxo original.');return;}
        let nextEpoch=capturedEpoch,allowResume=true;
        for(;;){
          if(!valid())return;
          if(current.current.checkReferenceAuthority&&!await current.current.checkReferenceAuthority()){setStatus('Consulte a seleção de referências antes de gerar.');setPhase('blocked');return;}if(!valid())return;
          const gateState=await requireGate(allowResume);if(gateState==='blocked')return;
          const existing=await store.loadPreparation(identity.userId);
          if(existing){
            if(existing.projectId!==identity.projectId||existing.conversationId!==identity.conversationId){setStatus('Abra o projeto e a conversa da tentativa anterior para consultá-la.');setPhase('blocked');return;}
            if(existing.stage==='executing'){
              await watchCompleted(existing);if(!valid())return;
              nextEpoch=await finishWait(existing);if(!valid())return;continue;
            }
            if(existing.stage!=='planned'){setStatus('Consulte a tentativa anterior antes de pedir novas propostas.');setPhase('blocked');return;}
          }
          const state=current.current.getState();if(!state||!valid())return;
          snapshotFingerprint=fingerprint(state,current.current.idea);
          if(identity.visual&&!current.current.createVisualAuthoritySnapshot&&state.references.some(reference=>reference.source&&('originUrl' in reference.source||reference.source.kind==='generated'))){setStatus('Referências externas ou geradas ainda não estão disponíveis neste fluxo. Remova-as para continuar com seus uploads.');setPhase('blocked');return;}
          const context=await parallelExplorationContext(state,identity.projectId,identity.conversationId,current.current.idea);if(!valid())return;
          if(existing&&JSON.stringify(existing.context)!==JSON.stringify(context)){setStatus('O contexto mudou desde o planejamento. Consulte a tentativa anterior antes de continuar.');setPhase('blocked');return;}
          if(existing&&identity.visual&&existing.visualInput===undefined){setStatus('O plano anterior não contém as imagens selecionadas. Consulte a tentativa antes de continuar.');setPhase('blocked');return;}
          if(identity.visual&&!current.current.loadReference)throw Error('visual_storage_unavailable');
          let externalConsent=false;try{externalConsent=Boolean(readReferenceAuthorityConsent(identity.userId))&&referenceConsentGranted(sessionStorage,identity.userId);}catch{}
          if(identity.visual&&!existing)setStatus('Preparando as referências selecionadas…');
          const visualSnapshot=identity.visual&&!existing?await prepareSelectedVisualCandidates({references:state.references,projectId:identity.projectId,externalConsent,loadReference:current.current.loadReference??(async()=>null)}):undefined;if(!valid())return;
          const preparation=existing??{version:1,userId:identity.userId,projectId:identity.projectId,batchId:crypto.randomUUID(),conversationId:identity.conversationId,planRequestId:crypto.randomUUID(),credentialSource:identity.source,intentId:crypto.randomUUID(),expectedEpoch:nextEpoch,planSubmitted:false,revocationRequested:false,imageIds:[crypto.randomUUID(),crypto.randomUUID(),crypto.randomUUID()],context,...(visualSnapshot?{visualInput:visualSnapshot.manifest}:{}),creationContext:{postContext:identity.conversationId==='references'?{objective:'',message:'',action:''}:postContext(state,identity.conversationId),references:visualSnapshot?state.references.filter(reference=>visualSnapshot.manifest.entries.some(entry=>entry.id===reference.id.toLowerCase())):[]},plan:null,stage:'planning',revision:0};
          if(existing&&existing.credentialSource!==identity.source){setStatus('O plano anterior depende da fonte e chave originais.');setPhase('blocked');return;}
          setProgress(null);
          const seen=new Set<string>();
          dispatcher=createParallelDispatcher({store,allowed:valid,canInspect:valid,visible:()=>false,...(current.current.createVisualAuthoritySnapshot?{createVisualAuthoritySnapshot:current.current.createVisualAuthoritySnapshot}:{}),...(current.current.visualAuthorityHeaders?{visualAuthorityHeaders:current.current.visualAuthorityHeaders}:{}),beforePlan:async(value,signal)=>{if(gateState==='resume'){if(!valid())throw Error('paused');const manifest=value.visualInput===undefined?undefined:parseVisualInputManifest(value.visualInput),scope:VisualAuthorityScope={userId:value.userId,projectId:value.projectId,conversationId:value.conversationId,requestId:value.planRequestId,batchId:value.batchId,purpose:'parallel'};const authority=manifest&&current.current.visualAuthorityHeaders?{requestId:value.planRequestId,headers:await current.current.visualAuthorityHeaders(scope,manifest)}:undefined;if(!valid())throw Error('paused');await resumeParallelReview(value,identity.key,signal,fetch,authority);if(!valid())throw Error('paused');setAwaitingFeedback(false);}allowResume=false;},onPlanning:value=>{if(active){setPhase('generating');setStatus(value==='planning'?'Planejando três caminhos…':'Aguardando confirmação das propostas…');}},onUnavailable:()=>{if(active)setStatus('Sem confirmação recente. As tentativas continuam preservadas.');},onSnapshot:async({snapshot,journal})=>{
            if(!valid())return;setProgress(journal.progress);last={preparation:await store.loadPreparation(identity.userId)??preparation,snapshot,progress:journal.progress};
            for(const image of [...snapshot.images].filter(item=>item.status==='completed').sort((a,b)=>a.ordinal-b.ordinal))if(!seen.has(image.requestId)&&valid()){await current.current.onCompleted(image.requestId,image.ordinal,identity.conversationId,last.preparation.creationContext);seen.add(image.requestId);setCompleted(value=>value+1);}
          },sleep:wait,now:Date.now});
          if(existing)await dispatcher.resumePlanned(existing,crypto.randomUUID(),identity.key);else await dispatcher.start(preparation,identity.key,visualSnapshot);
          if(last&&last.snapshot.images.some(image=>image.status==='unknown'))await dispatcher.stop();
          dispatcher=null;snapshotFingerprint=null;
          if(!valid())return;
          if(!last||last.snapshot.state!=='completed'||!last.progress.children.every(item=>item.status==='completed')){setStatus('Algumas propostas precisam de consulta. Nenhuma será repetida automaticamente.');setPhase('blocked');return;}
          nextEpoch=await finishWait(last.preparation);last=null;
        }
      });
    }catch{if(active){stop();if(run.current?.stop===stop)run.current=null;setStatus('Não foi possível confirmar esta tentativa. Ela permanece preservada.');setPhase('blocked');}}
    finally{active=false;if(runtime.stopping)await runtime.stopping.catch(()=>{});if(runtime.freezing)await runtime.freezing.catch(()=>{});store.close();if(run.current?.stop===stop)run.current=null;pendingStart.current=false;}
  }
  return {start,pause,status,progress,completed,phase,countdown,paused,awaitingFeedback,legacyPending,epochReady:epochStatus==='ready',epochStatus,recheckEpoch:()=>setEpochCheck(value=>value+1),ready,audienceConflict,clearLegacyPending:()=>setLegacyPending(false)};
}
