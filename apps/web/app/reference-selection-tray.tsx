"use client";
import { useEffect, useRef } from "react";
import type { StudioReference } from "../lib/studio-domain.ts";
import "./reference-exploration.css";

type Item = StudioReference & { url?: string };
export type ReferenceOrigin = "pinterest" | "generated" | "upload";
export function referenceOrigin(reference: StudioReference): ReferenceOrigin {
  if (reference.source && "originUrl" in reference.source) return "pinterest";
  if (reference.source && "kind" in reference.source) return "generated";
  return "upload";
}
export const REFERENCE_ORIGIN_LABEL: Record<ReferenceOrigin, string> = { pinterest: "Pinterest · externa", generated: "Gerada pelo Compor", upload: "Enviada por você" };
function referenceTitle(reference: StudioReference) {
  const source = reference.source;
  if (source && "originUrl" in source) return source.title ?? "Referência do Pinterest";
  if (source && "kind" in source) return source.ordinal ? `Imagem ${source.ordinal}` : "Imagem gerada";
  return reference.name;
}

/** The current selection, always visible above the suggestions: how many, where
 * each came from, and how to remove it. Removing never deletes other images. */
export default function ReferenceSelectionTray({ items, limit, onRemove }: { items: Item[]; limit: number; onRemove: (id: string) => Promise<void> }) {
  const heading = useRef<HTMLHeadingElement>(null), list = useRef<HTMLUListElement>(null), focusIndex = useRef<number | null>(null);
  const ids = items.map(item => item.id).join(",");
  useEffect(() => {
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
      ? <p className="reference-selection-empty">Nenhuma imagem selecionada. Escolha abaixo o que chamou sua atenção.</p>
      : <ul ref={list} className="reference-selection-list">{items.map((item, index) => {
        const origin = referenceOrigin(item), title = referenceTitle(item);
        return <li key={item.id}>
          {item.url ? <img src={item.url} alt="" /> : <span className="reference-selection-placeholder" aria-hidden="true" />}
          <span className="reference-source" data-origin={origin}>{REFERENCE_ORIGIN_LABEL[origin]}</span>
          <span className="reference-selection-title" title={title}>{title}</span>
          <button type="button" aria-label={`Remover da seleção: ${title}`} onClick={() => { focusIndex.current = index; void onRemove(item.id); }}>Remover</button>
        </li>;
      })}</ul>}
    <p className="reference-selection-note">Selecionar orienta o gosto do post. Não aprova a imagem nem todos os seus elementos. Quando a seleção se estabiliza, o Compor comenta na conversa.</p>
  </section>;
}
