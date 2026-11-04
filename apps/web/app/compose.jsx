"use client";
import { useEffect, useRef, useState } from 'react';
import { composePng } from '../lib/compose-png.mjs';

// The base remains in this tab's memory across session revalidation, never in persistent storage.
const bases = new Map();
export default function Compose({ userId, projectId, pieceId, version, content, generatedBase, onGeneratedUsed, invalidateComposition }) {
  const prefix = `${userId}:${projectId}:${pieceId}:`;
  const key = `${prefix}${version}`;
  const [base, setBase] = useState(() => bases.get(key)?.base ?? null);
  const [authorized, setAuthorized] = useState(() => bases.get(key)?.authorized ?? false);
  const [generated, setGenerated] = useState(() => bases.get(key)?.generated ?? false);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const previewUrl = useRef(null);
  const generation = useRef(0);
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
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
    clearPreview();
    const image = new File([blob], 'imagem-gerada.png', {type:'image/png'});
    bases.set(key, {base:image,authorized:true,generated:true,version});
    setBase(image); setAuthorized(true); setGenerated(true); setError(''); onGeneratedUsed?.(generatedBase);
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
    clearPreview(); setError(''); setAuthorized(false); setGenerated(false);
    bases.set(key, { base: file, authorized: false, version });
    setBase(file);
  }
  function setPermission(value) {
    clearPreview(); setAuthorized(value); setError('');
    if (base) bases.set(key, { base, authorized: value, generated, version });
  }
  function reuse(entry) {
    if (!entry?.base || !entry.authorized) return;
    clearPreview(); setError('');
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
  return <section className="compose" aria-labelledby="compose-title">
    <h4 id="compose-title">Prévia e download</h4>
    <label htmlFor="base-image">Imagem-base PNG</label>
    <input id="base-image" type="file" accept="image/png" onChange={selectFile} />
    {[...bases.entries()].filter(([otherKey, entry]) => otherKey.startsWith(prefix) && otherKey !== key && entry.authorized).map(([otherKey, entry]) => <button key={otherKey} type="button" onClick={() => reuse(entry)}>Usar imagem da versão {entry.version === 0 ? 'rascunho' : entry.version}</button>)}
    {base && <><p>Imagem carregada: {base.name}</p><button type="button" onClick={() => { clearPreview(); bases.delete(key); setBase(null); setAuthorized(false); setGenerated(false); setError(''); }}>Remover imagem</button></>}
    <p>{generated ? 'Esta cópia fica na memória da aba; a imagem gerada está no armazenamento privado.' : 'A imagem fica apenas na memória desta aba e não é salva no projeto.'} A legenda continua separada e editável.</p>
    <label className="compose-permission"><input type="checkbox" checked={authorized} disabled={!base} onChange={event => setPermission(event.target.checked)} />Tenho autorização para usar esta imagem</label>
    <button type="button" disabled={!base || !authorized || busy} onClick={generate}>{busy ? 'Gerando prévia…' : 'Gerar prévia PNG'}</button>
    {error && <p role="alert">{error}</p>}
    {preview && <div><img className="compose-preview" src={preview} alt="Prévia da peça" /><p><a href={preview} download="compor-peca.png">Baixar PNG</a></p></div>}
    <p>O download não representa aprovação ou publicação.</p>
  </section>;
}
