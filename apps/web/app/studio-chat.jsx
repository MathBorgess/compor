"use client";
import { useEffect, useRef, useState } from "react";
import {
  prepareAdjustment,
  settleAdjustment,
  getCurrentDraft,
} from "../lib/studio-state.mjs";

export default function StudioChat({
  state,
  getState,
  change,
  flush,
  tools,
  hasApiKey,
  getApiKey,
  onUseImage,
}) {
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [imageAction, setImageAction] = useState(null),
    [pending, setPending] = useState(null);
  const mounted = useRef(true),
    previous = useRef(null),
    timer = useRef(null),
    request = useRef(null),
    actionCount = useRef(new Map());
  const marker = `compor-studio-chat:${state.userId}:${state.projectId}`;
  useEffect(() => {
    mounted.current = true;
    try {
      const value = JSON.parse(sessionStorage.getItem(marker) ?? "null");
      if (value && typeof value.requestId === "string")
        setPending(value.requestId);
      previous.current = value?.previousAttemptKey ?? null;
    } catch {}
    return () => {
      mounted.current = false;
      clearTimeout(timer.current);
      request.current?.abort();
    };
  }, [marker]);
  function remember(requestId) {
    try {
      sessionStorage.setItem(
        marker,
        JSON.stringify({ requestId, previousAttemptKey: previous.current }),
      );
    } catch {
      throw Error("Não foi possível preservar a tentativa neste navegador.");
    }
  }
  async function api(path, body) {
    const key = getApiKey?.();
    if (!key) throw Error("Informe sua chave OpenAI para continuar.");
    const controller = new AbortController();
    request.current = controller;
    const response = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...body, apiKey: key }),
      signal: controller.signal,
    });
    const data = await response.json();
    if (!response.ok && response.status !== 202)
      throw Error(
        data.error === "turn_in_progress"
          ? "Uma solicitação anterior ainda está em andamento."
          : "Não foi possível concluir a consulta. O resultado pode estar incerto.",
      );
    return data;
  }
  function settle(requestId, status, result) {
    change((value) =>
      settleAdjustment(value, {
        requestId,
        status,
        ...(result ? { result, createdAt: new Date().toISOString() } : {}),
        eventId: crypto.randomUUID(),
      }),
    );
  }
  async function handle(data, requestId, count = 0) {
    if (!mounted.current) return;
    if (data.status === "completed") {
      settle(requestId, "completed", {
        messageId: crypto.randomUUID(),
        text: data.text ?? "Operação concluída.",
      });
      previous.current = requestId;
      remember(null);
      setPending(null);
      setBusy(false);
      setNotice("");
      return;
    }
    if (data.status === "consent_required") {
      setImageAction({ ...data, requestId });
      setBusy(false);
      setNotice("Revise a proposta antes de gerar a imagem.");
      return;
    }
    if (data.status === "action_required") {
      const n = actionCount.current.get(requestId) ?? 0;
      if (n >= 12) {
        setBusy(false);
        setNotice(
          "A sequência de ações precisa de revisão. A tentativa continua preservada.",
        );
        return;
      }
      actionCount.current.set(requestId, n + 1);
      if (!tools.current)
        throw Error("O estúdio ainda não está pronto para executar a ação.");
      const result = await tools.current.execute(
        data.action.name,
        data.action.args,
      );
      await flush();
      const next = await api("/api/studio/action", {
        projectId: state.projectId,
        requestId,
        actionBinding: data.actionBinding,
        result: { ...result, revision: getState().revision },
      });
      return handle(next, requestId, count + 1);
    }
    if (data.status === "running" && count < 60) {
      setNotice("O Compor está trabalhando na sua solicitação…");
      timer.current = setTimeout(() => poll(requestId, count + 1), 2000);
      return;
    }
    if (data.status === "failed") {
      settle(requestId, "failed");
      setPending(null);
      remember(null);
      setBusy(false);
      setNotice(
        "A solicitação terminou com falha. Seu trabalho foi preservado.",
      );
      return;
    }
    setBusy(false);
    setNotice(
      "O resultado ainda não foi confirmado. Consulte a mesma tentativa antes de enviar outro pedido.",
    );
  }
  async function poll(requestId, count = 0) {
    if (!mounted.current) return;
    setBusy(true);
    try {
      const data = await api("/api/studio/chat", {
        op: "poll",
        projectId: state.projectId,
        requestId,
      });
      await handle(data, requestId, count);
    } catch (e) {
      if (mounted.current) {
        setBusy(false);
        setNotice(e.message);
      }
    }
  }
  async function send(event) {
    event.preventDefault();
    if (!message.trim() || !hasApiKey || busy || pending) return;
    setNotice("");
    const requestId = crypto.randomUUID();
    try {
      const next = change((value) =>
        prepareAdjustment(value, {
          requestId,
          messageId: crypto.randomUUID(),
          instruction: message,
          createdAt: new Date().toISOString(),
          eventId: crypto.randomUUID(),
        }),
      );
      if (!next) throw Error("O projeto ainda está carregando.");
      await flush();
      remember(requestId);
      setPending(requestId);
      setBusy(true);
      setMessage("");
      const draft = getCurrentDraft(next),
        context = {
          revision: next.revision,
          pieceId: draft?.pieceId ?? null,
          baseVersion: draft?.baseVersion ?? 0,
          expectedLatestVersion: draft?.expectedLatestVersion ?? 0,
          brief: next.brief,
          persona: next.persona,
          marks: next.marks.filter(
            (mark) =>
              mark.pieceId === draft?.pieceId &&
              mark.baseVersion === draft?.baseVersion,
          ),
          references: next.references,
        };
      const data = await api("/api/studio/chat", {
        projectId: state.projectId,
        requestId,
        message: message.trim(),
        context,
        history: next.messages
          .slice(-30)
          .map(({ role, text }) => ({ role, text })),
        ...(previous.current ? { previousAttemptKey: previous.current } : {}),
      });
      await handle(data, requestId);
    } catch (e) {
      if (mounted.current) {
        setBusy(false);
        setNotice(e.message);
      }
    }
  }
  async function confirmImage() {
    const action = imageAction,
      draft = getCurrentDraft(getState());
    if (!action || !draft || draft.dirty || draft.baseVersion < 1) {
      setNotice("Salve a versão aberta antes de gerar a imagem.");
      return;
    }
    setBusy(true);
    setImageAction(null);
    try {
      const data = await api("/api/agent/image", {
        projectId: state.projectId,
        pieceId: draft.pieceId,
        version: draft.baseVersion,
        attemptId: action.attemptId,
        actionBinding: action.actionBinding,
        explicitApproval: true,
      });
      if (data.assetId) {
        const { fetchPrivateImage } =
          await import("../lib/private-image-fetch.mjs");
        const image = await fetchPrivateImage(
          new URLSearchParams({
            projectId: state.projectId,
            pieceId: draft.pieceId,
            version: String(draft.baseVersion),
            assetId: data.assetId,
          }),
        );
        if (mounted.current) onUseImage?.(image);
      }
      await poll(action.requestId);
    } catch (e) {
      if (mounted.current) {
        setBusy(false);
        setNotice(e.message);
      }
    }
  }
  return (
    <section className="studio-chat-panel" aria-label="Conversa do projeto">
      <header className="studio-chat-header">
        <span className="studio-chat-avatar" aria-hidden="true">
          C
        </span>
        <div>
          <h2>Vamos compor juntos</h2>
          <p>Uma conversa, muitas possibilidades.</p>
        </div>
      </header>
      <div className="studio-chat-messages" aria-live="polite">
        {state.messages.length === 0 && (
          <div className="studio-message" data-role="assistant">
            <p>
              Me conte o que você quer criar. Posso ajudar a organizar a ideia,
              entender quem vai comprar e ajustar o post aberto.
            </p>
          </div>
        )}
        {state.messages.map((item) => (
          <article
            className="studio-message"
            data-role={item.role}
            key={item.id}
          >
            <span className="studio-message-label">
              {item.role === "user" ? "Você" : "Compor"}
            </span>
            <p>{item.text}</p>
          </article>
        ))}
        {notice && (
          <p role="status" className="studio-hint">
            {notice}
          </p>
        )}
        {imageAction && (
          <div className="studio-image-consent">
            <h3>Uma imagem para este post</h3>
            <p>{imageAction.prompt}</p>
            <p>
              A geração será cobrada pela OpenAI. O custo final ainda é
              desconhecido.
            </p>
            <button
              type="button"
              className="studio-button"
              disabled={busy || !hasApiKey}
              onClick={confirmImage}
            >
              Confirmar geração de imagem
            </button>
            <button
              type="button"
              onClick={() => {
                setImageAction(null);
                setNotice(
                  "A proposta continua pendente na sessão. Você pode consultá-la novamente.",
                );
              }}
            >
              Voltar à criação
            </button>
          </div>
        )}
        {pending && !busy && !imageAction && (
          <button
            type="button"
            className="studio-button-secondary"
            disabled={!hasApiKey}
            onClick={() => poll(pending)}
          >
            Consultar esta tentativa
          </button>
        )}
      </div>
      <form className="studio-chat-composer" onSubmit={send}>
        <label htmlFor="studio-chat-message">Sua mensagem</label>
        <textarea
          id="studio-chat-message"
          rows={3}
          maxLength={4000}
          value={message}
          disabled={busy}
          placeholder="Peça um ajuste, abra um novo post…"
          onChange={(e) => setMessage(e.target.value)}
        />
        <div className="studio-composer-actions">
          <small>
            {hasApiKey
              ? "Conversa guardada neste navegador."
              : "Conecte sua chave para conversar com a IA."}
          </small>
          <button
            className="studio-button"
            disabled={!message.trim() || !hasApiKey || busy || Boolean(pending)}
          >
            {busy ? "Trabalhando…" : "Enviar →"}
          </button>
        </div>
      </form>
    </section>
  );
}
