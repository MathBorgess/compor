"use client";

import { useEffect, useState } from "react";
import { answerWithReuse, briefDecisions, briefPatch, briefRecordSchema, chooseOption, nextPrompt, recordFromStudio, skipPrompt, type BriefOption, type BriefPromptId, type BriefRecord } from "../lib/brief-interview";
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
  const stored: BriefRecord = { ...saved };
  const record: BriefRecord = { ...stored };
  for (const item of briefDecisions) {
    if (!record[item.id]?.skipped) delete record[item.id];
  }
  Object.assign(record, current);
  for (const item of briefDecisions) {
    const previous = stored[item.id];
    const live = record[item.id];
    if (!previous?.claims?.length || !live || live.skipped || previous.skipped) continue;
    const preference = previous.direction ?? previous.text;
    if (live.text !== preference && live.text !== previous.text && !previous.claims.some((claim) => claim.text === live.text)) continue;
    record[item.id] = { ...live, ...(previous.direction ? { direction: previous.direction } : {}), claims: previous.claims };
  }
  const prompt = opened ? nextPrompt(record) : null;
  const decision = prompt?.kind === "decision" ? prompt.id : null;
  const briefing = state ? [state.brief.offer, state.brief.direction, state.brief.action, state.persona.audience].filter(Boolean).join("\n").slice(0, 1000) : "";
  const discarded: Partial<Record<BriefPromptId, readonly BriefOption[]>> = {};
  for (const item of briefDecisions) {
    const selected = record[item.id]?.direction ?? record[item.id]?.text;
    if (item.options.some((option) => option.direction === selected || option.text === selected)) {
      discarded[item.id] = item.options.filter((option) => option.direction !== selected && option.text !== selected);
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
      const patch = briefPatch(next);
      const brief: Partial<StudioState["brief"]> = {};
      if (patch.offer) brief.offer = patch.offer;
      if (patch.action) brief.action = patch.action;
      if (patch.direction) brief.direction = patch.direction;
      let updated = Object.keys(brief).length ? updateBrief(value, brief) : value;
      if (patch.persona) updated = updatePersona(updated, { audience: patch.persona });
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
    choose: (option: BriefOption) => {
      if (!prompt || prompt.kind !== "decision") return;
      try { remember(chooseOption(record, prompt.id, option)); }
      catch { setNotice("Não foi possível guardar a escolha. Use até 2.000 caracteres para a persona e não inclua chaves de API."); }
    },
    submit: () => submit(answer),
    skip: () => { if (prompt && !prompt.required) remember(skipPrompt(record, prompt.id)); },
  };
}
