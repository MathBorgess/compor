"use client";

import { useEffect, useRef, useState } from "react";
import * as z from '../lib/schema.ts';
import ReferencePreview from './reference-preview';
import { rememberShownExplorations } from '../lib/shown-explorations';

const imagesSchema = z.object({
  images: z.array(z.object({
    id: z.string().check(z.uuid()),
    project_id: z.string().check(z.uuid()),
    state: z.enum(["running", "unknown", "completed", "rejected"]),
    created_at: z.string(),
    ordinal: z.optional(z.number().check(z.int()).check(z.positive())),
    batch_id: z.optional(z.nullable(z.string().check(z.uuid()))),
    batch_position: z.optional(z.nullable(z.number().check(z.int()).check(z.minimum(1)).check(z.maximum(3)))),
  })).check(z.maxLength(100)),
  nextBeforeOrdinal: z.optional(z.nullable(z.number().check(z.int()).check(z.positive()))),
});
type ImageRecord = z.infer<typeof imagesSchema>["images"][number];

function mergeImages(incoming: ImageRecord[], previous: ImageRecord[]) {
  const byId = new Map(previous.map(item => [item.id, item]));
  for (const item of incoming) byId.set(item.id, item);
  return [...byId.values()].sort((a, b) => (b.ordinal ?? 0) - (a.ordinal ?? 0));
}

