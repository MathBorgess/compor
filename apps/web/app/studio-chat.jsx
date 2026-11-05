"use client";
import { useEffect, useRef, useState } from "react";
import {
  prepareAdjustment,
  settleAdjustment,
  getCurrentDraft,
} from "../lib/studio-state.mjs";
import { referenceImagesForRequest } from "../lib/studio-reference-images.mjs";

const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const diagnosticCount=value=>Number.isSafeInteger(value)&&value>=0&&value<=100000000?value:null;
const openAIAuthenticationNotice='A OpenAI recusou a autenticação desta chave. Confira sua chave para consultar a solicitação anterior.';
function inspectionSummary(data){
 const status=['completed','failed','running','action_required','consent_required','unknown'].includes(data?.status)?data.status:'unknown';
 const items=Array.isArray(data?.itemTrace?.items)?data.itemTrace.items.slice(0,24):[];
 return {status,authenticationRejected:status==='unknown'&&data?.errorCode==='provider_http_401',usage:data?.usage?{input_tokens:diagnosticCount(data.usage.input_tokens),output_tokens:diagnosticCount(data.usage.output_tokens)}:null,technical:data?.itemTrace?{functionCalls:diagnosticCount(data.itemTrace.functionCalls),outputs:diagnosticCount(data.itemTrace.outputs),omittedItems:diagnosticCount(data.itemTrace.omittedItems),validSchemas:items.filter(item=>item?.type==='function_call'&&item.schemaValid===true).length,invalidSchemas:items.filter(item=>item?.type==='function_call'&&item.schemaValid===false).length,errorClasses:[...new Set(items.filter(item=>item?.type==='function_call_output').map(item=>['timeout','unavailable','other'].includes(item.errorClass)?item.errorClass:null).filter(Boolean))]}:null};
}

