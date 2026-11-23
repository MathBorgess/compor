"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";
import type { PieceFrame, PostFormat, StudioDraft } from "../lib/studio-domain";
import { composeStudioPng } from "../lib/studio-compose";
import { postFormatOption } from "../lib/studio-post-formats";
import { errorMessage } from "./studio-ui-types";
import { useObjectUrl } from './use-object-url.ts';

const EMPTY_FRAMES: readonly PieceFrame[] = [];
const EMPTY_FRAME_BLOBS: Readonly<Record<string, Blob>> = {};

function sanitizeFileBase(title: string) {
  return title.trim().replace(/[\\/<>:"|?*\u0000-\u001f]/g, "-") || "post";
}

function frameFilename(fileBase: string, position: number) {
  return `${fileBase}-${String(position).padStart(2, '0')}.png`;
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
  downloadTitle = title,
  draft,
  base,
  format = 'single',
  frames = EMPTY_FRAMES,
  frameBlobs = EMPTY_FRAME_BLOBS,
  saving = false,
  onSave,
}: {
  title: string;
  downloadTitle?: string;
  draft: StudioDraft | null;
  base: Blob | null;
  format?: PostFormat;
  frames?: readonly PieceFrame[];
  frameBlobs?: Readonly<Record<string, Blob>>;
  saving?: boolean;
  onSave?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const generation = useRef(0);
  const locked = useRef(false);
  const url = useObjectUrl(base);
  const availabilityId = useId();
  const orderedFrames = [...frames].sort((a, b) => a.position - b.position);
  const isCarousel = format === 'carousel' && orderedFrames.length > 0;
  const isMultiFrame = isCarousel || (format === 'collection' && orderedFrames.length > 0);
  const reviewFrames = orderedFrames.map(frame => ({ frame, blob: frameBlobs[frame.id] ?? (frame.position === 1 ? base : null) }));
  const availableFrames = reviewFrames.filter((entry): entry is { frame: PieceFrame; blob: Blob } => entry.blob !== null);
  const missingPositions = reviewFrames.filter(({blob}) => !blob).map(({frame}) => frame.position);
  const completeCarousel = isCarousel && missingPositions.length === 0;
  const coverUrl = useObjectUrl(isCarousel ? reviewFrames.find(({frame}) => frame.position === 1)?.blob ?? null : null);
  const formatOption = postFormatOption(format);
  const caption = draft?.content.caption ?? '';
  const filenameTitle = isCarousel ? downloadTitle : title;

  useLayoutEffect(() => {
    generation.current++;
    locked.current = false;
    setBusy(false);
    setNotice("");
    return () => { generation.current++; };
  }, [base, draft?.pieceId, draft?.baseVersion, filenameTitle, format, frames, frameBlobs, caption]);

  function triggerDownload(file: Blob, filename: string, current: number) {
    if (current !== generation.current) return false;
    const object = URL.createObjectURL(file);
    const anchor = document.createElement("a");
    anchor.href = object;
    anchor.download = filename;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(object), 1000);
    return true;
  }

  async function triggerPngDownload(blob: Blob, filename: string, current: number) {
    return triggerDownload(await composeStudioPng({ base: blob }), filename, current);
  }

  async function download() {
    if (!base || !draft || locked.current) return;
    const current = generation.current;
    locked.current = true;
    setBusy(true);
    setNotice("");
    try {
      await triggerPngDownload(base, `${sanitizeFileBase(filenameTitle)}-v${draft.baseVersion}.png`, current);
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
      await triggerPngDownload(blob, frameFilename(`${sanitizeFileBase(filenameTitle)}-v${draft.baseVersion}`, frame.position), current);
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
        const ok = await triggerPngDownload(blob, frameFilename(`${sanitizeFileBase(filenameTitle)}-v${draft.baseVersion}`, frame.position), current);
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

  async function downloadCarousel() {
    if (!draft || !completeCarousel || saving || locked.current) return;
    const current = generation.current;
    const isCurrent = () => current === generation.current;
    const fileBase = `${sanitizeFileBase(filenameTitle)}-v${draft.baseVersion}`;
    locked.current = true;
    setBusy(true);
    setNotice('Preparando ZIP…');
    try {
      const {createStudioZip} = await import('../lib/studio-zip');
      const entries = [];
      for (const {frame, blob} of availableFrames) {
        if (!isCurrent()) return;
        entries.push({name: frameFilename(fileBase, frame.position), file: await composeStudioPng({base: blob})});
      }
      entries.push({name: 'legenda.txt', file: new Blob([caption], {type: 'text/plain;charset=utf-8'})});
      const archive = await createStudioZip(entries, isCurrent);
      if (archive && triggerDownload(archive, `${fileBase}.zip`, current)) {
        setNotice('Download do ZIP iniciado.');
      }
    } catch (error) {
      if (isCurrent()) setNotice(errorMessage(error));
    } finally {
      if (isCurrent()) { locked.current = false; setBusy(false); }
    }
  }

  async function copyCaption() {
    const current = generation.current;
    try {
      await navigator.clipboard.writeText(caption);
      if (current === generation.current) setNotice("Legenda copiada.");
    } catch {
      if (current === generation.current) setNotice("Selecione e copie a legenda manualmente.");
    }
  }

  return (
    <section aria-label="Arte e legenda do projeto">
      <h3>{title}</h3>
      <p className="studio-hint">{formatOption.label} · {formatOption.ratioLabel}{isMultiFrame ? ` · ${orderedFrames.length} lâminas` : ''}</p>
      {isCarousel && !completeCarousel && (
        <p id={availabilityId} className="studio-hint" role="status">
          Carrossel incompleto. {availableFrames.length} de {orderedFrames.length} lâminas disponíveis. {missingPositions.length === 1 ? 'Falta' : 'Faltam'} {missingPositions.join(', ')}.
        </p>
      )}
      {coverUrl && (
        <details className="studio-carousel-profile">
          <summary>Prévia da capa no perfil</summary>
          <img src={coverUrl} alt="Capa do carrossel com recorte central de perfil em 3:4" />
        </details>
      )}
      {isMultiFrame ? (
        <div className="studio-review-frames-grid">
          {reviewFrames.map(({frame, blob}) => (
            <FrameReviewCard
              key={frame.id}
              frame={frame}
              blob={blob}
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
      {caption && <p className="studio-review-caption">{caption}</p>}
      <div className="studio-review-actions">
        {isCarousel && draft && onSave && (
          <button type="button" className="studio-button-secondary" disabled={saving || busy} onClick={onSave}>
            {saving ? "Salvando…" : "Salvar versão"}
          </button>
        )}
        {isCarousel ? (
          <button
            type="button"
            className="studio-button"
            disabled={busy || saving || !completeCarousel || !draft}
            aria-describedby={completeCarousel ? undefined : availabilityId}
            onClick={() => { void downloadCarousel(); }}
          >
            Baixar carrossel em ZIP
          </button>
        ) : isMultiFrame ? (
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
