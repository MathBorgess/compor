"use client";
import { useEffect, useRef, useState } from 'react';
import Compose from './compose';
import AgentFlow from './agent-flow';
import { legacyDraftSchema, versionsSchema, savedVersionSchema, type Content, type PieceVersion, type LegacyDraft, type GeneratedBase, type ConnectionProps } from './studio-ui-types';

const blank = (): Content => ({ headline: '', price: '', date: '', caption: '', captionOrigin: 'user' });
// This map survives component unmounts during session revalidation, not a page reload.
const memoryDrafts = new Map<string, {draft:LegacyDraft;storageError:boolean}>();
export default function Pieces({ projectId, userId, objective, hasApiKey, getApiKey }: ConnectionProps & {projectId:string;objective:string}) {
  const storageKey = `compor-piece-draft:${userId}:${projectId}`;
  const [versions, setVersions] = useState<PieceVersion[]>([]);
  const [draft, setDraft] = useState<LegacyDraft | null>(null);
  const [state, setState] = useState<'loading'|'ready'|'saving'|'unavailable'>('loading');
  const [message, setMessage] = useState('');
  const [storageError, setStorageError] = useState(false);
  const [generatedBase, setGeneratedBase] = useState<GeneratedBase | null>(null);
  const invalidateComposition = useRef<(() => void) | null>(null);
  const [readyBaseVersion, setReadyBaseVersion] = useState<number | null>(null);
  const sequence = useRef(0);
  const refreshSequence = useRef(0);
  useEffect(() => {
    const current = ++sequence.current;
    fetch(`/api/pieces?projectId=${encodeURIComponent(projectId)}`, { cache: 'no-store' }).then(response => { if (!response.ok) throw new Error(); return response.json(); }).then(raw => {
      const data = versionsSchema.parse(raw);
      if (current !== sequence.current || !Array.isArray(data.versions)) return;
      setVersions(data.versions);
      try {
        const memory = memoryDrafts.get(storageKey);
        const item = sessionStorage.getItem(storageKey);
        if (memory) { setDraft(memory.draft); setStorageError(memory.storageError); }
        else if (item) {
          const saved = legacyDraftSchema.safeParse(JSON.parse(item));
          if (saved.success) setDraft(saved.data);
        }
      } catch { const memory = memoryDrafts.get(storageKey); if (memory) setDraft(memory.draft); setStorageError(true); }
      setState('ready');
    }).catch(() => { if (current === sequence.current) setState('unavailable'); });
    return () => { sequence.current++; };
  }, [projectId, storageKey]);
  useEffect(() => {
    if (!storageError || !draft?.dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [storageError, draft?.dirty]);
  function saveDraft(value: LegacyDraft) {
    setDraft(value);
    try { sessionStorage.setItem(storageKey, JSON.stringify(value)); memoryDrafts.set(storageKey, { draft: value, storageError: false }); setStorageError(false); }
    catch { memoryDrafts.set(storageKey, { draft: value, storageError: true }); setStorageError(true); }
  }
  function edit(field: Exclude<keyof Content, 'captionOrigin'>, value: string) {
    if (!draft) return;
    const content: Content = { ...draft.content, [field]: value, ...(field === 'caption' ? { captionOrigin: 'user' } : {}) };
    saveDraft({ ...draft, content, dirty: true });
  }
  async function save() {
    if (!draft || state !== 'ready' || storageError || draft.conflict || draft.unknown) return;
    const current = sequence.current;
    setState('saving'); setMessage('');
    try {
      const response = await fetch('/api/pieces', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, pieceId: draft.pieceId, expectedVersion: draft.expectedVersion, content: draft.content }) });
      const data = savedVersionSchema.parse(await response.json());
      if (current !== sequence.current) return;
      if (response.status === 409 && data.status === 'conflict') {
        refreshSequence.current++;
        setReadyBaseVersion(null);
        saveDraft({ ...draft, conflict: true, dirty: true }); setMessage('Existe outra versão. Seu rascunho foi preservado; copie ou revise antes de continuar.'); setState('ready'); return;
      }
      if (!response.ok || data.status !== 'saved' || data.version?.piece_id !== draft.pieceId || data.version?.version !== draft.expectedVersion + 1) throw new Error();
      setVersions(existing => [...existing, data.version]);
      saveDraft({ ...draft, expectedVersion: data.version.version, sourceVersion: data.version.version, dirty: false });
      setMessage('Versão salva.'); setState('ready');
    } catch {
      if (current !== sequence.current) return;
      saveDraft({ ...draft, unknown: true, dirty: true });
      refreshSequence.current++;
      setReadyBaseVersion(null);
      setMessage('O resultado pode ser desconhecido. Seu rascunho foi preservado; confira as versões antes de tentar novamente.'); setState('ready');
    }
  }
  async function refreshVersions() {
    const currentRefresh = ++refreshSequence.current;
    setReadyBaseVersion(null);
    try {
      const response = await fetch(`/api/pieces?projectId=${encodeURIComponent(projectId)}`, { cache: 'no-store' });
      if (!response.ok) throw new Error();
      const data = versionsSchema.parse(await response.json());
      if (currentRefresh !== refreshSequence.current) return;
      setVersions(data.versions);
      const current = data.versions.filter(item => item.piece_id === draft?.pieceId).reduce((max, item) => Math.max(max, item.version), 0);
      setReadyBaseVersion(current);
    } catch { if (currentRefresh === refreshSequence.current) setMessage('Não foi possível consultar as versões. Seu rascunho permanece nesta aba.'); }
  }
  const latest = new Map<string, PieceVersion>();
  for (const version of versions) { const existing = latest.get(version.piece_id); if (!existing || existing.version < version.version) latest.set(version.piece_id, version); }
  const currentBase = draft ? latest.get(draft.pieceId) : undefined;
  const compositionVersion = draft && typeof draft.sourceVersion === 'number' && Number.isInteger(draft.sourceVersion) && draft.sourceVersion >= 0 ? draft.sourceVersion : 'não identificada';
  return <section className="pieces" aria-labelledby="pieces-title">
    <h3 id="pieces-title">Peças e versões</h3>
    {state === 'loading' && <p role="status">Carregando peças…</p>}
    {state === 'unavailable' && <p role="alert">Não foi possível carregar as peças.</p>}
    {(state === 'ready' || state === 'saving') && <>
      <ul>{[...latest.values()].map((version, index) => <li key={version.piece_id}>Peça {index + 1} {versions.filter(item => item.piece_id === version.piece_id).sort((a, b) => b.version - a.version).map(item => <button key={item.version} type="button" disabled={!!draft?.dirty || state === 'saving'} onClick={() => { setMessage(''); saveDraft({ pieceId: item.piece_id, expectedVersion: version.version, sourceVersion: item.version, content: item.content, dirty: item.version !== version.version }); }}>Abrir peça {index + 1}, versão {item.version}</button>)}</li>)}</ul>
      <button type="button" disabled={!!draft?.dirty || state === 'saving'} onClick={() => { setMessage(''); saveDraft({ pieceId: crypto.randomUUID(), expectedVersion: 0, sourceVersion: 0, content: blank(), dirty: false }); }}>Nova peça</button>
      {draft && <div className="piece-editor">
        <label>Título da peça<input value={draft.content.headline} maxLength={500} disabled={state === 'saving'} onChange={e => edit('headline', e.target.value)} /></label>
        <label>Preço<input value={draft.content.price} maxLength={100} disabled={state === 'saving'} onChange={e => edit('price', e.target.value)} /></label>
        <label>Data<input value={draft.content.date} maxLength={100} disabled={state === 'saving'} onChange={e => edit('date', e.target.value)} /></label>
        <label>Legenda<textarea value={draft.content.caption} maxLength={4000} disabled={state === 'saving'} onChange={e => edit('caption', e.target.value)} /></label>
        <button type="button" disabled={state === 'saving' || storageError || draft.conflict || draft.unknown} onClick={save}>Salvar versão</button>
        <AgentFlow key={`agent:${userId}:${projectId}:${draft.pieceId}:${compositionVersion}`} userId={userId} projectId={projectId} pieceId={draft.pieceId} version={compositionVersion} canStart={state === 'ready' && !draft.dirty && !draft.conflict && !draft.unknown && !storageError && draft.expectedVersion > 0 && draft.sourceVersion === draft.expectedVersion} objective={objective} hasApiKey={hasApiKey} getApiKey={getApiKey} onUseImage={blob => {invalidateComposition.current?.();setGeneratedBase({pieceId:draft.pieceId,version:compositionVersion,blob});}} />
        <Compose key={`compose:${userId}:${projectId}:${draft.pieceId}:${compositionVersion}`} userId={userId} projectId={projectId} pieceId={draft.pieceId} version={compositionVersion} canSaveImage={state === 'ready' && !draft.dirty && !draft.conflict && !draft.unknown && !storageError && draft.expectedVersion > 0 && draft.sourceVersion === draft.expectedVersion} content={draft.content} generatedBase={generatedBase?.pieceId === draft.pieceId && generatedBase?.version === compositionVersion ? generatedBase : null} onGeneratedUsed={value => setGeneratedBase(current => current === value ? null : current)} invalidateComposition={invalidateComposition} />
      </div>}
      {storageError && <p role="alert">Rascunho somente em memória. Copie o texto: fechar ou recarregar a página pode apagá-lo.</p>}
      {(draft?.conflict || draft?.unknown) && <div>
        <p>Seu rascunho está preservado. Confira a versão salva antes de escolher uma nova base.</p>
        <button type="button" onClick={refreshVersions}>Atualizar versões</button>
        {readyBaseVersion === 0 && draft.unknown && draft.expectedVersion === 0 && <>
          <p>Nenhuma versão foi encontrada. A gravação anterior ainda pode ser concluída; uma nova tentativa será verificada pela versão esperada.</p>
          <button type="button" onClick={() => { refreshSequence.current++; setReadyBaseVersion(null); saveDraft({ ...draft, expectedVersion: 0, sourceVersion: 0, conflict: false, unknown: false, dirty: true }); setMessage('Base vazia selecionada; revise seu rascunho antes de salvar.'); }}>Usar base vazia</button>
        </>}
        {currentBase && readyBaseVersion !== null && currentBase.version === readyBaseVersion && <>
          <p>Versão {currentBase.version} salva: {currentBase.content.headline} — {currentBase.content.caption}</p>
          <button type="button" onClick={() => { const current = currentBase; refreshSequence.current++; setReadyBaseVersion(null); saveDraft({ ...draft, expectedVersion: current.version, sourceVersion: current.version, conflict: false, unknown: false, dirty: true }); setMessage('Base atualizada; revise seu rascunho antes de salvar.'); }}>Usar versão atual como base</button>
        </>}
      </div>}
      {message && <p role="status">{message}</p>}
    </>}
  </section>;
}