export default function StudioChat({
  state,
  getState,
  change,
  flush,
  tools,
  hasApiKey,
  getApiKey,
  onUseImage,
  loadReference,
  loadBase,
}) {
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [imageAction, setImageAction] = useState(null),
    [pending, setPending] = useState(null),
    [usage, setUsage] = useState(null),
    [lastCompleted,setLastCompleted]=useState(null),
    [inspecting,setInspecting]=useState(false),
    [inspection,setInspection]=useState(null);
  const mounted = useRef(true),
    previous = useRef(null),
    timer = useRef(null),
    request = useRef(null),
    actionCount = useRef(new Map()),
    imageContext=useRef(null),
    inspectionLock=useRef(false),
    inspectionSequence=useRef(0);
  const marker = `compor-studio-chat:${state.userId}:${state.projectId}`;
  useEffect(() => {
    mounted.current = true;
    setLastCompleted(null);setInspection(null);setInspecting(false);inspectionLock.current=false;
    try {
      const value = JSON.parse(sessionStorage.getItem(marker) ?? "null");
      if (value && typeof value.requestId === "string")
        setPending(value.requestId);
      previous.current = value?.previousAttemptKey ?? null;
      setLastCompleted(uuid(value?.previousAttemptKey)?value.previousAttemptKey:null);
      imageContext.current=value?.imageContext??null;
    } catch {}
    return () => {
      mounted.current = false;
      inspectionSequence.current++;
      inspectionLock.current=false;
      clearTimeout(timer.current);
      request.current?.abort();
    };
  }, [marker]);
  function remember(requestId) {
    try {
      sessionStorage.setItem(
        marker,
        JSON.stringify({ requestId, previousAttemptKey: previous.current,...(requestId&&imageContext.current?{imageContext:imageContext.current}:{}) }),
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
    if (
      path === "/api/studio/chat" &&
      body.op !== "poll" &&
      [400, 401, 403, 404, 413].includes(response.status) &&
      [
        "invalid_request",
        "unauthorized",
        "invalid_origin",
        "not_found",
      ].includes(data.error)
    )
      return { status: "failed" };
    if (!response.ok && response.status !== 202 && data.status !== "failed")
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
      setUsage(data.usage ?? null);
      settle(requestId, "completed", {
        messageId: crypto.randomUUID(),
        text: data.text ?? "Operação concluída.",
      });
      previous.current = requestId;
      setLastCompleted(requestId);
      remember(null);
      setPending(null);
      setBusy(false);
      setNotice("");
      return;
    }
    if (data.status === "consent_required") {
      const known=imageContext.current??getState().adjustments.find(item=>item.id===requestId)?.context;
      const target=known?getState().drafts.find(item=>item.pieceId===known.pieceId&&item.baseVersion===known.baseVersion):null;
      const context=known?{pieceId:known.pieceId,baseVersion:known.baseVersion,headline:target?.content.headline??""}:null;
      if (!context)
        throw Error("Não foi possível identificar o post desta proposta.");
      setImageAction({ ...data, requestId, context });
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
      if(result.status==="completed"){
        const args=data.action.args;
        if(data.action.name==="compor_novo_post")imageContext.current={pieceId:result.pieceId,baseVersion:0};
        else if(data.action.name==="compor_abrir_versao")imageContext.current={pieceId:args.pieceId,baseVersion:args.version};
        else if(data.action.name==="compor_salvar_versao")imageContext.current={pieceId:result.pieceId,baseVersion:result.version};
        else if(data.action.name==="compor_editar_peca")imageContext.current={pieceId:args.pieceId,baseVersion:args.baseVersion};
        remember(requestId);
      }
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
        data.error === "project_busy" &&
          data.failurePhase === "before_submission" &&
          data.requestId === requestId
          ? "Este pedido não foi enviado à OpenAI porque outro pedido deste projeto ainda precisa ser consultado. Seu trabalho foi preservado."
          : "A solicitação terminou com falha. Seu trabalho foi preservado.",
      );
      return;
    }
    if(data.status==='unknown'&&data.errorCode==='provider_http_401'){
      setBusy(false);setNotice(openAIAuthenticationNotice);return;
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
  async function inspectLastCompleted(){
    if(!mounted.current||pending||busy||inspectionLock.current||!uuid(lastCompleted)||!hasApiKey)return;
    inspectionLock.current=true;setInspecting(true);setInspection(null);
    const serial=++inspectionSequence.current;
    try{
      const data=await api('/api/studio/chat',{op:'poll',projectId:state.projectId,requestId:lastCompleted});
      if(mounted.current&&serial===inspectionSequence.current)setInspection(inspectionSummary(data));
    }catch{
      if(mounted.current&&serial===inspectionSequence.current)setInspection({status:'unavailable',usage:null,technical:null});
    }finally{
      if(serial===inspectionSequence.current){inspectionLock.current=false;if(mounted.current)setInspecting(false);}
    }
  }
  async function send(event) {
    event.preventDefault();
    if (!message.trim() || !hasApiKey || busy || pending || inspectionLock.current) return;
    setNotice("");
    setBusy(true);
    const requestId = crypto.randomUUID();
    let prepared = false,
      submitted = false;
    try {
      const before = getState();
      const selected=getCurrentDraft(before), storedBase=await loadBase?.();
      const baseId=storedBase?selected?.pieceId:null;
      const visualReferences=[...before.references,...(baseId?[{id:baseId}]:[])];
      const referenceImages=await referenceImagesForRequest(visualReferences,id=>id===baseId?storedBase:loadReference(id),21);
      if (getState().revision !== before.revision)
        throw Error(
          "O contexto mudou enquanto as referências eram preparadas. Revise e envie novamente.",
        );
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
      prepared = true;
      imageContext.current={pieceId:selected.pieceId,baseVersion:selected.baseVersion};
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
          content: draft?.content ?? null,
          approval: draft?.approval ?? null,
          baseImageId: baseId,
          brief: next.brief,
          persona: next.persona,
          marks: next.marks.filter(
            (mark) =>
              mark.pieceId === draft?.pieceId &&
              mark.baseVersion === draft?.baseVersion,
          ),
          references: next.references,
        };
      submitted = true;
      const data = await api("/api/studio/chat", {
        projectId: state.projectId,
        requestId,
        message: message.trim(),
        context,
        history: before.messages
          .slice(-30)
          .map(({ role, text }) => ({ role, text })),
        referenceImages,
        ...(previous.current ? { previousAttemptKey: previous.current } : {}),
      });
      await handle(data, requestId);
    } catch (e) {
      if (mounted.current) {
        if (prepared && !submitted) {
          settle(requestId, "failed");
          remember(null);
          setPending(null);
        }
        setBusy(false);
        setNotice(e.message);
      }
    }
  }
  async function declineImage() {
    const action = imageAction;
    if (!action?.declineBinding || busy) return;
    setBusy(true);
    try {
      const next = await api("/api/studio/action", {
        projectId: state.projectId,
        requestId: action.requestId,
        actionBinding: action.declineBinding,
        result: { status: "declined" },
      });
      setImageAction(null);
      await handle(next, action.requestId);
    } catch (error) {
      if (mounted.current) {
        setBusy(false);
        setNotice(error.message);
      }
    }
  }
  async function confirmImage() {
    const action = imageAction,
      draft = getCurrentDraft(getState());
    if (
      !action ||
      !draft ||
      draft.dirty ||
      draft.baseVersion < 1 ||
      draft.pieceId !== action.context.pieceId ||
      draft.baseVersion !== action.context.baseVersion
    ) {
      setNotice("Abra a versão indicada na proposta e confirme que ela está salva, sem alterações locais. Se a proposta ainda for para um rascunho, recuse-a e peça uma nova depois de salvar.");
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
        if (mounted.current)
          onUseImage?.({
            blob: image,
            pieceId: draft.pieceId,
            version: draft.baseVersion,
          });
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
        <img src="/studio/compor-avatar.svg" alt="" width="26" height="26.4044" />
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
            <p>
              {imageAction.context.headline || "Post sem título"} · versão{" "}
              {imageAction.context.baseVersion || "ainda não salva"}
            </p>
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
            <button type="button" disabled={busy||!hasApiKey} onClick={()=>poll(imageAction.requestId)}>Consultar a mesma proposta</button>
            <button
              type="button"
              disabled={busy || !hasApiKey}
              onClick={declineImage}
            >
              Recusar geração
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
        {!pending&&!busy&&lastCompleted&&<div className="studio-attempt-inspection">
          <button type="button" className="studio-button-secondary" disabled={!hasApiKey||inspecting} onClick={inspectLastCompleted}>{inspecting?'Consultando estado…':'Consultar estado'}</button>
          {!hasApiKey&&<p>Conecte sua chave para consultar a solicitação anterior.</p>}
          {inspection&&<div role="status">
            {inspection.authenticationRejected?<p role="alert">{openAIAuthenticationNotice}</p>:<p>Estado da solicitação anterior: {{completed:'concluída',failed:'terminou com falha',running:'em andamento',action_required:'aguardando ação',consent_required:'aguardando confirmação',unknown:'não confirmado',unavailable:'consulta indisponível'}[inspection.status]}.</p>}
            <p>Esta consulta não executa ações nem inicia uma nova solicitação.</p>
            {inspection.usage&&<p>Uso informado: {inspection.usage.input_tokens??'?'} tokens de entrada e {inspection.usage.output_tokens??'?'} de saída. Custo final desconhecido.</p>}
            {inspection.technical&&<details><summary>Diagnóstico técnico</summary><dl>
              <dt>Ferramentas registradas</dt><dd>{inspection.technical.functionCalls??'?'}</dd>
              <dt>Resultados registrados</dt><dd>{inspection.technical.outputs??'?'}</dd>
              <dt>Argumentos válidos na amostra</dt><dd>{inspection.technical.validSchemas}</dd>
              <dt>Argumentos inválidos na amostra</dt><dd>{inspection.technical.invalidSchemas}</dd>
              <dt>Itens fora da amostra</dt><dd>{inspection.technical.omittedItems??'?'}</dd>
            </dl>{inspection.technical.errorClasses.map(code=><p key={code}>Ocorrência: {{timeout:'tempo de espera excedido',unavailable:'ferramenta indisponível',other:'falha sem classificação'}[code]}.</p>)}</details>}
          </div>}
        </div>}
      </div>
      <form className="studio-chat-composer" onSubmit={send}>
        <div className="studio-chat-context">
          <strong>
            {getCurrentDraft(state)?.content.headline || "Post sem título"}
          </strong>
          <span>
            {" "}
            ·{" "}
            {getCurrentDraft(state)?.baseVersion
              ? `base: versão ${getCurrentDraft(state).baseVersion}`
              : "rascunho novo"}
          </span>
          <details>
            <summary>Revisar contexto do pedido</summary>
            <p>{state.references.length} referências locais</p>
            {state.marks
              .filter(
                (mark) =>
                  mark.pieceId === state.selection?.pieceId &&
                  mark.baseVersion === state.selection?.baseVersion,
              )
              .map((mark) => (
                <p key={mark.id}>
                  {mark.kind === "area"
                    ? "Área da arte"
                    : `Elemento: ${{ headline: "título", price: "preço", date: "data", caption: "legenda" }[mark.elementId] ?? mark.elementId}`}{" "}
                  · {mark.note}
                </p>
              ))}
          </details>
          {usage && (
            <small>
              Uso acumulado informado pela sessão: {usage.input_tokens ?? "?"}{" "}
              tokens de entrada e {usage.output_tokens ?? "?"} de saída. Custo
              final desconhecido.
            </small>
          )}
        </div>
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
            disabled={!message.trim() || !hasApiKey || busy || inspecting || Boolean(pending)}
          >
            {busy ? "Trabalhando…" : "Enviar →"}
          </button>
        </div>
      </form>
    </section>
  );
}
