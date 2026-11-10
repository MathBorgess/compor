"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

export type CredentialSource = "default" | "byok";
const ownKeyValid = (value: string) => /^sk-[^\s]{20,300}$/.test(value);

/** Discard only provider continuity; pending requests and receipts must survive a key switch. */
function invalidateContinuations(userId: string) {
  try {
    for (const name of Object.keys(sessionStorage)) {
      if (!name.startsWith(`compor-studio-chat:${userId}:`)) continue;
      const raw=sessionStorage.getItem(name);
      if (!raw || raw.length>65536) continue;
      let value:unknown;
      try { value=JSON.parse(raw); } catch { continue; }
      if (value && typeof value==='object' && !Array.isArray(value) && 'previousAttemptKey' in value)
        sessionStorage.setItem(name,JSON.stringify({...value,previousAttemptKey:null}));
    }
    return true;
  } catch { return false; }
}

/** Credential material and activation live only in the authenticated tab. */
export function useAICredentials(userId: string | null, connected: boolean) {
  const [source, setSource] = useState<CredentialSource>("default");
  const [epoch, setEpoch] = useState(0);
  const [defaultAvailable, setDefaultAvailable] = useState(false);
  const [active, setActive] = useState(false);
  const [hasDraft, setHasDraft] = useState(false);
  const [notice, setNotice] = useState("");
  const key = useRef(""), draft = useRef("");
  const input = useRef<HTMLInputElement | null>(null);
  const owner = useRef<string | null>(null);
  const activated = useRef(false), intent = useRef(false);
  const identity = useRef({ userId, connected });
  identity.current = { userId, connected };
  const current = useRef({ source, defaultAvailable });
  current.current = { source, defaultAvailable };

  const clear = useCallback(() => {
    key.current = ""; draft.current = ""; owner.current = null;
    activated.current = false; intent.current = false;
    if (input.current) input.current.value = "";
    setHasDraft(false); setActive(false); setDefaultAvailable(false);
    setSource("default"); setNotice(""); setEpoch(value => value + 1);
  }, []);
  useLayoutEffect(() => { clear(); }, [userId, clear]);
  useEffect(() => () => {
    key.current = ""; draft.current = ""; owner.current = null;
    activated.current = false; intent.current = false;
    if (input.current) input.current.value = "";
  }, []);
  useEffect(() => {
    if (!connected || !userId) { setDefaultAvailable(false); return; }
    const controller = new AbortController();
    setDefaultAvailable(false);
    void fetch("/api/ai/credential-status", { cache: "no-store", signal: controller.signal })
      .then(async response => {
        const value: unknown = response.ok ? await response.json() : null;
        const available = value !== null && typeof value === "object" && !Array.isArray(value) &&
          Object.keys(value).length === 1 && "defaultAvailable" in value && value.defaultAvailable === true;
        if (controller.signal.aborted || identity.current.userId !== userId || !identity.current.connected) return;
        setDefaultAvailable(available);
        if (available && intent.current && current.current.source === "default") {
          activated.current = true; setActive(true);
        }
      }).catch(() => {
        if (!controller.signal.aborted && identity.current.userId === userId) setDefaultAvailable(false);
      });
    return () => controller.abort();
  }, [connected, userId]);

  const authenticated = connected && userId !== null;
  const ready = authenticated && (source === "byok" ? owner.current === userId && ownKeyValid(key.current) : defaultAvailable);
  const useAI = () => {
    if (!identity.current.connected || !identity.current.userId) return;
    intent.current = true;
    if (ready) { activated.current = true; setActive(true); }
  };
  const useDefault = () => {
    if (identity.current.userId && !invalidateContinuations(identity.current.userId)) {
      intent.current=false; setActive(false); setNotice("Não foi possível preservar as tentativas. Continue editando e verifique o armazenamento antes de trocar a IA."); return;
    }
    key.current = ""; draft.current = ""; owner.current = null;
    if (input.current) input.current.value = "";
    intent.current = false; setActive(false); setHasDraft(false);
    setSource("default"); setNotice(""); setEpoch(value => value + 1);
  };
  const connectOwn = () => {
    if (!identity.current.connected || !identity.current.userId || !draft.current.trim()) return;
    if (!invalidateContinuations(identity.current.userId)) {
      intent.current=false; setActive(false); setNotice("Não foi possível preservar as tentativas. Continue editando e verifique o armazenamento antes de trocar a IA."); return;
    }
    key.current = draft.current.trim(); owner.current = identity.current.userId;
    const first = !activated.current && ownKeyValid(key.current);
    intent.current = first;
    if (first) activated.current = true;
    setActive(first); setSource("byok"); setEpoch(value => value + 1);
    setNotice(ownKeyValid(key.current) ? first ? "" : "A fonte mudou. Comece ou retome quando estiver pronto." : "Confira sua chave OpenAI para continuar.");
  };
  const keyInput = <>
    <label>Chave OpenAI<input
      ref={element => { input.current = element; if (element) element.value = owner.current === userId ? draft.current : ""; }}
      type="password" autoComplete="off" spellCheck={false} maxLength={300}
      onChange={event => {
        if (!identity.current.connected || !identity.current.userId) return;
        draft.current = event.target.value; owner.current = identity.current.userId;
        setHasDraft(Boolean(event.target.value.trim())); setNotice("");
      }}
    /></label>
    <p className="studio-hint">O consumo desta chave é cobrado pela OpenAI. Ela fica na memória desta aba.</p>
    <button type="button" disabled={!authenticated || !hasDraft} onClick={connectOwn}>Usar minha chave</button>
    {notice && <p role="status">{notice}</p>}
  </>;
  return {
    source, epoch, defaultAvailable, hasApiKey: ready && active, canUseAI: ready, keyInput,
    getApiKey: () => identity.current.connected && identity.current.userId === owner.current && current.current.source === "byok" ? key.current : "",
    useAI, useDefault, clear, pauseAI: () => { intent.current = false; setActive(false); },
  };
}
