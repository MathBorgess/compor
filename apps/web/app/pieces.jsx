"use client";
import { useEffect, useRef, useState } from 'react';

const blank = () => ({ headline: '', price: '', date: '', caption: '', captionOrigin: 'user' });
export default function Pieces({ projectId, userId }) {
  const storageKey = `compor-piece-draft:${userId}:${projectId}`;
  const [versions, setVersions] = useState([]);
  const [draft, setDraft] = useState(null);
  const [state, setState] = useState('loading');
  const [message, setMessage] = useState('');
  const [storageError, setStorageError] = useState(false);
  const sequence = useRef(0);
  useEffect(() => {
    const current = ++sequence.current;
    fetch(`/api/pieces?projectId=${encodeURIComponent(projectId)}`, { cache: 'no-store' }).then(response => { if (!response.ok) throw new Error(); return response.json(); }).then(data => {
      if (current !== sequence.current || !Array.isArray(data.versions)) return;
      setVersions(data.versions);
      try {
        const item = sessionStorage.getItem(storageKey);
        if (item) {
          const saved = JSON.parse(item);
          if (saved?.pieceId && saved?.content && Number.isInteger(saved.expectedVersion)) setDraft(saved);
        }
      } catch { setStorageError(true); }
      setState('ready');
    }).catch(() => { if (current === sequence.current) setState('unavailable'); });
    return () => { sequence.current++; };
  }, [projectId, storageKey]);
  function saveDraft(value) {
    setDraft(value);
    try { sessionStorage.setItem(storageKey, JSON.stringify(value)); setStorageError(false); }
    catch { setStorageError(true); }
  }
  function edit(field, value) {
    const content = { ...draft.content, [field]: value, ...(field === 'caption' ? { captionOrigin: 'user' } : {}) };
    saveDraft({ ...draft, content, dirty: true });
  }
  async function save() {
    if (!draft || state !== 'ready' || storageError || draft.conflict || draft.unknown) return;
    const current = sequence.current;
    setState('saving'); setMessage('');
    try {
      const response = await fetch('/api/pieces', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, pieceId: draft.pieceId, expectedVersion: draft.expectedVersion, content: draft.content }) });
      const data = await response.json();
      if (current !== sequence.current) return;
      if (response.status === 409 && data.status === 'conflict') {
        saveDraft({ ...draft, conflict: true, dirty: true }); setMessage('Existe outra versão. Seu rascunho foi preservado; copie ou revise antes de continuar.'); setState('ready'); return;
      }
      if (!response.ok || data.status !== 'saved' || data.version?.piece_id !== draft.pieceId || data.version?.version !== draft.expectedVersion + 1) throw new Error();
      setVersions(existing => [...existing, data.version]);
      saveDraft({ ...draft, expectedVersion: data.version.version, dirty: false });
      setMessage('Versão salva.'); setState('ready');
    } catch {
      if (current !== sequence.current) return;
      saveDraft({ ...draft, unknown: true, dirty: true });
      setMessage('O resultado pode ser desconhecido. Seu rascunho foi preservado; confira as versões antes de tentar novamente.'); setState('ready');
    }
  }
  async function refreshVersions() {
    try {
      const response = await fetch(`/api/pieces?projectId=${encodeURIComponent(projectId)}`, { cache: 'no-store' });
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (!Array.isArray(data.versions)) throw new Error();
      setVersions(data.versions);
    } catch { setMessage('Não foi possível consultar as versões. Seu rascunho permanece nesta aba.'); }
  }
  const latest = new Map();
  for (const version of versions) if (!latest.has(version.piece_id) || latest.get(version.piece_id).version < version.version) latest.set(version.piece_id, version);
  return <section className="pieces" aria-labelledby="pieces-title">
    <h3 id="pieces-title">Peças e versões</h3>
    {state === 'loading' && <p role="status">Carregando peças…</p>}
    {state === 'unavailable' && <p role="alert">Não foi possível carregar as peças.</p>}
    {(state === 'ready' || state === 'saving') && <>
      <ul>{[...latest.values()].map((version, index) => <li key={version.piece_id}>Peça {index + 1} {versions.filter(item => item.piece_id === version.piece_id).sort((a, b) => b.version - a.version).map(item => <button key={item.version} type="button" disabled={!!draft?.dirty || state === 'saving'} onClick={() => { setMessage(''); saveDraft({ pieceId: item.piece_id, expectedVersion: version.version, content: item.content, dirty: item.version !== version.version }); }}>Abrir peça {index + 1}, versão {item.version}</button>)}</li>)}</ul>
      <button type="button" disabled={!!draft?.dirty || state === 'saving'} onClick={() => { setMessage(''); saveDraft({ pieceId: crypto.randomUUID(), expectedVersion: 0, content: blank(), dirty: false }); }}>Nova peça</button>
      {draft && <div className="piece-editor">
        <label>Título da peça<input value={draft.content.headline} maxLength={500} disabled={state === 'saving'} onChange={e => edit('headline', e.target.value)} /></label>
        <label>Preço<input value={draft.content.price} maxLength={100} disabled={state === 'saving'} onChange={e => edit('price', e.target.value)} /></label>
        <label>Data<input value={draft.content.date} maxLength={100} disabled={state === 'saving'} onChange={e => edit('date', e.target.value)} /></label>
        <label>Legenda<textarea value={draft.content.caption} maxLength={4000} disabled={state === 'saving'} onChange={e => edit('caption', e.target.value)} /></label>
        <button type="button" disabled={state === 'saving' || storageError || draft.conflict || draft.unknown} onClick={save}>Salvar versão</button>
      </div>}
      {storageError && <p role="alert">Não foi possível preservar o rascunho nesta aba. Copie o texto antes de continuar.</p>}
      {(draft?.conflict || draft?.unknown) && <div>
        <p>Seu rascunho está preservado. Confira a versão salva antes de escolher uma nova base.</p>
        <button type="button" onClick={refreshVersions}>Atualizar versões</button>
        {latest.has(draft.pieceId) && <>
          <p>Versão {latest.get(draft.pieceId).version} salva: {latest.get(draft.pieceId).content.headline} — {latest.get(draft.pieceId).content.caption}</p>
          <button type="button" onClick={() => { const current = latest.get(draft.pieceId); saveDraft({ ...draft, expectedVersion: current.version, conflict: false, unknown: false, dirty: true }); setMessage('Base atualizada; revise seu rascunho antes de salvar.'); }}>Usar versão atual como base</button>
        </>}
      </div>}
      {message && <p role="status">{message}</p>}
    </>}
  </section>;
}
