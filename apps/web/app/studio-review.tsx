"use client";

import { useEffect, useRef, useState } from "react";
import type { StudioDraft } from "../lib/studio-domain";
import { composeStudioPng } from "../lib/studio-compose";
import { errorMessage } from "./studio-ui-types";
import {useObjectUrl} from './use-object-url.ts';

export default function StudioReview({ title, draft, base }: {title:string;draft:StudioDraft|null;base:Blob|null}) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const generation = useRef(0);
  const locked = useRef(false);
  const url = useObjectUrl(base);
  useEffect(() => {
    generation.current++;
    locked.current = false;
    setBusy(false);
    setNotice("");
    return () => { generation.current++; };
  }, [base, draft?.pieceId, draft?.baseVersion, title]);
  async function download() {
    if (!base || !draft || locked.current) return;
    const current = generation.current;
    locked.current = true;
    setBusy(true);
    setNotice("");
    try {
      const png = await composeStudioPng({base});
      if (current !== generation.current) return;
      const object = URL.createObjectURL(png);
      const anchor = document.createElement("a");
      anchor.href = object;
      anchor.download = `${title.trim().replace(/[\\/<>:"|?*\u0000-\u001f]/g, "-") || "post"}-v${draft.baseVersion}.png`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(object), 1000);
    } catch (error) {
      if (current === generation.current) setNotice(errorMessage(error));
    } finally {
      if (current === generation.current) { locked.current = false; setBusy(false); }
    }
  }
  async function copyCaption() {
    const current = generation.current;
    try {
      await navigator.clipboard.writeText(draft?.content.caption ?? "");
      if (current === generation.current) setNotice("Legenda copiada.");
    } catch {
      if (current === generation.current) setNotice("Selecione e copie a legenda manualmente.");
    }
  }
  return <section aria-label="Arte e legenda do projeto">
    <h3>{title}</h3>
    {url ? <img src={url} className="studio-export-preview" alt="Prévia da arte integral, sem textos adicionados pelo aplicativo" /> : <p>A imagem deste post ainda não está disponível. Volte ao estúdio para escolher ou recuperar a arte.</p>}
    <p>{draft?.content.caption}</p>
    <button type="button" className="studio-button" disabled={busy || !base || !draft} onClick={download}>{busy ? "Preparando…" : "Baixar PNG"}</button>
    <button type="button" disabled={!draft?.content.caption} onClick={copyCaption}>Copiar legenda</button>
    {notice && <p role="status">{notice}</p>}
  </section>;
}
