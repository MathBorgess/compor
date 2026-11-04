"use client";
import { useEffect, useRef, useState } from 'react';
import { composePng } from '../lib/compose-png.mjs';

// The base remains in this tab's memory across session revalidation, never in persistent storage.
const bases = new Map();
export default function Compose({ userId, projectId, pieceId, version, canSaveImage, content, generatedBase, onGeneratedUsed, invalidateComposition }) {
  const prefix = `${userId}:${projectId}:${pieceId}:`;
  const key = `${prefix}${version}`;
  const [base, setBase] = useState(() => bases.get(key)?.base ?? null);
  const [authorized, setAuthorized] = useState(() => bases.get(key)?.authorized ?? false);
  const [generated, setGenerated] = useState(() => bases.get(key)?.generated ?? false);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [uploadState, setUploadState] = useState('loading');
  const [pendingAssetId, setPendingAssetId] = useState(null);
  const [reviewState, setReviewState] = useState('idle');
  const [reviewUrl, setReviewUrl] = useState(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const uploadLock = useRef(false);
  const imageRevision = useRef(0);
  const reviewSequence = useRef(0);
  const uploadKey = `compor-image-upload:${userId}:${projectId}:${pieceId}:${version}`;
  const previewUrl = useRef(null);
  const generation = useRef(0);
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(uploadKey);
      if (saved === null) { setUploadState('idle'); setPendingAssetId(null); return; }
      const { assetId } = JSON.parse(saved);
      if (typeof assetId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(assetId)) throw Error('invalid marker');
      setPendingAssetId(assetId); setUploadState('unknown');
    } catch { setUploadState('unavailable'); }
  }, [uploadKey]);
  useEffect(() => {
    reviewSequence.current++; setReviewState('idle'); setAcknowledged(false); setReviewUrl(null);
    return () => { reviewSequence.current++; };
  }, [pendingAssetId]);
  useEffect(() => () => { if (reviewUrl) URL.revokeObjectURL(reviewUrl); }, [reviewUrl]);
  useEffect(() => {
    if (!invalidateComposition) return;
    invalidateComposition.current = clearPreview;
    return () => { if (invalidateComposition.current === clearPreview) invalidateComposition.current = null; };
  }, [invalidateComposition, key]);
  useEffect(() => {
    if (!generatedBase || !(generatedBase.blob instanceof Blob)) return;
    const blob = generatedBase.blob;
    const otherBytes = [...bases.entries()].reduce((sum, [entryKey, entry]) => sum + (entryKey === key ? 0 : entry.base.size), 0);
    if (blob.size > 8 * 1024 * 1024 || otherBytes + blob.size > 16 * 1024 * 1024) { setError('Limite de imagens na memória atingido. Remova uma imagem para continuar.'); onGeneratedUsed?.(generatedBase); return; }
    imageRevision.current++;
    clearPreview();
    const image = new File([blob], 'imagem-recuperada.png', {type:'image/png'});
    bases.set(key, {base:image,authorized:true,generated:true,version});
    setBase(image); setAuthorized(true); setGenerated(true); setError(''); setUploadState(current => ['unknown','pending','unavailable','loading'].includes(current) ? current : 'idle'); onGeneratedUsed?.(generatedBase);
  }, [generatedBase, key]);
  function clearPreview() {
    generation.current++;
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = null;
    setPreview(null);
  }
  useEffect(() => {
    clearPreview();
    return () => {
      generation.current++;
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
      previewUrl.current = null;
    };
  }, [base, authorized, content.headline, content.price, content.date]);
  function selectFile(event) {
    const file = event.target.files?.[0] ?? null;
    if (!file) return;
    const otherBytes = [...bases.entries()].reduce((sum, [entryKey, entry]) => sum + (entryKey === key ? 0 : entry.base.size), 0);
    if (file.size > 8 * 1024 * 1024 || otherBytes + file.size > 16 * 1024 * 1024) {
      event.target.value = '';
      setError(file.size > 8 * 1024 * 1024 ? 'A imagem deve ter no máximo 8 MiB.' : 'Limite de imagens na memória atingido. Remova uma imagem para continuar.');
      return;
    }
    imageRevision.current++;
    clearPreview(); setError(''); setAuthorized(false); setGenerated(false); setUploadState(current => ['unknown','pending','unavailable','loading'].includes(current) ? current : 'idle');
    bases.set(key, { base: file, authorized: false, version });
    setBase(file);
  }
  function setPermission(value) {
    imageRevision.current++;
    clearPreview(); setAuthorized(value); setError(''); setUploadState(current => ['unknown','pending','unavailable','loading'].includes(current) ? current : 'idle');
    if (base) bases.set(key, { base, authorized: value, generated, version });
  }
  function reuse(entry) {
    if (!entry?.base || !entry.authorized) return;
    imageRevision.current++;
    clearPreview(); setError(''); setUploadState(current => ['unknown','pending','unavailable','loading'].includes(current) ? current : 'idle');
    bases.set(key, { ...entry, version });
    setBase(entry.base); setAuthorized(true); setGenerated(!!entry.generated);
  }
  async function generate() {
    if (!base || !authorized || busy) return;
    clearPreview(); setError(''); setBusy(true);
    const current = generation.current;
    try {
      const png = await composePng({ base, headline: content.headline, price: content.price, date: content.date });
      if (current !== generation.current) return;
      const url = URL.createObjectURL(png);
      previewUrl.current = url; setPreview(url);
    } catch (cause) {
      if (current === generation.current) setError(cause?.message === 'Aguarde a composição anterior terminar.' ? cause.message : 'Não foi possível compor a imagem. Verifique o PNG e o tamanho dos textos.');
    } finally { if (mounted.current) setBusy(false); }
  }
  async function saveImage() {
    if (!base || !authorized || !canSaveImage || uploadLock.current || ['unknown','pending','unavailable','loading'].includes(uploadState)) return;
    if (base.size > 4 * 1024 * 1024) { setUploadState('too_large'); return; }
    const assetId = crypto.randomUUID();
    const marker = JSON.stringify({assetId});
    try {
      sessionStorage.setItem(uploadKey, marker);
      if (sessionStorage.getItem(uploadKey) !== marker) throw Error('storage unavailable');
    } catch { setUploadState('unavailable'); return; }
    uploadLock.current = true; setUploadState('pending'); setPendingAssetId(assetId);
    const requestedRevision = imageRevision.current;
    const query = new URLSearchParams({projectId,pieceId,version:String(version),assetId});
    try {
      const response = await fetch(`/api/images?${query}`, {method:'POST',headers:{'content-type':'image/png'},body:base,cache:'no-store'});
      const result = await response.json().catch(() => null);
      if (response.status === 201 && result?.status === 'stored' && result?.assetId === assetId) {
        try { if (!clearMarker(assetId)) { if (mounted.current) setUploadState('unavailable'); return; } } catch { if (mounted.current) setUploadState('unknown'); return; }
        if (mounted.current) setPendingAssetId(null);
        if (mounted.current) setUploadState(imageRevision.current === requestedRevision ? 'saved' : 'saved_previous');
      } else if ([400,401,403,404,413].includes(response.status)) {
        try { if (!clearMarker(assetId)) { if (mounted.current) setUploadState('unavailable'); return; } } catch { if (mounted.current) setUploadState('unknown'); return; }
        if (mounted.current) setPendingAssetId(null);
        if (mounted.current) setUploadState('error');
      } else if (mounted.current) setUploadState('unknown');
    } catch { if (mounted.current) setUploadState('unknown'); }
    finally { uploadLock.current = false; }
  }
  function clearMarker(assetId) {
    const raw = sessionStorage.getItem(uploadKey);
    if (raw === null || JSON.parse(raw)?.assetId !== assetId) return false;
    sessionStorage.removeItem(uploadKey);
    if (sessionStorage.getItem(uploadKey) !== null) throw Error('storage unavailable');
    return true;
  }
  async function reviewUpload() {
    if (uploadState !== 'unknown' || !pendingAssetId || reviewState === 'loading') return;
    const serial = ++reviewSequence.current;
    setReviewState('loading'); setAcknowledged(false); setReviewUrl(null);
    const query = new URLSearchParams({projectId,pieceId,version:String(version),assetId:pendingAssetId});
    try {
      const response = await fetch(`/api/images?${query}`, {cache:'no-store'});
      if (!response.ok || !/^image\/png(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '')) throw Error('unavailable');
      const blob = await response.blob();
      if (!blob.size || blob.size > 8 * 1024 * 1024) throw Error('unavailable');
      if (!mounted.current || serial !== reviewSequence.current) return;
      setReviewUrl(URL.createObjectURL(blob)); setReviewState('found');
    } catch { if (mounted.current && serial === reviewSequence.current) setReviewState('unverified'); }
  }
  function releaseUpload() {
    if (uploadState !== 'unknown' || !pendingAssetId || !acknowledged || !['found','unverified'].includes(reviewState)) return;
    try {
      if (!clearMarker(pendingAssetId)) { setUploadState('unavailable'); return; }
      setPendingAssetId(null); setUploadState('idle');
    } catch { setUploadState('unavailable'); }
  }
  return <section className="compose" aria-labelledby="compose-title">
    <h4 id="compose-title">Prévia e download</h4>
    <label htmlFor="base-image">Imagem-base PNG</label>
    <input id="base-image" type="file" accept="image/png" onChange={selectFile} />
    {[...bases.entries()].filter(([otherKey, entry]) => otherKey.startsWith(prefix) && otherKey !== key && entry.authorized).map(([otherKey, entry]) => <button key={otherKey} type="button" onClick={() => reuse(entry)}>Usar imagem da versão {entry.version === 0 ? 'rascunho' : entry.version}</button>)}
    {base && <><p>Imagem carregada: {base.name}</p><button type="button" onClick={() => { imageRevision.current++; clearPreview(); bases.delete(key); setBase(null); setAuthorized(false); setGenerated(false); setError(''); setUploadState(current => ['unknown','pending','unavailable','loading'].includes(current) ? current : 'idle'); }}>Remover imagem</button></>}
    <p>{generated ? 'Esta cópia fica na memória da aba; a imagem recuperada está no armazenamento privado.' : 'A imagem selecionada fica na memória desta aba até ser salva explicitamente no projeto.'} A legenda continua separada e editável.</p>
    <label className="compose-permission"><input type="checkbox" checked={authorized} disabled={!base} onChange={event => setPermission(event.target.checked)} />Tenho autorização para usar esta imagem</label>
    <button type="button" disabled={!base || !authorized || !canSaveImage || ['unknown','pending','unavailable','loading'].includes(uploadState)} onClick={saveImage}>Salvar imagem no projeto</button>
    {!canSaveImage && <p>Salve a peça antes de guardar a imagem no projeto.</p>}
    {uploadState === 'pending' && <p role="status">Enviando imagem…</p>}
    {uploadState === 'saved' && <p role="status">Imagem salva na versão {version}. Atualize a lista de imagens para recuperá-la.</p>}
    {uploadState === 'saved_previous' && <p role="status">A imagem enviada antes da troca foi salva na versão {version}. A seleção atual ainda não foi salva por este envio.</p>}
    {uploadState === 'too_large' && <p role="alert">Para salvar no projeto, a imagem deve ter no máximo 4 MiB.</p>}
    {uploadState === 'error' && <p role="alert">Não foi possível salvar a imagem. Verifique o PNG e a sessão.</p>}
    {uploadState === 'unavailable' && <p role="alert">Não foi possível preservar a referência do envio nesta aba. O upload está indisponível para evitar uma repetição incerta.</p>}
    {uploadState === 'unknown' && <div><p role="alert">O resultado do envio é desconhecido. Referência: {pendingAssetId}.</p>
      <button type="button" disabled={reviewState === 'loading'} onClick={reviewUpload}>Consultar imagem enviada</button>
      {reviewState === 'found' && <><p>A referência existe. Confira a imagem; isso não comprova sua origem ou integridade.</p><img className="compose-preview" src={reviewUrl} alt="Imagem encontrada na referência" /></>}
      {reviewState === 'unverified' && <p>Não foi possível confirmar a imagem. O envio anterior ainda pode ser concluído.</p>}
      {['found','unverified'].includes(reviewState) && <><label><input type="checkbox" checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)} />Entendo que o envio anterior pode ter sido concluído e um novo envio pode criar uma cópia.</label><button type="button" disabled={!acknowledged} onClick={releaseUpload}>Liberar novo envio</button></>}
    </div>}
    <button type="button" disabled={!base || !authorized || busy} onClick={generate}>{busy ? 'Gerando prévia…' : 'Gerar prévia PNG'}</button>
    {error && <p role="alert">{error}</p>}
    {preview && <div><img className="compose-preview" src={preview} alt="Prévia da peça" /><p><a href={preview} download="compor-peca.png">Baixar PNG</a></p></div>}
    <p>O download não representa aprovação ou publicação.</p>
  </section>;
}
