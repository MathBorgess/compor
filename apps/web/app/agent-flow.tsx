'use client';
import { useEffect, useState } from 'react';
import AssetRecovery from './asset-recovery';
import {fetchPrivateImage} from '../lib/private-image-fetch.ts';
import { z } from 'zod';
import { uuid, type ConnectionProps } from './studio-ui-types';

type FlowState = {state:'idle'|'starting'|'confirming'|'storage_unavailable'} | {state:'text';text:string} | {state:'consent';prompt:string;attemptId:string;actionBinding:string} | {state:'accepted';assetId:string|null} | {state:'recovering';idempotencyKey:string} | {state:'unknown';assetId?:string|null;idempotencyKey?:string;recoveryStatus?:'in_progress'|'unavailable'};
interface FlowMetadata {history:string[];selectedAsset:string|null;storageWarning?:boolean}
type Flow = FlowState & FlowMetadata;
type FlowUpdate = FlowState & Partial<FlowMetadata>;
interface FlowRecord {value:Flow;listeners:Set<(flow:Flow)=>void>;loaded:boolean}
type AgentFlowProps=ConnectionProps & {projectId:string;pieceId:string;version:number|string;canStart:boolean;objective:string;onUseImage?:(blob:Blob)=>void};
const historySchema=z.array(z.string().refine(uuid));
const savedFlowSchema=z.object({state:z.string(),assetId:z.unknown().optional(),idempotencyKey:z.unknown().optional()});
const agentResponseSchema=z.object({status:z.string().optional(),prompt:z.string().optional(),attemptId:z.string().optional(),actionBinding:z.string().optional(),text:z.string().optional(),assetId:z.string().optional()});
const assetIn=(flow:Flow)=>'assetId' in flow ? flow.assetId : null;

// State belongs to one account, project, piece and saved version. It survives a
// session recheck, but secrets and prompts are never persisted by this module.
const flows = new Map<string, FlowRecord>();
function recordFor(key: string): FlowRecord {
  const existing = flows.get(key);
  if (existing) return existing;
  const record: FlowRecord = { value: { state: 'idle', history: [], selectedAsset: null }, listeners: new Set(), loaded: false };
  flows.set(key, record);
  return record;
}
function update(record: FlowRecord, value: FlowUpdate) { record.value = {...value,history:value.history ?? record.value.history ?? [],selectedAsset:value.selectedAsset === undefined ? record.value.selectedAsset ?? null : value.selectedAsset}; for (const listener of record.listeners) listener(record.value); }

