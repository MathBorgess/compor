"use client";

import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { createExplorationPrompt } from "@compor/agile-deliberation/exploration";
import { criterionChoice } from "../lib/studio-direction";
import { pendingSelectionQuestion } from "../lib/studio-state";
import type { StudioState } from "../lib/studio-domain";
import { generatedSignalsSchema,currentGeneratedFeedback } from "../lib/generated-feedback-contract";
import { markBeforeDispatch } from "../lib/exploration-pending";
import { pendingSchema,readBatchProgress,recordBatchCompletion,nextBatch,freezeBatchWait,resumeBatchWait,reviewBatchProgress,resumeAfterFeedback,selectedExplorationKey,type BatchProgress } from "../lib/exploration-batch";
import { referenceSignalsResponseSchema,currentReferenceFeedback } from "../lib/reference-exploration-contract";

const responseSchema = z.object({ status: z.enum(["completed", "running", "unknown", "busy", "blocked", "awaiting_feedback", "rejected", "not_started"]), requestId: z.string().uuid(), retryAutomatically: z.boolean().optional() });
const resumeSchema=z.object({status:z.enum(['resumed','not_paused','blocked'])});
const gateSchema=z.object({status:z.enum(['active','awaiting_feedback'])});
const listSchema = z.object({ images: z.array(z.object({ id: z.string().uuid(), project_id: z.string().uuid(), state: z.enum(["running", "unknown", "completed", "rejected"]) })).max(100) });

type LoopProps = { userId: string; projectId: string; state: StudioState | null; getState: () => StudioState | null; hasApiKey: boolean; getApiKey: () => string; isAuthenticated: () => boolean; enabled: boolean };

function waitForTurn(signal: AbortSignal,delay=3000) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException("Interrompido", "AbortError")); return; }
    const timer = setTimeout(() => { signal.removeEventListener("abort", onAbort); resolve(); }, delay);
    const onAbort = () => { clearTimeout(timer); reject(new DOMException("Interrompido", "AbortError")); };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

