"use client";
import { useEffect, useRef, useState } from 'react';
import { composePng } from '../lib/compose-png.mjs';

// The base remains in this tab's memory across session revalidation, never in persistent storage.
const bases = new Map();
export default function Compose({ userId, projectId, pieceId, content }) {
  const key = `${userId}:${projectId}:${pieceId}`;
  const [base, setBase] = useState(() => bases.get(key)?.base ?? null);
  const [authorized, setAuthorized] = useState(() => bases.get(key)?.authorized ?? false);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const previewUrl = useRef(null);
  const generation = useRef(0);
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
    clearPreview(); setError(''); setAuthorized(false);
    bases.set(key, { base: file, authorized: false });
    setBase(file);
  }
  function setPermission(value) {
    clearPreview(); setAuthorized(value); setError('');
    if (base) bases.set(key, { base, authorized: value });
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
    } catch {
      if (current === generation.current) setError('Não foi possível compor a imagem. Verifique o PNG e o tamanho dos textos.');
    } finally { if (current === generation.current) setBusy(false); }
  }
  // When an input changes while composition is running, allow another attempt.
  useEffect(() => { setBusy(false); }, [base, authorized, content.headline, content.price, content.date]);
  return <section className="compose" aria-labelledby="compose-title">
    <h4 id="compose-title">Prévia e download</h4>
    <label htmlFor="base-image">Imagem-base PNG</label>
    <input id="base-image" type="file" accept="image/png" onChange={selectFile} />
    {base && <><p>Imagem carregada: {base.name}</p><button type="button" onClick={() => { clearPreview(); bases.delete(key); setBase(null); setAuthorized(false); setError(''); }}>Remover imagem</button></>}
    <p>A imagem fica apenas na memória desta aba e não é salva no projeto. A legenda continua separada e editável.</p>
    <label className="compose-permission"><input type="checkbox" checked={authorized} disabled={!base} onChange={event => setPermission(event.target.checked)} />Tenho autorização para usar esta imagem</label>
    <button type="button" disabled={!base || !authorized || busy} onClick={generate}>{busy ? 'Gerando prévia…' : 'Gerar prévia PNG'}</button>
    {error && <p role="alert">{error}</p>}
    {preview && <div><img className="compose-preview" src={preview} alt="Prévia da peça" /><p><a href={preview} download="compor-peca.png">Baixar PNG</a></p></div>}
    <p>O download não representa aprovação ou publicação.</p>
  </section>;
}
