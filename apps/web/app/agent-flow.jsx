'use client';
import { useEffect, useState } from 'react';
import AssetRecovery from './asset-recovery';

// State belongs to one account, project, piece and saved version. It survives a
// session recheck, but secrets and prompts are never persisted by this module.
const flows = new Map();
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
function recordFor(key) {
  if (!flows.has(key)) flows.set(key, { value: { state: 'idle', history: [] }, listeners: new Set(), loaded: false });
  return flows.get(key);
}
function update(record, value) { record.value = {...value,history:value.history ?? record.value.history ?? [],selectedAsset:value.selectedAsset === undefined ? record.value.selectedAsset ?? null : value.selectedAsset}; for (const listener of record.listeners) listener(record.value); }

export default function AgentFlow({ userId, projectId, pieceId, version, canStart, objective, hasApiKey, getApiKey, onUseImage }) {
  const key = `compor-agent-attempt:${userId}:${projectId}:${pieceId}:${version}`;
  const historyKey = `${key}:assets`;
  const record = recordFor(key);
  const [flow, setFlow] = useState(record.value);
  const [initialized, setInitialized] = useState(record.loaded);
  const [preview, setPreview] = useState(null);
  const [previewBlob, setPreviewBlob] = useState(null);
  const [previewError, setPreviewError] = useState(false);
  const [previewTry, setPreviewTry] = useState(0);
  const selectedAsset = flow.selectedAsset;
  function readHistory() {
    const raw = sessionStorage.getItem(historyKey);
    if (raw === null) return [];
    const list = JSON.parse(raw);
    if (!Array.isArray(list) || !list.every(uuid)) throw Error('invalid image history');
    return [...new Set(list)];
  }
  function preserveAsset(assetId) {
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
          let restored = {state:'unknown'};
          try {
            const parsed = JSON.parse(saved);
            if (['accepted','unknown'].includes(parsed?.state)) restored = {state:parsed.state,assetId:uuid(parsed.assetId) ? parsed.assetId : null};
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
    const assetId = selectedAsset ?? (['accepted', 'unknown'].includes(flow.state) ? flow.assetId : null);
    if (!uuid(assetId)) return;
    const controller = new AbortController(); let url;
    const query = new URLSearchParams({projectId,pieceId,version:String(version),assetId});
    fetch(`/api/images?${query}`, {cache:'no-store',signal:controller.signal}).then(async response => {
      if (!response.ok || !/^image\/png(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '')) throw Error();
      const blob = await response.blob(); if (!blob.size || blob.size > 8 * 1024 * 1024) throw Error();
      if (controller.signal.aborted) return;
      url = URL.createObjectURL(blob); setPreview(url); setPreviewBlob(blob);
    }).catch(() => {if (!controller.signal.aborted) setPreviewError(true);});
    return () => {controller.abort(); if (url) URL.revokeObjectURL(url);};
  }, [flow.state, flow.assetId, selectedAsset, projectId, pieceId, version, previewTry]);
  function reset() {
    if (!preserveAsset(record.value.assetId)) return;
    try { sessionStorage.removeItem(key); update(record, {state:'idle'}); }
    catch { update(record, {...record.value,storageWarning:true}); }
  }
  function saveOutcome(state, assetId) {
    const value = {state,assetId:uuid(assetId) ? assetId : null};
    try { sessionStorage.setItem(key, JSON.stringify(value)); }
    catch { value.storageWarning = true; }
    update(record,{...value,...(value.assetId ? {selectedAsset:null} : {})});
    if (uuid(value.assetId) && !preserveAsset(value.assetId)) update(record,{...record.value,storageWarning:true});
  }
  async function start() {
    if (!initialized || record.value.state !== 'idle' || !canStart || !hasApiKey || !objective?.trim() || typeof getApiKey !== 'function') return;
    const apiKey = getApiKey(); if (!apiKey) return;
    try { sessionStorage.setItem(key, 'pending'); } catch { update(record,{state:'storage_unavailable'}); return; }
    update(record, {state:'starting',selectedAsset:null});
    try {
      const response = await fetch('/api/agent', {method:'POST',headers:{'content-type':'application/json','x-compor-project-id':projectId,'x-compor-attempt-id':crypto.randomUUID()},body:JSON.stringify({apiKey,objective})});
      const data = await response.json();
      if (response.status === 202 && data?.status === 'consent_required' && typeof data.prompt === 'string' && data.prompt.length <= 4000 && !data.prompt.includes(apiKey) && uuid(data.attemptId) && typeof data.actionBinding === 'string' && data.actionBinding.length > 0 && data.actionBinding.length <= 2048 && !data.actionBinding.includes(apiKey)) {
        update(record, {state:'consent', prompt:data.prompt, attemptId:data.attemptId, actionBinding:data.actionBinding}); return;
      }
      if (response.ok && response.status !== 202 && typeof data?.text === 'string' && !data.text.includes(apiKey)) {
        update(record,{state:'text',text:data.text}); return;
      }
      throw Error();
    } catch { update(record,{state:'unknown'}); }
  }
  async function confirm() {
    const current = record.value;
    if (current.state !== 'consent' || !canStart || !hasApiKey || typeof getApiKey !== 'function') return;
    const apiKey = getApiKey(); if (!apiKey) return;
    update(record,{state:'confirming',selectedAsset:null});
    try {
      const response = await fetch('/api/agent/image',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({apiKey,projectId,pieceId,version,attemptId:current.attemptId,actionBinding:current.actionBinding,explicitApproval:true})});
      const data = await response.json();
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
    {flow.state === 'text' && <><p>{flow.text}</p><button type="button" onClick={reset}>Iniciar nova tentativa</button></>}
    {flow.state === 'consent' && <><p>Imagem proposta para esta peça, versão {version}:</p><p>{flow.prompt}</p><button type="button" disabled={!canStart || !hasApiKey} onClick={confirm}>Confirmar geração de imagem</button></>}
    {flow.state === 'confirming' && <p role="status">Gerando imagem…</p>}
    {flow.state === 'accepted' && <><p role="status">O evento foi aceito. O turno ainda está em andamento.</p><button type="button" onClick={reset}>Iniciar nova tentativa</button></>}
    {flow.state === 'unknown' && <><p role="alert">O resultado da tentativa é desconhecido. Ela pode ter sido executada; não será repetida automaticamente.</p><button type="button" onClick={reset}>Entendi, iniciar nova tentativa</button></>}
    {flow.history?.length > 0 && <div><p>Imagens anteriores nesta aba</p>{flow.history.map((assetId,index) => <button key={assetId} type="button" onClick={() => update(record,{...record.value,selectedAsset:assetId})}>Ver imagem anterior {index + 1}</button>)}</div>}
    <AssetRecovery key={key} userId={userId} projectId={projectId} pieceId={pieceId} version={version} onSelect={assetId=>update(record,{...record.value,selectedAsset:assetId})} />
    {preview && <><img src={preview} alt="Imagem para revisão" /><p>A origem da imagem não foi comprovada e ela ainda não está aprovada.</p><button type="button" disabled={!previewBlob || typeof onUseImage !== 'function'} onClick={() => onUseImage(previewBlob)}>Usar imagem na composição</button></>}
    {previewError && <p role="alert">Não foi possível carregar a imagem. <button type="button" onClick={() => setPreviewTry(n => n + 1)}>Tentar carregar novamente</button></p>}
    {flow.storageWarning && <p role="alert">Não foi possível preservar a referência da imagem nesta aba. Ela pode não aparecer após recarregar.</p>}
    {flow.state === 'storage_unavailable' && <p role="alert">Não foi possível preservar o estado da tentativa nesta aba. Verifique o armazenamento antes de iniciar.</p>}
  </section>;
}