export function useExplorationLoop(props: LoopProps) {
  const [paused, setPaused] = useState(false);
  const [status, setStatus] = useState("Aguardando contexto e conexão.");
  const [blocked, setBlocked] = useState(false);
  const [awaitingFeedback, setAwaitingFeedback] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [resumeError, setResumeError] = useState<string|null>(null);
  const [completed, setCompleted] = useState(0);
  const [phase, setPhase] = useState<'idle'|'generating'|'waiting'|'blocked'>('idle');
  const [countdown, setCountdown] = useState<number|null>(null);
  const current = useRef(props);
  const stopCurrent = useRef<(() => void) | null>(null);
  const resumeRequested = useRef(false);
  const resumeInFlight = useRef(false);
  const [resumedQuestion, setResumedQuestion] = useState<string|null>(null);
  const question = props.state ? pendingSelectionQuestion(props.state) : null;
  const awaitingAnswer = question !== null && question !== resumedQuestion;
  const waitsForAnswer = useRef(awaitingAnswer);
  current.current = props;
  waitsForAnswer.current = awaitingAnswer;
  const ready = Boolean(props.state?.brief.offer.trim() || props.state?.brief.direction.trim());

  useEffect(() => {
    const key=`compor-exploration-batch:${props.userId}:${props.projectId}`;
    try {
      setAwaitingFeedback(localStorage.getItem(key)!==null && readBatchProgress(localStorage,key,`compor-exploration-sequence:${props.userId}:${props.projectId}`,()=>crypto.randomUUID()).awaitingFeedback);
    } catch { setAwaitingFeedback(false); }
  },[props.userId,props.projectId]);

  useEffect(() => {
    if (!props.enabled || !props.hasApiKey || !ready || paused || blocked || awaitingFeedback || awaitingAnswer) return;
    const cancel = new AbortController();
    let active = true;
    let dispatched = false;
    const pendingKey = `compor-exploration-pending:${props.userId}`;
    const rejectedKey = `compor-exploration-rejected:${props.userId}`;
    const notStartedKey = `compor-exploration-not-started:${props.userId}`;
    const sequenceKey = (projectId: string) => `compor-exploration-sequence:${props.userId}:${projectId}`;
    const batchKey = (projectId: string) => `compor-exploration-batch:${props.userId}:${projectId}`;
    let progress:BatchProgress|null=null;
    const cancelCurrent = () => {
      if(progress?.nextAt!==null && progress?.nextAt!==undefined) {
        try { progress=freezeBatchWait(progress,Date.now());localStorage.setItem(batchKey(props.projectId),JSON.stringify(progress)); } catch { /* Preserve stop even when storage fails. */ }
      }
      active = false;
      // Leaving exploration or waiting for the person's answer lets an already dispatched request settle and reconcile its receipt.
      if (!dispatched || (current.current.enabled && !waitsForAnswer.current)) cancel.abort();
    };
    stopCurrent.current = cancelCurrent;
    const stop = (message: string) => { if (active) { setStatus(message); setBlocked(true); setPhase('blocked'); setCountdown(null); } };
    async function run() {
      if (!navigator.locks) { stop("Exploração pausada: este navegador não oferece coordenação entre abas."); return; }
      try {
        await navigator.locks.request(`compor-exploration:${props.userId}`, { signal: cancel.signal }, async () => {
          if (!active) return;
          if (localStorage.getItem(rejectedKey) !== null) { stop("A chave foi recusada. Corrija a conexão e retome a exploração."); return; }
          if (localStorage.getItem(notStartedKey) !== null) { stop("Não foi possível iniciar a exploração. Verifique a conexão e retome quando estiver pronto."); return; }
          progress=readBatchProgress(localStorage,batchKey(props.projectId),sequenceKey(props.projectId),()=>crypto.randomUUID());
          const prior = localStorage.getItem(pendingKey);
          if (prior !== null) {
            const pending = pendingSchema.parse(JSON.parse(prior));
            const response = await fetch(`/api/studio/explorations?${new URLSearchParams({ projectId: pending.projectId })}`, { cache: "no-store", signal: cancel.signal });
            if (!response.ok) throw Error("unconfirmed");
            const rows = listSchema.parse(await response.json()).images;
            const match = rows.find(row => row.id === pending.requestId && row.project_id === pending.projectId);
            if (match?.state === "rejected") {
              // Persist the pause before removing the receipt: reload or another
              // tab must not restart the loop after a confirmed rejection.
              if (localStorage.getItem(pendingKey) !== prior) { stop("O resultado da exploração não foi confirmado. A sequência foi interrompida."); return; }
              localStorage.setItem(rejectedKey, "1");
              localStorage.removeItem(pendingKey);
              stop("A chave foi recusada. Corrija a conexão e retome a exploração.");
              return;
            }
            if (!match || match.state !== "completed") { stop("Uma exploração anterior ainda não foi confirmada. Consulte seu estado antes de continuar."); return; }
            const priorProgress=pending.projectId===props.projectId ? progress : readBatchProgress(localStorage,batchKey(pending.projectId),sequenceKey(pending.projectId),()=>crypto.randomUUID());
            const reconciled=recordBatchCompletion(priorProgress,pending,Date.now());
            localStorage.setItem(batchKey(pending.projectId),JSON.stringify(reconciled));
            localStorage.setItem(sequenceKey(pending.projectId),String(reconciled.sequence));
            if(pending.projectId===props.projectId)progress=reconciled;
            localStorage.removeItem(pendingKey);
          }
          if(progress.awaitingFeedback) {
            if(!resumeRequested.current) { if(active)setAwaitingFeedback(true); return; }
            progress=resumeAfterFeedback(progress);
            localStorage.setItem(batchKey(props.projectId),JSON.stringify(progress));
          }
          resumeRequested.current=false;
          if(progress.remainingMs!==null) {
            progress=resumeBatchWait(progress,Date.now());
            localStorage.setItem(batchKey(props.projectId),JSON.stringify(progress));
          }
          while (active && !cancel.signal.aborted) {
            const { getState, getApiKey, isAuthenticated } = current.current;
            const state = getState();
            const apiKey = getApiKey();
            if (!isAuthenticated() || !/^sk-[^\s]{20,300}$/.test(apiKey) || !state) return;
            const gateResponse=await fetch('/api/studio/explorations/status',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({projectId:props.projectId}),signal:cancel.signal});
            if(!gateResponse.ok)throw Error('gate_unavailable');
            const gate=gateSchema.parse(await gateResponse.json());
            if(!active || cancel.signal.aborted)return;
            if(gate.status==='awaiting_feedback') {
              progress={...progress,awaitingFeedback:true};
              localStorage.setItem(batchKey(props.projectId),JSON.stringify(progress));
              setAwaitingFeedback(true);setPhase('idle');setCountdown(null);return;
            }
            const feedbackRequest={method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({projectId:props.projectId,scope:'account'}),signal:cancel.signal};
            const [feedbackResponse,referenceResponse]=await Promise.all([fetch('/api/studio/explorations/signals',feedbackRequest),fetch('/api/studio/references/signals',feedbackRequest)]);
            if(!feedbackResponse.ok||!referenceResponse.ok)throw Error('feedback unavailable');
            const generatedSignals=generatedSignalsSchema.parse(await feedbackResponse.json()).signals;
            const referenceSignals=referenceSignalsResponseSchema.parse(await referenceResponse.json()).signals;
            const latestState=current.current.getState();
            if(!active || cancel.signal.aborted || !latestState)return;
            const engaged=new Set(generatedSignals.filter(item=>item.projectId===props.projectId&&(item.action==='selected'||Boolean(item.comment.trim()))).map(item=>item.imageId));
            for(const reference of latestState.references)if(reference.source && 'kind' in reference.source && reference.source.kind==='generated' && reference.source.projectId===props.projectId)engaged.add(reference.source.imageId);
            for(const batch of progress.reviewBatches)for(const id of batch.imageIds)if(localStorage.getItem(selectedExplorationKey(props.userId,props.projectId,id))==='1')engaged.add(id);
            progress=reviewBatchProgress(progress,engaged);
            localStorage.setItem(batchKey(props.projectId),JSON.stringify(progress));
            if(progress.awaitingFeedback) { setAwaitingFeedback(true);setPhase('idle');setCountdown(null);return; }
            if(progress.nextAt!==null) {
              while(active && !cancel.signal.aborted && progress.nextAt>Date.now()) {
                const seconds=Math.ceil((progress.nextAt-Date.now())/1000);
                setPhase('waiting');setCountdown(seconds);setStatus(`Próximo lote em ${seconds}s.`);
                await waitForTurn(cancel.signal,Math.min(1000,progress.nextAt-Date.now()));
              }
              if(!active||cancel.signal.aborted)return;
              progress=nextBatch(progress,Date.now(),()=>crypto.randomUUID());
              localStorage.setItem(batchKey(props.projectId),JSON.stringify(progress));
              continue;
            }
            const sequence=progress.sequence;
            const accepted = state.direction.criteria.filter(item => criterionChoice(state.direction, item.id) === "accept").slice(0,4).map(item => item.statement.slice(0,160));
            const rejected = state.direction.criteria.filter(item => criterionChoice(state.direction, item.id) === "reject").slice(0,4).map(item => item.statement.slice(0,160));
            const feedback=[...currentGeneratedFeedback(generatedSignals),...currentReferenceFeedback(referenceSignals)];
            const { prompt,composition,contrast } = createExplorationPrompt({ offer: state.brief.offer, audience: state.persona.audience, briefAudience: state.brief.audience, goal: state.brief.action, direction: state.brief.direction, accepted, rejected, feedback, sequence });
            const requestId = crypto.randomUUID();
            const batch={id:progress.batchId,position:progress.completed+1};
            const pending={projectId:props.projectId,requestId,sequence,batchId:batch.id,position:batch.position};
            const marker=JSON.stringify(pending);
            if (!markBeforeDispatch(localStorage,pendingKey,marker,()=>active && !cancel.signal.aborted && current.current.enabled && current.current.isAuthenticated() && current.current.getApiKey() === apiKey)) return;
            setPhase('generating');setCountdown(null);setStatus(`Explorando caminho visual ${sequence + 1}…`);
            dispatched = true;
            const response = await fetch("/api/studio/explorations", { method: "POST", headers: { "content-type": "application/json", "x-compor-openai-key": apiKey, "x-compor-exploration-request-id": requestId }, body: JSON.stringify({ projectId: props.projectId, requestId, prompt,plan:{composition,contrast},batch }), signal: cancel.signal });
            const result = responseSchema.parse(await response.json());
            dispatched = false;
            if ([400,403,404,413,503].includes(response.status) && result.status === "not_started" && result.requestId === requestId && result.retryAutomatically === false) {
              if (localStorage.getItem(pendingKey) !== marker) { stop("O resultado da exploração não foi confirmado. A sequência foi interrompida."); return; }
              localStorage.setItem(notStartedKey, "1");
              localStorage.removeItem(pendingKey);
              stop("Não foi possível iniciar a exploração. Verifique a conexão e retome quando estiver pronto.");
              return;
            }
            if ((response.status === 401 || response.status === 409) && result.status === "rejected" && result.requestId === requestId && result.retryAutomatically === false) {
              if (localStorage.getItem(pendingKey) !== marker) { stop("O resultado da exploração não foi confirmado. A sequência foi interrompida."); return; }
              localStorage.setItem(rejectedKey, "1");
              localStorage.removeItem(pendingKey);
              stop("A chave foi recusada. Corrija a conexão e retome a exploração.");
              return;
            }
            if (response.status === 409 && result.status === "busy" && result.requestId === requestId) {
              localStorage.removeItem(pendingKey);
              if (active) setStatus("Outra geração está em andamento. A exploração aguardará sua conclusão.");
              await waitForTurn(cancel.signal);
              continue;
            }
            if (response.status === 409 && result.status === "blocked" && result.requestId === requestId) {
              localStorage.removeItem(pendingKey);
              stop("Há uma geração anterior com resultado desconhecido. Consulte essa tentativa antes de continuar.");
              return;
            }
            if (response.status === 409 && result.status === "awaiting_feedback" && result.requestId === requestId) {
              localStorage.removeItem(pendingKey);
              progress={...progress,awaitingFeedback:true};
              localStorage.setItem(batchKey(props.projectId),JSON.stringify(progress));
              if(active){setAwaitingFeedback(true);setPhase('idle');setCountdown(null);}
              return;
            }
            if (!response.ok || result.status !== "completed" || result.requestId !== requestId) { stop("O resultado da exploração não foi confirmado. A sequência foi interrompida."); return; }
            const completedAt=Date.now();
            progress=recordBatchCompletion(progress,pending,completedAt);
            // A third image can finish after leaving the references screen.
            // Its newly created wait must start counting only when the loop
            // becomes active again, just like an already-running wait.
            if(!active || !current.current.enabled)progress=freezeBatchWait(progress,completedAt);
            localStorage.setItem(batchKey(props.projectId),JSON.stringify(progress));
            localStorage.setItem(sequenceKey(props.projectId), String(progress.sequence));
            localStorage.removeItem(pendingKey);
            setCompleted(value => value + 1);
          }
        });
      } catch {
        if (active && !cancel.signal.aborted) stop("Não foi possível confirmar a exploração. A sequência foi interrompida.");
      }
    }
    const onPageHide = cancelCurrent;
    window.addEventListener("pagehide", onPageHide);
    void run();
    return () => { cancelCurrent(); if (stopCurrent.current === cancelCurrent) stopCurrent.current = null; window.removeEventListener("pagehide", onPageHide); };
  }, [props.userId, props.projectId, props.hasApiKey, props.enabled, ready, paused, blocked, awaitingFeedback, awaitingAnswer]);

  async function resume() {
    if(resumeInFlight.current)return;
    try { localStorage.removeItem(`compor-exploration-rejected:${props.userId}`); localStorage.removeItem(`compor-exploration-not-started:${props.userId}`); }
    catch { setStatus('Não foi possível retomar. Verifique o armazenamento deste navegador.'); return; }
    if(awaitingFeedback) {
      resumeInFlight.current=true;setResuming(true);setResumeError(null);
      try {
        const response=await fetch('/api/studio/explorations/resume',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({projectId:props.projectId})});
        const result=resumeSchema.parse(await response.json());
        if(!response.ok||result.status==='blocked')throw Error('blocked');
        if(current.current.userId!==props.userId||current.current.projectId!==props.projectId||!current.current.isAuthenticated())return;
      } catch {
        setResumeError('Não foi possível retomar. Consulte qualquer geração pendente e tente novamente.');
        return;
      } finally { resumeInFlight.current=false;setResuming(false); }
    }
    resumeRequested.current=true;setResumedQuestion(question);setAwaitingFeedback(false);setBlocked(false);setPaused(false);setPhase('idle');
  }
  const running = props.enabled && !awaitingAnswer;
  return { status: awaitingFeedback ? "Aguardando sua decisão sobre as propostas." : awaitingAnswer && !blocked ? "A exploração aguarda sua resposta no chat." : paused ? "Exploração pausada." : !props.enabled ? "Exploração disponível na tela de referências." : !props.hasApiKey ? "Conecte sua IA para explorar." : !ready ? "Aguardando uma ideia no briefing." : status, paused, blocked, awaitingFeedback, awaitingAnswer, resuming, resumeError, completed, phase: running ? phase : 'idle' as const, countdown: running ? countdown : null, pause: () => { stopCurrent.current?.(); setPaused(true); setPhase('idle'); setCountdown(null); }, resume };
}
