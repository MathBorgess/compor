"use client";

import { useEffect, useRef, useState } from "react";
import type { PieceFrame, PostFormat, StudioDraft } from "../lib/studio-domain";
import { composeStudioPng } from "../lib/studio-compose";
import { postFormatOption } from "../lib/studio-post-formats";
import { errorMessage } from "./studio-ui-types";
import { useObjectUrl } from './use-object-url.ts';

function sanitizeFileBase(title: string) {
  return title.trim().replace(/[\\/<>:"|?*\u0000-\u001f]/g, "-") || "post";
}

function FrameReviewCard({
  frame,
  blob,
  busy,
  onDownload,
}: {
  frame: PieceFrame;
  blob: Blob | null;
  busy: boolean;
  onDownload: (frame: PieceFrame, blob: Blob) => void;
}) {
  const url = useObjectUrl(blob);
  return (
    <article className="studio-review-frame-card" aria-label={`Lâmina ${frame.position}`}>
      <header>
        <strong>{frame.position}. {frame.role || `Lâmina ${frame.position}`}</strong>
      </header>
      {url ? (
        <img
          src={url}
          className="studio-export-preview"
          alt={`Prévia da lâmina ${frame.position}, sem textos adicionados pelo aplicativo`}
        />
      ) : (
        <p className="studio-hint">Imagem desta lâmina ainda não disponível.</p>
      )}
      {frame.headline && <p className="studio-review-frame-copy">{frame.headline}</p>}
      <button
        type="button"
        className="studio-button-secondary"
        disabled={busy || !blob}
        onClick={() => { if (blob) onDownload(frame, blob); }}
      >
        Baixar lâmina {frame.position}
      </button>
    </article>
  );
}

export default function StudioReview({
  title,
  draft,
  base,
  format = 'single',
  frames = [],
  frameBlobs = {},
}: {
  title: string;
  draft: StudioDraft | null;
  base: Blob | null;
  format?: PostFormat;
  frames?: readonly PieceFrame[];
  frameBlobs?: Readonly<Record<string, Blob>>;
}) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const generation = useRef(0);
  const locked = useRef(false);
  const url = useObjectUrl(base);
  const orderedFrames = [...frames].sort((a, b) => a.position - b.position);
  const isMultiFrame = (format === 'carousel' || format === 'collection') && orderedFrames.length > 0;
  const availableFrames = orderedFrames
    .map(frame => ({ frame, blob: frameBlobs[frame.id] ?? (frame.position === 1 ? base : null) }))
    .filter((entry): entry is { frame: PieceFrame; blob: Blob } => entry.blob !== null);
  const formatOption = postFormatOption(format);

  useEffect(() => {
    generation.current++;
    locked.current = false;
    setBusy(false);
    setNotice("");
    return () => { generation.current++; };
  }, [base, draft?.pieceId, draft?.baseVersion, title, format]);

  async function triggerPngDownload(blob: Blob, filename: string, current: number) {
    const png = await composeStudioPng({ base: blob });
    if (current !== generation.current) return false;
    const object = URL.createObjectURL(png);
    const anchor = document.createElement("a");
    anchor.href = object;
    anchor.download = filename;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(object), 1000);
    return true;
  }

  async function download() {
    if (!base || !draft || locked.current) return;
    const current = generation.current;
    locked.current = true;
    setBusy(true);
    setNotice("");
    try {
      await triggerPngDownload(base, `${sanitizeFileBase(title)}-v${draft.baseVersion}.png`, current);
    } catch (error) {
      if (current === generation.current) setNotice(errorMessage(error));
    } finally {
      if (current === generation.current) { locked.current = false; setBusy(false); }
    }
  }

  async function downloadFrame(frame: PieceFrame, blob: Blob) {
    if (!draft || locked.current) return;
    const current = generation.current;
    locked.current = true;
    setBusy(true);
    setNotice("");
    try {
      const index = String(frame.position).padStart(2, '0');
      await triggerPngDownload(blob, `${sanitizeFileBase(title)}-v${draft.baseVersion}-${index}.png`, current);
    } catch (error) {
      if (current === generation.current) setNotice(errorMessage(error));
    } finally {
      if (current === generation.current) { locked.current = false; setBusy(false); }
    }
  }

  async function downloadAllFrames() {
    if (!draft || !availableFrames.length || locked.current) return;
    const current = generation.current;
    locked.current = true;
    setBusy(true);
    setNotice("");
    try {
      for (const { frame, blob } of availableFrames) {
        const index = String(frame.position).padStart(2, '0');
        const ok = await triggerPngDownload(blob, `${sanitizeFileBase(title)}-v${draft.baseVersion}-${index}.png`, current);
        if (!ok) return;
      }
      if (current === generation.current) {
        setNotice(`${availableFrames.length} ${availableFrames.length === 1 ? 'lâmina preparada' : 'lâminas preparadas'} para download em ordem.`);
      }
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

  return (
    <section aria-label="Arte e legenda do projeto">
      <h3>{title}</h3>
      <p className="studio-hint">{formatOption.label} · {formatOption.ratioLabel}{isMultiFrame ? ` · ${orderedFrames.length} lâminas` : ''}</p>
      {isMultiFrame ? (
        <div className="studio-review-frames-grid">
          {orderedFrames.map(frame => (
            <FrameReviewCard
              key={frame.id}
              frame={frame}
              blob={frameBlobs[frame.id] ?? (frame.position === 1 ? base : null)}
              busy={busy}
              onDownload={(target, blob) => { void downloadFrame(target, blob); }}
            />
          ))}
        </div>
      ) : url ? (
        <img
          src={url}
          className="studio-export-preview"
          data-format={format}
          alt="Prévia da arte integral, sem textos adicionados pelo aplicativo"
        />
      ) : (
        <p>A imagem deste post ainda não está disponível. Volte ao estúdio para escolher ou recuperar a arte.</p>
      )}
      <p>{draft?.content.caption}</p>
      <div className="studio-review-actions">
        {isMultiFrame ? (
          <button
            type="button"
            className="studio-button"
            disabled={busy || !availableFrames.length || !draft}
            onClick={() => { void downloadAllFrames(); }}
          >
            {busy ? "Preparando…" : `Baixar todas (${availableFrames.length} PNGs)`}
          </button>
        ) : (
          <button type="button" className="studio-button" disabled={busy || !base || !draft} onClick={download}>
            {busy ? "Preparando…" : "Baixar PNG"}
          </button>
        )}
        <button type="button" disabled={!draft?.content.caption} onClick={copyCaption}>Copiar legenda</button>
      </div>
      {notice && <p role="status">{notice}</p>}
    </section>
  );
}
