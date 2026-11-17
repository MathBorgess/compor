"use client";
import { useEffect, useRef } from "react";
import type { StudioReference } from "../lib/studio-domain.ts";
import "./reference-exploration.css";

type Item = StudioReference & { url?: string;scopeLabel?:string;removeLabel?:string;onShare?:()=>void };
export type ReferenceOrigin = "pinterest" | "generated" | "upload" | "unknown";
export function referenceOrigin(reference: StudioReference): ReferenceOrigin {
  if (reference.source && "originUrl" in reference.source) return "pinterest";
  if (reference.source && "kind" in reference.source) return reference.source.kind==='generated'?"generated":"upload";
  return "unknown";
}
export const REFERENCE_ORIGIN_LABEL: Record<ReferenceOrigin, string> = { pinterest: "Pinterest · externa", generated: "Gerada pelo Compor", upload: "Enviada por você", unknown:"Origem desconhecida · reanexe para incluir" };
function referenceTitle(reference: StudioReference) {
  const source = reference.source;
  if (source && "originUrl" in source) return source.title ?? "Referência do Pinterest";
  if (source && "kind" in source && source.kind==='generated') return source.ordinal ? `Imagem ${source.ordinal}` : "Imagem gerada";
  return reference.name;
}

/** Inspect the selection and its scope. The focused gallery discloses this tray
 * on demand; removing a selection never deletes the source image. */
export default function ReferenceSelectionTray({ items, limit, onRemove, availableShared = [], onUseShared }: { items: Item[]; limit: number; onRemove: (id: string) => Promise<void>; availableShared?: (StudioReference & { url?: string })[]; onUseShared?: (id: string) => void | Promise<void> }) {
  const heading = useRef<HTMLHeadingElement>(null), list = useRef<HTMLUListElement>(null), focusIndex = useRef<number | null>(null), focusAdded = useRef<string | null>(null);
  const ids = items.map(item => item.id).join(",");
  useEffect(() => {
    const added = focusAdded.current;
    if (added) {
      const card = Array.from(list.current?.children ?? []).find(item => item.getAttribute("data-reference-id") === added);
      if (card) { focusAdded.current = null; card.querySelector<HTMLButtonElement>("button")?.focus(); }
    }
    const index = focusIndex.current;
    if (index === null) return;
    focusIndex.current = null;
    // Keep keyboard and screen reader users in the tray after a removal.
    const active = document.activeElement;
    if (active && active !== document.body && document.contains(active)) return;
    const buttons = list.current ? Array.from(list.current.querySelectorAll<HTMLButtonElement>("button")) : [];
    (buttons[Math.min(index, buttons.length - 1)] ?? heading.current)?.focus();
  }, [ids]);
  return <section className="reference-selection-tray" aria-labelledby="reference-selection-title">
    <div className="reference-selection-heading">
      <h2 id="reference-selection-title" ref={heading} tabIndex={-1}>Sua seleção</h2>
      <p className="reference-selection-count" aria-live="polite"><strong>{items.length}</strong> de {limit} referências</p>
    </div>
    {items.length === 0
      ? <p className="reference-selection-empty">Nenhuma imagem selecionada. Escolha o que chamou sua atenção.</p>
      : <ul ref={list} className="reference-selection-list">{items.map((item, index) => {
        const origin = referenceOrigin(item), title = referenceTitle(item);
        return <li key={item.id} data-reference-id={item.id}>
          {item.url ? <img src={item.url} alt="" /> : <span className="reference-selection-placeholder" aria-hidden="true" />}
          <div className="reference-selection-meta"><span className="reference-source" data-origin={origin}>{REFERENCE_ORIGIN_LABEL[origin]}</span>
          <span className="reference-selection-scope">{item.scopeLabel}</span><span className="reference-selection-title" title={title}>{title}</span></div>
          <button type="button" className="reference-selection-remove" title={item.removeLabel??'Remover da seleção'} aria-label={`Remover da seleção: ${title}`} onClick={() => { focusIndex.current = index; void onRemove(item.id); }}>Retirar</button>{item.onShare&&<button type="button" className="reference-selection-share" onClick={item.onShare}>Compartilhar com o projeto</button>}
        </li>;
      })}</ul>}
    {availableShared.length > 0 && onUseShared && <div className="reference-shared-available">
      <h3>Disponíveis do projeto</h3>
      <p>Estas referências estão no projeto, mas não fazem parte deste post.</p>
      <ul className="reference-selection-list">{availableShared.map(reference => {
        const title = referenceTitle(reference);
        return <li key={reference.id}>
          {reference.url ? <img src={reference.url} alt="" /> : <span className="reference-selection-placeholder" aria-hidden="true" />}
          <span className="reference-selection-scope">Do projeto</span>
          <span className="reference-selection-title" title={title}>{title}</span>
          <button type="button" aria-label={`Usar neste post: ${title}`} onClick={() => { focusAdded.current = reference.id; void onUseShared(reference.id); }}>Usar neste post</button>
        </li>;
      })}</ul>
    </div>}
    <p className="reference-selection-note">A seleção orienta o estilo, sem aprovar a imagem. O Compor comenta as referências na conversa.</p>
  </section>;
}
