"use client";
import { useEffect, useRef, useState } from "react";
import { composeStudioPng } from "../lib/studio-compose.mjs";

export default function StudioEditor({
  draft,
  marks = [],
  base = null,
  onEdit,
  onMark,
  onPreview,
  onApprove,
}) {
  const [mode, setMode] = useState("select"),
    [region, setRegion] = useState(null),
    [note, setNote] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [cropY, setCropY] = useState(0.5),
    [url, setUrl] = useState(null);
  const frame = useRef(null),
    start = useRef(null),
    generation = useRef(0);
  useEffect(() => {
    setRegion(null);
    setNote("");
    setError("");
    generation.current++;
  }, [draft?.pieceId, draft?.baseVersion]);
  useEffect(() => {
    if (!base) {
      setUrl(null);
      return;
    }
    const object = URL.createObjectURL(base);
    setUrl(object);
    return () => URL.revokeObjectURL(object);
  }, [base]);
  if (!draft)
    return (
      <div className="studio-empty">
        <h2>Seu próximo post começa aqui</h2>
        <p>Crie um post ou abra uma versão no histórico.</p>
      </div>
    );
  function point(event) {
    const rect = frame.current.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
    };
  }
  function down(event) {
    if (mode !== "area") return;
    event.currentTarget.setPointerCapture(event.pointerId);
    start.current = point(event);
    setRegion({ ...start.current, width: 0, height: 0 });
  }
  function move(event) {
    if (!start.current) return;
    const p = point(event),
      s = start.current;
    setRegion({
      x: Math.min(p.x, s.x),
      y: Math.min(p.y, s.y),
      width: Math.abs(p.x - s.x),
      height: Math.abs(p.y - s.y),
    });
  }
  function finish(event) {
    if (!start.current) return;
    move(event);
    start.current = null;
  }
  async function preview() {
    setBusy(true);
    setError("");
    const seq = generation.current;
    try {
      const blob = await composeStudioPng({
        base,
        content: draft.content,
        cropY,
      });
      if (seq === generation.current) onPreview?.(blob);
    } catch (e) {
      if (seq === generation.current) setError(e.message);
    } finally {
      if (seq === generation.current) setBusy(false);
    }
  }
  return (
    <div className="studio-editor">
      <div className="studio-canvas-tools">
        <button
          type="button"
          aria-pressed={mode === "select"}
          onClick={() => {
            setMode("select");
            setRegion(null);
          }}
        >
          Selecionar elemento
        </button>
        <button
          type="button"
          aria-pressed={mode === "area"}
          onClick={() => {
            setMode("area");
            setRegion({ x: 0.25, y: 0.25, width: 0.5, height: 0.5 });
          }}
        >
          Marcar área
        </button>
        <span>
          {draft.approval?.status === "approved" ? "Aprovado" : "Rascunho"}
        </span>
      </div>
      <div
        ref={frame}
        className={`studio-post-frame ${mode === "area" ? "is-marking" : ""}`}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={finish}
        onPointerCancel={() => {
          start.current = null;
        }}
        aria-label="Arte do post em formato retrato"
      >
        {url && (
          <img
            className="studio-post-base"
            src={url}
            alt="Imagem-base selecionada"
            style={{ objectPosition: `50% ${cropY * 100}%` }}
          />
        )}
        <div className={`studio-post-copy ${url ? "with-base" : ""}`}>
          {["headline", "price", "date"].map((field) => (
            <button
              key={field}
              type="button"
              className={`studio-post-${field}`}
              disabled={mode === "area"}
              onClick={() => {
                setRegion({ elementId: field });
                setNote("");
              }}
              aria-label={`Marcar elemento ${field === "headline" ? "título" : field === "price" ? "preço" : "data"}`}
            >
              {draft.content[field] ||
                { headline: "Seu título", price: "", date: "" }[field]}
            </button>
          ))}
        </div>
        {region?.width > 0 && (
          <div
            className="studio-area-mark"
            style={{
              left: `${region.x * 100}%`,
              top: `${region.y * 100}%`,
              width: `${region.width * 100}%`,
              height: `${region.height * 100}%`,
            }}
          />
        )}
        {marks.map(
          (mark) =>
            mark.kind === "area" && (
              <div
                key={mark.id}
                className="studio-area-mark saved"
                style={{
                  left: `${mark.x * 100}%`,
                  top: `${mark.y * 100}%`,
                  width: `${mark.width * 100}%`,
                  height: `${mark.height * 100}%`,
                }}
                title={mark.note}
              />
            ),
        )}
      </div>
      <div className="studio-post-inspector">
        <label>
          Título
          <input
            value={draft.content.headline}
            maxLength={500}
            onChange={(e) => onEdit?.("headline", e.target.value)}
          />
        </label>
        <div className="studio-field-pair">
          <label>
            Preço
            <input
              value={draft.content.price}
              maxLength={100}
              onChange={(e) => onEdit?.("price", e.target.value)}
            />
          </label>
          <label>
            Data
            <input
              value={draft.content.date}
              maxLength={100}
              onChange={(e) => onEdit?.("date", e.target.value)}
            />
          </label>
        </div>
        <label>
          Legenda
          <textarea
            value={draft.content.caption}
            maxLength={4000}
            rows={3}
            onChange={(e) => onEdit?.("caption", e.target.value)}
          />
        </label>
        {url && (
          <label>
            Enquadramento vertical
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={cropY}
              onChange={(e) => setCropY(Number(e.target.value))}
            />
          </label>
        )}
        {region && (
          <div className="studio-adjustment-note">
            {!region.elementId && (
              <div className="studio-area-coordinates">
                {[
                  ["x", "Posição horizontal"],
                  ["y", "Posição vertical"],
                  ["width", "Largura"],
                  ["height", "Altura"],
                ].map(([field, label]) => (
                  <label key={field}>
                    {label}
                    <input
                      type="range"
                      min={field === "x" || field === "y" ? 0 : 0.01}
                      max={
                        field === "x"
                          ? 1 - region.width
                          : field === "y"
                            ? 1 - region.height
                            : field === "width"
                              ? 1 - region.x
                              : 1 - region.y
                      }
                      step="0.01"
                      value={region[field]}
                      onChange={(event) =>
                        setRegion((value) => ({
                          ...value,
                          [field]: Number(event.target.value),
                        }))
                      }
                    />
                  </label>
                ))}
              </div>
            )}
            <label>
              O que deve mudar nesta {region.elementId ? "seleção" : "área"}?
              <textarea
                value={note}
                maxLength={2000}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
            <button
              type="button"
              disabled={
                !note.trim() ||
                (!region.elementId &&
                  (region.width < 0.01 || region.height < 0.01))
              }
              onClick={() => {
                onMark?.({
                  ...region,
                  kind: region.elementId ? "element" : "area",
                  note,
                });
                setRegion(null);
                setNote("");
              }}
            >
              Adicionar ao pedido
            </button>
          </div>
        )}
        <div className="studio-editor-actions">
          <button type="button" disabled={busy} onClick={preview}>
            {busy ? "Preparando…" : "Preparar PNG"}
          </button>
          <button type="button" onClick={() => onApprove?.()}>
            Aprovar esta versão
          </button>
        </div>
        {error && <p role="alert">{error}</p>}
      </div>
    </div>
  );
}