export default function ExplorationGallery({ projectId, completed, selectedIds, onUseReference, onRemoveReference, phase = "idle", countdown = null }: { projectId: string; completed: number; selectedIds: string[]; onUseReference: (imageId: string, file: File, ordinal?: number) => Promise<void>; onRemoveReference?:(imageId:string)=>Promise<void>; phase?: "idle" | "generating" | "waiting" | "blocked"; countdown?: number | null }) {
  const [images, setImages] = useState<ImageRecord[] | null>(null);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingPrevious, setLoadingPrevious] = useState(false);
  const [nextBeforeOrdinal, setNextBeforeOrdinal] = useState<number | null>(null);
  const loadedPrevious = useRef(false);
  const [previousOpen,setPreviousOpen]=useState(false);
  const [selecting, setSelecting] = useState<string | null>(null);
  const selectionLock = useRef(false);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    // This read has no generation side effect. Let it settle and ignore an
    // obsolete response instead of aborting it when the gallery closes.
    let active = true;
    async function load() {
      setLoading(true);
      setNotice("");
      try {
        const response = await fetch(`/api/studio/explorations?${new URLSearchParams({ projectId })}`, { cache: "no-store" });
        if (!response.ok) throw Error("unavailable");
        const result = imagesSchema.parse(await response.json());
        if (result.images.some((item) => item.project_id !== projectId)) throw Error("scope");
        if (active) {
          setImages(current => mergeImages(result.images, current ?? []));
          if (!loadedPrevious.current) setNextBeforeOrdinal(result.nextBeforeOrdinal ?? null);
        }
      } catch {
        if (active) setNotice("Não foi possível consultar as explorações agora.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [projectId, completed, refresh]);
  async function loadPrevious() {
    if (!nextBeforeOrdinal || loadingPrevious) return;
    setLoadingPrevious(true);
    setNotice("");
    try {
      const response = await fetch(`/api/studio/explorations?${new URLSearchParams({ projectId, beforeOrdinal: String(nextBeforeOrdinal) })}`, { cache: "no-store" });
      if (!response.ok) throw Error("unavailable");
      const result = imagesSchema.parse(await response.json());
      if (result.images.some(item => item.project_id !== projectId || (item.ordinal !== undefined && item.ordinal >= nextBeforeOrdinal)) || (result.nextBeforeOrdinal && result.nextBeforeOrdinal >= nextBeforeOrdinal)) throw Error("invalid page");
      loadedPrevious.current = true;
      setImages(current => mergeImages(result.images, current ?? []));
      setNextBeforeOrdinal(result.nextBeforeOrdinal ?? null);
    } catch {
      setNotice("Não foi possível carregar as imagens anteriores. Tente novamente.");
    } finally {
      setLoadingPrevious(false);
    }
  }
  async function useImage(imageId: string, ordinal?: number) {
    if (selectionLock.current || selectedIds.includes(imageId)) return;
    selectionLock.current = true;
    setSelecting(imageId);
    setNotice("");
    try {
      const response = await fetch(`/api/studio/explorations/image?${new URLSearchParams({ projectId, imageId })}`, { cache: "no-store" });
      if (!response.ok) throw Error("unavailable");
      const blob = await response.blob();
      if (blob.type !== "image/png" || !blob.size || blob.size > 8 * 1024 * 1024) throw Error("invalid image");
      await onUseReference(imageId, new File([blob], `exploracao-${imageId}.png`, { type: "image/png" }), ordinal);
      setNotice("Imagem adicionada à conversa e à Direção neste navegador.");
    } catch {
      setNotice("Não foi possível adicionar esta imagem. Suas outras referências foram preservadas.");
    } finally {
      selectionLock.current = false;
      setSelecting(null);
    }
  }
  async function removeImage(imageId:string) {
    if(!onRemoveReference||selectionLock.current)return;
    selectionLock.current=true;setSelecting(imageId);setNotice('');
    try {await onRemoveReference(imageId);setNotice('Imagem retirada da seleção.');}
    catch {setNotice('Não foi possível confirmar a alteração da seleção.');}
    finally {selectionLock.current=false;setSelecting(null);}
  }
  const newest = images?.[0];
  const latest = newest ? (newest.batch_id ? images?.filter(item => item.batch_id === newest.batch_id) ?? [] : [newest]) : [];
  const latestIds = new Set(latest.map(item => item.id));
  const previous = images?.filter(item => !latestIds.has(item.id)) ?? [];
  const shown=(previousOpen?[...latest,...previous]:latest).filter(item=>item.state==='completed' && item.ordinal!==undefined).map(item=>({id:item.id,ordinal:item.ordinal!}));
  const shownKey=JSON.stringify(shown);
  useEffect(()=>{try{rememberShownExplorations(projectId,JSON.parse(shownKey));}catch{}},[projectId,shownKey]);
  function imageCard(item: ImageRecord) {
    const label = item.ordinal ? String(item.ordinal) : item.id, selected = selectedIds.includes(item.id);
    return <figure key={item.id} data-image-id={item.id} data-selected={selected ? "true" : undefined}>
      {item.state === "completed" ? <><ReferencePreview src={`/api/studio/explorations/image?${new URLSearchParams({projectId,imageId:item.id})}`} title={`Imagem ${label}`}/><figcaption>Imagem {label}</figcaption><div className="reference-card-actions"><label className="reference-choice"><input type="checkbox" aria-label={`Escolher imagem ${label}`} checked={selected} disabled={selected&&!onRemoveReference} aria-disabled={Boolean(selecting)||undefined} onChange={()=>{if(selected)void removeImage(item.id);else void useImage(item.id,item.ordinal);}}/>{selecting===item.id?'Atualizando…':selected?'Escolhida':'Escolher'}</label><span className="reference-source" data-origin="generated">Gerada pelo Compor</span></div></> : <><p role="status">{item.state === "running" ? "Geração em andamento." : item.state === "rejected" ? "Chave recusada; nenhuma imagem foi gerada." : "Resultado não confirmado."}</p><figcaption>Imagem {label}</figcaption></>}

    </figure>;
  }
  return <section className="studio-exploration-gallery" aria-label="Explorações de imagem">
    <div className="exploration-gallery-heading"><h2>Explorações de imagem</h2><p>Compare as propostas. Escolher orienta a criação, sem aprovar a arte.</p></div>
    {notice && <p role="status" data-notice={notice.startsWith('Imagem adicionada')?'selected':'error'}>{notice}</p>}
    {images?.length === 0 && phase !== "generating" && <p>Nenhuma exploração encontrada neste projeto.</p>}
    {latest.length > 0 && <div className="studio-exploration-grid">{latest.map(imageCard)}</div>}
    <div className="exploration-gallery-controls">
      {phase === "waiting" && countdown !== null && <div className="studio-batch-wait" role="timer" aria-label={`Próximo lote em ${countdown} segundos`}><img className="studio-batch-spinner" src="/studio/compor-avatar.svg" alt="" /><span aria-hidden="true">Próximo lote em {countdown}s</span></div>}
      <button className="studio-button-secondary" type="button" onClick={() => setRefresh(value => value + 1)} disabled={loading}>{loading ? "Consultando…" : "Consultar explorações"}</button>
      {(previous.length > 0 || nextBeforeOrdinal !== null) && <details className="studio-previous-explorations" onToggle={event=>setPreviousOpen(event.currentTarget.open)}><summary>Ver imagens anteriores ({previous.length})</summary><div className="studio-exploration-grid">{previous.map(imageCard)}</div>{nextBeforeOrdinal !== null && <button type="button" className="studio-button-secondary" onClick={loadPrevious} disabled={loadingPrevious}>{loadingPrevious ? "Carregando…" : "Carregar anteriores"}</button>}</details>}
    </div>
  </section>;
}
