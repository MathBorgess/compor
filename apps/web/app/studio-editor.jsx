"use client";
import { useEffect, useId, useRef, useState } from "react";
import { composeStudioPng } from "../lib/studio-compose.mjs";

const elementLabels = { headline: "título", price: "preço", date: "data" };

export default function StudioEditor({
  draft,
  marks = [],
  base = null,
  onEdit,
  onMark,
  onRemoveMark,
  onPreview,
  onApprove,
}) {
  const [mode, setMode] = useState("select"),
    [region, setRegion] = useState(null),
    [note, setNote] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [url, setUrl] = useState(null);
  const frame = useRef(null),
    start = useRef(null),
    generation = useRef(0);
  const approvalHint = useId();
  useEffect(() => {
    setRegion(null);
    setNote("");
    setError("");
    generation.current++;
  }, [draft?.pieceId, draft?.baseVersion]);
  useEffect(()=>{generation.current++;setBusy(false);return()=>{generation.current++;};},[base,draft?.content.headline,draft?.content.price,draft?.content.date]);
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
          Ver arte
        </button>
        <button
          type="button"
          disabled={!base}
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
        aria-label="Arte integral do post"
      >
        {url && (
          <img
            className="studio-post-base"
            src={url}
            alt="Arte integral da versão selecionada"
          />
        )}
        {!url && <div className="studio-art-empty"><h2>A sua ideia ganha forma aqui</h2><p>Conte o que quer comunicar ou traga uma referência. Vamos criar a arte inteira, incluindo os textos.</p></div>}
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
        <p className="studio-hint">Estes textos orientam a próxima geração. Alterá-los não modifica os pixels da arte atual.</p>
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
        {marks.length > 0 && (
          <section className="studio-mark-list" aria-label="Marcações deste post">
            <h3>Marcações para o próximo pedido</h3>
            <ol>
              {marks.map((mark, index) => (
                <li key={mark.id}>
                  <strong>
                    {mark.kind === "element"
                      ? `Elemento ${elementLabels[mark.elementId] || mark.elementId}`
                      : `Área ${index + 1}`}
                  </strong>
                  <p>{mark.note}</p>
                  <button
                    type="button"
                    aria-label={`Remover marcação ${index + 1}`}
                    onClick={() => onRemoveMark?.(mark.id)}
                  >
                    Remover marcação
                  </button>
                </li>
              ))}
            </ol>
          </section>
        )}
        <div className="studio-editor-actions">
          <button type="button" disabled={busy || !base} onClick={preview}>
            {busy ? "Preparando…" : "Preparar PNG"}
          </button>
          <button
            type="button"
            disabled={draft.dirty || draft.baseVersion < 1}
            aria-describedby={draft.dirty || draft.baseVersion < 1 ? approvalHint : undefined}
            onClick={() => onApprove?.()}
          >
            Aprovar esta versão
          </button>
        </div>
        {draft.approval?.status==="approved"&&draft.approval.kind==="inherited"&&<p className="studio-hint">Aprovação herdada da versão {draft.approval.sourceVersion}. Esta herança não representa uma nova revisão humana.</p>}
        {(draft.dirty || draft.baseVersion < 1) && (
          <p id={approvalHint} className="studio-hint">Salve a versão para aprovar este post.</p>
        )}
        {error && <p role="alert">{error}</p>}
      </div>
    </div>
  );
}
