"use client";

import { useEffect, useState } from "react";
import { answerWithReuse, briefDecisions, briefRecordSchema, nextPrompt, recordFromStudio, skipPrompt, type BriefOption, type BriefPromptId, type BriefRecord } from "../lib/brief-interview";
import { referenceSummarySchema, type ExplorationReference } from "../lib/studio-decision-contract";
import { updateBrief, updatePersona } from "../lib/studio-state";
import type { StudioState } from "../lib/studio-domain";

type Props = {
  state: StudioState | null;
  change: (reducer: (state: StudioState) => StudioState) => StudioState | null;
  userId: string;
  projectId: string;
};

export function useBriefInterview({ state, change, userId, projectId }: Props) {
  const [opened, setOpened] = useState(false);
  const [saved, setSaved] = useState<BriefRecord>({});
  const [answer, setAnswer] = useState("");
  const [references, setReferences] = useState<ExplorationReference[]>([]);
  const [calibrating, setCalibrating] = useState(false);
  const [notice, setNotice] = useState("");
  const storageKey = `compor-brief-interview:${userId}:${projectId}`;
  const current = recordFromStudio(state);
  const record: BriefRecord = { ...saved };
  for (const item of briefDecisions) {
    if (!record[item.id]?.skipped) delete record[item.id];
  }
  Object.assign(record, current);
  const prompt = opened ? nextPrompt(record) : null;
  const decision = prompt?.kind === "decision" ? prompt.id : null;
  const briefing = state ? [state.brief.offer, state.brief.direction, state.brief.action, state.persona.audience].filter(Boolean).join("\n").slice(0, 1000) : "";
  const discarded: Partial<Record<BriefPromptId, readonly BriefOption[]>> = {};
  for (const item of briefDecisions) {
    if (item.options.some(option => option.text === record[item.id]?.text)) {
      discarded[item.id] = item.options.filter(option => option.text !== record[item.id]?.text);
    }
  }

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw) setSaved(briefRecordSchema.parse(JSON.parse(raw)));
    } catch { setNotice("O brief salvo nesta aba não pôde ser recuperado. Os dados do projeto continuam disponíveis."); }
  }, [storageKey]);

  useEffect(() => {
    setReferences([]);
    if (!decision) { setCalibrating(false); return; }
    const controller = new AbortController();
    setCalibrating(true);
    fetch("/api/studio/decision", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision, projectId, briefing }),
      signal: controller.signal,
    }).then(async response => {
      if (!response.ok) throw Error("exploration_unavailable");
      const raw: unknown = await response.json();
      if (!raw || typeof raw !== "object" || !("referenceSummary" in raw)) throw Error("invalid_exploration");
      const summary = referenceSummarySchema.parse(raw.referenceSummary);
      if (!controller.signal.aborted) setReferences(summary.references);
    }).catch(() => {
      if (!controller.signal.aborted) setNotice("As sugestões de referência estão indisponíveis. Você pode continuar com suas próprias palavras.");
    }).finally(() => { if (!controller.signal.aborted) setCalibrating(false); });
    return () => controller.abort();
  }, [decision, projectId, briefing]);

  function remember(next: BriefRecord) {
    const applied = change(value => {
      const patch: Partial<StudioState["brief"]> = {};
      if (next.produto && !next.produto.skipped) patch.offer = next.produto.text;
      if (next.objetivo && !next.objetivo.skipped) patch.action = next.objetivo.text;
      if (next.personalidade && !next.personalidade.skipped) patch.direction = next.personalidade.text;
      let updated = Object.keys(patch).length ? updateBrief(value, patch) : value;
      if (next.persona && !next.persona.skipped) updated = updatePersona(updated, { audience: next.persona.text });
      return updated;
    });
    if (!applied) throw Error("studio_unavailable");
    setSaved(next);
    setNotice("");
    try { sessionStorage.setItem(storageKey, JSON.stringify(next)); }
    catch { setNotice("As escolhas da exploração ficam somente nesta sessão. Os dados do projeto continuam disponíveis."); }
    setAnswer("");
    if (!nextPrompt(next)) setOpened(false);
  }
  function submit(text: string) {
    if (!prompt || !text.trim()) return;
    try { remember(answerWithReuse(record, prompt.id, text).record); }
    catch { setNotice("Não foi possível guardar a resposta. Use até 2.000 caracteres para a persona e não inclua chaves de API."); }
  }
  return {
    record, prompt, discarded, answer, references, calibrating, notice,
    setAnswer,
    start: () => { setNotice(""); setOpened(true); },
    close: () => { setOpened(false); setAnswer(""); },
    choose: (option: BriefOption) => submit(option.text),
    submit: () => submit(answer),
    skip: () => { if (prompt && !prompt.required) remember(skipPrompt(record, prompt.id)); },
  };
}