export default function AgentFlow({ userId, projectId, pieceId, version, canStart, objective, hasApiKey, getApiKey, onUseImage }: AgentFlowProps) {
  const key = `compor-agent-attempt:${userId}:${projectId}:${pieceId}:${version}`;
  const historyKey = `${key}:assets`;
  const record = recordFor(key);
  const [flow, setFlow] = useState(record.value);
  const [initialized, setInitialized] = useState(record.loaded);
  const [preview, setPreview] = useState<string | null>(null);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [previewError, setPreviewError] = useState(false);
  const [previewTry, setPreviewTry] = useState(0);
  const selectedAsset = flow.selectedAsset;
  const outcomeAsset = assetIn(flow);
  function readHistory() {
    const raw = sessionStorage.getItem(historyKey);
    if (raw === null) return [];
    const list = historySchema.parse(JSON.parse(raw));
    return [...new Set(list)];
  }
  function preserveAsset(assetId: unknown) {
    if (!uuid(assetId)) return true;
    try {
      const list = readHistory();
      if (!list.includes(assetId)) { list.push(assetId); sessionStorage.setItem(historyKey, JSON.stringify(list)); }
      update(record,{...record.value,history:list}); return true;
    } catch {
      const list = record.value.history.includes(assetId) ? record.value.history : [...record.value.history,assetId];
      update(record,{...record.value,history:list,storageWarning:true}); return false;
    }
  }
  useEffect(() => {
    record.listeners.add(setFlow);
    if (!record.loaded) {
      record.loaded = true;
      try {
        const history = readHistory();
        update(record, {...record.value,history});
        const saved = sessionStorage.getItem(key);
        if (saved !== null && record.value.state === 'idle') {
          let restored: FlowUpdate = {state:'unknown'};
          try {
            const parsed = savedFlowSchema.parse(JSON.parse(saved));
            if (parsed.state === 'accepted' || parsed.state === 'unknown') restored = {state:parsed.state,assetId:uuid(parsed.assetId) ? parsed.assetId : null};
            else if (parsed?.state === 'pending_agent' && uuid(parsed.idempotencyKey)) restored = {state:'unknown',idempotencyKey:parsed.idempotencyKey};
          } catch { /* Older pending markers remain unknown. */ }
          update(record, restored);
        }
      }
      catch { update(record, {state:'storage_unavailable'}); }
    }
    setFlow(record.value);
    setInitialized(true);
    return () => { record.listeners.delete(setFlow); };
  }, [key, record]);
  useEffect(() => {
    setPreview(null); setPreviewBlob(null); setPreviewError(false);
    const assetId = selectedAsset ?? outcomeAsset;
    if (!uuid(assetId)) return;
    const controller = new AbortController(); let url: string | undefined;
    const query = new URLSearchParams({projectId,pieceId,version:String(version),assetId});
    fetchPrivateImage(query, {signal:controller.signal}).then(blob => {
      if (controller.signal.aborted) return;
      url = URL.createObjectURL(blob); setPreview(url); setPreviewBlob(blob);
    }).catch(() => {if (!controller.signal.aborted) setPreviewError(true);});
    return () => {controller.abort(); if (url) URL.revokeObjectURL(url);};
  }, [flow.state, outcomeAsset, selectedAsset, projectId, pieceId, version, previewTry]);
  function reset() {
    if (!preserveAsset(assetIn(record.value))) return;
    try { sessionStorage.removeItem(key); update(record, {state:'idle'}); }
    catch { update(record, {...record.value,storageWarning:true}); }
  }
  function saveOutcome(state: 'accepted'|'unknown', assetId: unknown) {
    const value = {state,assetId:uuid(assetId) ? assetId : null,storageWarning:false};
    try { sessionStorage.setItem(key, JSON.stringify(value)); }
    catch { value.storageWarning = true; }
    update(record,{...value,...(value.assetId ? {selectedAsset:null} : {})});
    if (uuid(value.assetId) && !preserveAsset(value.assetId)) update(record,{...record.value,storageWarning:true});
  }
  async function start() {
    if (!initialized || record.value.state !== 'idle' || !canStart || !hasApiKey || !objective?.trim() || typeof getApiKey !== 'function') return;
    const apiKey = getApiKey(); if (!apiKey) return;
    const idempotencyKey = crypto.randomUUID();
    try { const marker=JSON.stringify({state:'pending_agent',idempotencyKey}); sessionStorage.setItem(key, marker); if(sessionStorage.getItem(key)!==marker) throw Error('storage unavailable'); } catch { update(record,{state:'storage_unavailable'}); return; }
    update(record, {state:'starting',selectedAsset:null});
    try {
      const response = await fetch('/api/agent', {method:'POST',headers:{'content-type':'application/json','x-compor-project-id':projectId,'x-compor-attempt-id':idempotencyKey},body:JSON.stringify({apiKey,objective})});
      const data = agentResponseSchema.parse(await response.json());
      if (response.status === 202 && data?.status === 'consent_required' && typeof data.prompt === 'string' && data.prompt.length <= 4000 && !data.prompt.includes(apiKey) && uuid(data.attemptId) && typeof data.actionBinding === 'string' && data.actionBinding.length > 0 && data.actionBinding.length <= 2048 && !data.actionBinding.includes(apiKey)) {
        update(record, {state:'consent', prompt:data.prompt, attemptId:data.attemptId, actionBinding:data.actionBinding}); return;
      }
      if (response.ok && response.status !== 202 && typeof data?.text === 'string' && !data.text.includes(apiKey)) {
        update(record,{state:'text',text:data.text}); return;
      }
      throw Error();
    } catch { update(record,{state:'unknown',idempotencyKey}); }
  }
  async function recover() {
    const current = record.value;
    if (current.state !== 'unknown') return;
    const idempotencyKey=current.idempotencyKey;
    if (current.state !== 'unknown' || !uuid(idempotencyKey) || !hasApiKey || typeof getApiKey !== 'function') return;
    const apiKey=getApiKey(); if (!apiKey) return;
    update(record,{state:'recovering',idempotencyKey});
    try {
      const response=await fetch('/api/agent/recover',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({apiKey,projectId,idempotencyKey})});
      const data=agentResponseSchema.parse(await response.json());
      if (response.status===202 && data?.status==='consent_required' && typeof data.prompt==='string' && data.prompt.length<=4000 && !data.prompt.includes(apiKey) && uuid(data.attemptId) && typeof data.actionBinding==='string' && data.actionBinding.length>0 && data.actionBinding.length<=2048 && !data.actionBinding.includes(apiKey)) {
        update(record,{state:'consent',prompt:data.prompt,attemptId:data.attemptId,actionBinding:data.actionBinding}); return;
      }
      if (response.ok && data?.status==='completed' && typeof data.text==='string' && !data.text.includes(apiKey)) {update(record,{state:'text',text:data.text}); return;}
      update(record,{state:'unknown',idempotencyKey,recoveryStatus:data?.status==='in_progress'?'in_progress':'unavailable'});
    } catch { update(record,{state:'unknown',idempotencyKey,recoveryStatus:'unavailable'}); }
  }
  async function confirm() {
    const current = record.value;
    if (current.state !== 'consent' || !canStart || !hasApiKey || typeof getApiKey !== 'function') return;
    const apiKey = getApiKey(); if (!apiKey) return;
    try { const marker=JSON.stringify({state:'unknown',assetId:null}); sessionStorage.setItem(key,marker); if(sessionStorage.getItem(key)!==marker) throw Error('storage unavailable'); } catch {update(record,{...current,storageWarning:true}); return;}
    update(record,{state:'confirming',selectedAsset:null});
    try {
      const response = await fetch('/api/agent/image',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({apiKey,projectId,pieceId,version,attemptId:current.attemptId,actionBinding:current.actionBinding,explicitApproval:true})});
      const data = agentResponseSchema.parse(await response.json());
      if (response.ok && data?.status === 'accepted') {saveOutcome('accepted',data.assetId); return;}
      if (uuid(data?.assetId)) {saveOutcome('unknown',data.assetId); return;}
      throw Error();
    } catch { update(record,{state:'unknown'}); }
  }
  return <section aria-label="Direção criativa">
    <h4>Direção criativa</h4>
    {!canStart && <p>Salve a peça e termine as edições antes de iniciar.</p>}
    {flow.state === 'idle' && <button type="button" disabled={!initialized || !canStart || !hasApiKey || !objective?.trim()} onClick={start}>Iniciar direção criativa</button>}
    {flow.state === 'starting' && <p role="status">Preparando a direção…</p>}
    {flow.state === 'text' && <><p>{flow.text}</p><p>Nenhuma imagem foi gerada nesta tentativa.</p><button type="button" onClick={reset}>Iniciar nova tentativa</button></>}
    {flow.state === 'consent' && <><p>Imagem proposta para esta peça, versão {version}:</p><p>{flow.prompt}</p><button type="button" disabled={!canStart || !hasApiKey} onClick={confirm}>Confirmar geração de imagem</button></>}
    {flow.state === 'confirming' && <p role="status">Gerando imagem…</p>}
    {flow.state === 'accepted' && <><p role="status">O evento foi aceito. O turno ainda está em andamento.</p><button type="button" onClick={reset}>Iniciar nova tentativa</button></>}
    {flow.state === 'recovering' && <p role="status">Consultando a tentativa anterior…</p>}
    {flow.state === 'unknown' && <><p role="alert">O resultado da tentativa é desconhecido. Ela pode ter sido executada; não será repetida automaticamente.</p>{uuid(flow.idempotencyKey) && <button type="button" disabled={!hasApiKey} onClick={recover}>Consultar tentativa anterior</button>}{flow.recoveryStatus === 'in_progress' && <p>A tentativa ainda está em andamento.</p>}{flow.recoveryStatus === 'unavailable' && <p>Não foi possível recuperar a tentativa.</p>}<button type="button" onClick={reset}>Entendi, iniciar nova tentativa</button></>}
    {flow.history?.length > 0 && <div><p>Imagens anteriores nesta aba</p>{flow.history.map((assetId,index) => <button key={assetId} type="button" onClick={() => update(record,{...record.value,selectedAsset:assetId})}>Ver imagem anterior {index + 1}</button>)}</div>}
    <AssetRecovery key={key} userId={userId} projectId={projectId} pieceId={pieceId} version={version} onSelect={assetId=>update(record,{...record.value,selectedAsset:assetId})} />
    {preview && <><img src={preview} alt="Imagem para revisão" /><p>A origem da imagem não foi comprovada e ela ainda não está aprovada.</p><button type="button" disabled={!previewBlob || typeof onUseImage !== 'function'} onClick={() => { if (previewBlob) onUseImage?.(previewBlob); }}>Usar imagem na composição</button></>}
    {previewError && <p role="alert">Não foi possível carregar a imagem. <button type="button" onClick={() => setPreviewTry(n => n + 1)}>Tentar carregar novamente</button></p>}
    {flow.storageWarning && <p role="alert">Não foi possível preservar a referência da imagem nesta aba. Ela pode não aparecer após recarregar.</p>}
    {flow.state === 'storage_unavailable' && <p role="alert">Não foi possível preservar o estado da tentativa nesta aba. Verifique o armazenamento antes de iniciar.</p>}
  </section>;
}
