"use client";
import { useEffect, useRef, useState, type RefObject, type ReactNode, type FormEvent } from "react";
import {
  prepareAdjustment,
  settleAdjustment,
  getCurrentDraft,
} from "../lib/studio-state.ts";
import { parseImageProposal } from "@compor/agents-api/image-proposal";
import { prepareArtworkTransport, artworkSourceFingerprint, ArtworkTransportRequiredError } from "../lib/studio-artwork-input.ts";
import { referenceImagesForRequest } from "../lib/studio-reference-images.ts";

import { parseStudioAction } from '@compor/agents-api/studio-chat-tools';
import type { StudioState, AdjustmentResult, RequestStatus, DraftContext, StoredImage, ActionResult } from '../lib/studio-domain';
import { createStudioTools } from '../lib/studio-tools';
import { uuid, errorMessage, type ImageSelection } from './studio-ui-types';
import { chatResponseSchema, errorResponseSchema, chatMarkerSchema, receiptSchema, type ChatResponse, type ImageAction, type ImageContext, type ImageReceipt, type Usage, type Inspection } from './studio-chat-contract';
const diagnosticCount=(value:unknown)=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0&&value<=100000000?value:null;
const openAIAuthenticationNotice='A OpenAI recusou a autenticação desta chave. Confira sua chave para consultar a solicitação anterior.';
function imageReceiptFor(input:unknown,userId:string,projectId:string):ImageReceipt|null{
 const parsed=receiptSchema.safeParse(input);if(!parsed.success)return null;const value=parsed.data;
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!=='assetId,pieceId,projectId,requestId,userId,version'||value.userId!==userId||value.projectId!==projectId||![value.assetId,value.pieceId,value.requestId,userId,projectId].every(uuid)||!Number.isSafeInteger(value.version)||value.version<1)return null;
 return value;
}
function inspectionSummary(data:ChatResponse):Inspection{
 const status=data.status==='accepted'?'unknown':data.status;
 const items=Array.isArray(data?.itemTrace?.items)?data.itemTrace.items.slice(0,24):[];
 return {status,authenticationRejected:status==='unknown'&&data?.errorCode==='provider_http_401',usage:data?.usage?{input_tokens:diagnosticCount(data.usage.input_tokens),output_tokens:diagnosticCount(data.usage.output_tokens)}:null,technical:data?.itemTrace?{functionCalls:diagnosticCount(data.itemTrace.functionCalls),outputs:diagnosticCount(data.itemTrace.outputs),omittedItems:diagnosticCount(data.itemTrace.omittedItems),validSchemas:items.filter(item=>item?.type==='function_call'&&item.schemaValid===true).length,invalidSchemas:items.filter(item=>item?.type==='function_call'&&item.schemaValid===false).length,errorClasses:[...new Set(items.filter(item=>item?.type==='function_call_output').map(item=>['timeout','unavailable','other'].includes(item.errorClass ?? '')?item.errorClass:null).filter((value):value is string=>typeof value==='string'))]}:null};
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
  prepareImageVersion,
  loadReference,
  loadBase,
  initialMessage = "",
  connection,
}: { state:StudioState;getState:()=>StudioState;change:(update:(state:StudioState)=>StudioState)=>StudioState|null;flush:()=>Promise<unknown>;tools:RefObject<ReturnType<typeof createStudioTools>|null>;hasApiKey:boolean;getApiKey:()=>string;onUseImage:(image:ImageSelection)=>Promise<boolean>;prepareImageVersion?:(context:DraftContext)=>Promise<ActionResult>;loadReference:(id:string)=>Promise<StoredImage|null|undefined>;loadBase?:()=>Promise<StoredImage|null|undefined>;initialMessage?:string;connection?:ReactNode }) {
  const [message, setMessage] = useState(initialMessage),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [imageAction, setImageAction] = useState<ImageAction|null>(null),
    [pending, setPending] = useState<string|null>(null),
    [usage, setUsage] = useState<Usage|null>(null),
    [lastCompleted,setLastCompleted]=useState<string|null>(null),
    [inspecting,setInspecting]=useState(false),
    [inspection,setInspection]=useState<Inspection|null>(null);
  const [imageReceipt,setImageReceipt]=useState<ImageReceipt|null>(null);
  const mounted = useRef(true),
    previous = useRef<string|null>(null),
    timer = useRef<ReturnType<typeof setTimeout>|undefined>(undefined),
    request = useRef<AbortController|null>(null),
    actionCount = useRef(new Map<string,number>()),
    imageContext=useRef<ImageContext|null>(null),
    receiptRef=useRef<ImageReceipt|null>(null),
    activeMarker=useRef<string|null>(null),
    preparationSequence=useRef(0),
    inspectionLock=useRef(false),
    inspectionSequence=useRef(0);
  const marker = `compor-studio-chat:${state.userId}:${state.projectId}`;
  useEffect(() => {
    mounted.current = true;
    preparationSequence.current++;setImageAction(null);setBusy(false);
    activeMarker.current=marker;receiptRef.current=null;setImageReceipt(null);
    setLastCompleted(null);setInspection(null);setInspecting(false);inspectionLock.current=false;
    try {
      const parsed = chatMarkerSchema.safeParse(JSON.parse(sessionStorage.getItem(marker) ?? "null"));
      const value = parsed.success ? parsed.data : null;
      if (value && typeof value.requestId === "string")
        setPending(value.requestId);
      previous.current = value?.previousAttemptKey ?? null;
      setLastCompleted(uuid(value?.previousAttemptKey)?value.previousAttemptKey:null);
      imageContext.current=value?.imageContext??null;
      receiptRef.current=imageReceiptFor(value?.imageReceipt,state.userId,state.projectId);setImageReceipt(receiptRef.current);
    } catch {}
    return () => {
      mounted.current = false;
      activeMarker.current=null;
      preparationSequence.current++;
      inspectionSequence.current++;
      inspectionLock.current=false;
      clearTimeout(timer.current);
      request.current?.abort();
    };
  }, [marker]);
  function remember(requestId:string|null) {
    try {
      sessionStorage.setItem(
        marker,
        JSON.stringify({ requestId, previousAttemptKey: previous.current,...(requestId&&imageContext.current?{imageContext:imageContext.current}:{}),...(receiptRef.current?{imageReceipt:receiptRef.current}:{}) }),
      );
    } catch {
      throw Error("Não foi possível preservar a tentativa neste navegador.");
    }
  }
  async function api(path:string, body:Record<string,unknown>):Promise<ChatResponse> {
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
    const input:unknown = await response.json();
    const envelope = errorResponseSchema.parse(input);
    if (
      path === "/api/studio/chat" &&
      body.op !== "poll" &&
      [400, 401, 403, 404, 413].includes(response.status) &&
      [
        "invalid_request",
        "unauthorized",
        "invalid_origin",
        "not_found",
      ].includes(envelope.error ?? "")
    )
      return { status: "failed" };
    if (!response.ok && response.status !== 202 && envelope.status !== "failed")
      throw Error(
        envelope.error === "turn_in_progress"
          ? "Uma solicitação anterior ainda está em andamento."
          : "Não foi possível concluir a consulta. O resultado pode estar incerto.",
      );
    return chatResponseSchema.parse(input);
  }
  function settle(requestId:string, status:RequestStatus, result?:AdjustmentResult) {
    change((value) =>
      settleAdjustment(value, {
        requestId,
        status,
        ...(result ? { result, createdAt: new Date().toISOString() } : {}),
        eventId: crypto.randomUUID(),
      }),
    );
  }
  async function handle(data:ChatResponse, requestId:string, count = 0):Promise<void> {
    if (!mounted.current || activeMarker.current !== marker) return;
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
      const preparation = ++preparationSequence.current;
      const known=imageContext.current??getState().adjustments.find(item=>item.id===requestId)?.context;
      const target=known?getState().drafts.find(item=>item.pieceId===known.pieceId&&item.baseVersion===known.baseVersion):null;
      const context=known?{pieceId:known.pieceId,baseVersion:known.baseVersion,headline:target?.content.headline??""}:null;
      if (!context)
        throw Error("Não foi possível identificar o post desta proposta.");
      const proposal = parseImageProposal(data.proposal ?? {prompt: data.prompt});
      let artworkInput = null, inputError = '', canPrepareTransport = false, sourceFingerprint: string|null = null;
      try {
        const snapshot = getState(), selected = getCurrentDraft(snapshot);
        const source = snapshot.drafts.find(item => item.pieceId === context.pieceId && item.baseVersion === context.baseVersion);
        if (!source || (proposal.operation === 'edit' && (selected?.pieceId !== context.pieceId || selected?.baseVersion !== context.baseVersion))) throw Error('Abra a versão indicada para revisar as imagens desta proposta.');
        const prepared = await prepareArtworkTransport({proposal, draft: source, referenceIds: snapshot.references.map(item => item.id), loadReference, loadBase});
        artworkInput = prepared.artworkInput;
        sourceFingerprint = prepared.sourceFingerprint;
        if (getState().revision !== snapshot.revision) throw Error('O contexto mudou enquanto a proposta era preparada. Consulte a mesma proposta para revisar.');
      } catch (error) { artworkInput = null; inputError = errorMessage(error); canPrepareTransport = error instanceof ArtworkTransportRequiredError; }
      if (!mounted.current || activeMarker.current !== marker || preparationSequence.current !== preparation) return;
      setImageAction({ ...data, proposal, artworkInput, inputError, requestId, context, canPrepareTransport, sourceFingerprint, conversions: [] });
      setBusy(false);
      setNotice(inputError || "Revise a arte e os textos antes de gerar a nova versão.");
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
        const args = data.action.args;
        if(data.action.name==="compor_novo_post"&&result.pieceId)imageContext.current={pieceId:result.pieceId,baseVersion:0};
        else if(data.action.name==="compor_abrir_versao"){const parsed=parseStudioAction("compor_abrir_versao",args);imageContext.current={pieceId:parsed.pieceId,baseVersion:parsed.version};}
        else if(data.action.name==="compor_salvar_versao"&&result.pieceId&&result.version!==undefined)imageContext.current={pieceId:result.pieceId,baseVersion:result.version};
        else if(data.action.name==="compor_editar_peca"){const parsed=parseStudioAction("compor_editar_peca",args);imageContext.current={pieceId:parsed.pieceId,baseVersion:parsed.baseVersion};}
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
  async function poll(requestId:string, count = 0) {
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
        setNotice(errorMessage(e));
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
  async function send(event:FormEvent<HTMLFormElement>) {
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
      if(!selected)throw Error("Selecione um post antes de conversar.");
      const baseId=storedBase?selected?.pieceId:null;
      const visualReferences=[...before.references,...(baseId?[{id:baseId}]:[])];
      const referenceImages=await referenceImagesForRequest(visualReferences,async id=>id===baseId?storedBase:loadReference(id),21);
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
          direction: next.direction,
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
        setNotice(errorMessage(e));
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
        setNotice(errorMessage(error));
      }
    }
  }
  async function prepareImageCopies() {
    const action = imageAction, snapshot = getState(), draft = getCurrentDraft(snapshot);
    if (!action?.canPrepareTransport || busy) return;
    if (!draft || draft.pieceId !== action.context.pieceId || draft.baseVersion !== action.context.baseVersion) {
      setNotice('Abra a versão indicada antes de preparar as cópias.');
      return;
    }
    const preparation = ++preparationSequence.current;
    const isCurrentScope = () => mounted.current && activeMarker.current === marker && preparationSequence.current === preparation;
    const unchanged = () => {
      const current = getState(), selected = getCurrentDraft(current);
      return isCurrentScope() && current.userId === snapshot.userId && current.projectId === snapshot.projectId && current.revision === snapshot.revision && selected?.pieceId === draft.pieceId && selected?.baseVersion === draft.baseVersion;
    };
    const options = {proposal: action.proposal, draft, referenceIds: snapshot.references.map(item => item.id), loadReference, loadBase};
    setBusy(true);
    setNotice('Preparando cópias locais para envio…');
    try {
      const prepared = await prepareArtworkTransport(options, {allowConversion: true});
      if (!unchanged()) throw Error('O post ou suas imagens mudaram durante a preparação. Consulte a mesma proposta para revisar.');
      const currentFingerprint = await artworkSourceFingerprint(options);
      if (!unchanged() || currentFingerprint !== prepared.sourceFingerprint) throw Error('O post ou suas imagens mudaram durante a preparação. Consulte a mesma proposta para revisar.');
      setImageAction({...action, ...prepared, inputError: '', canPrepareTransport: false});
      setNotice('Cópias preparadas. Revise as alterações antes de confirmar a geração.');
    } catch (error) {
      if (isCurrentScope()) {
        setImageAction({...action, artworkInput: null, conversions: [], sourceFingerprint: null});
        setNotice(errorMessage(error));
      }
    } finally {
      if (isCurrentScope()) setBusy(false);
    }
  }
  async function confirmImage() {
    const action = imageAction,
      draft = getCurrentDraft(getState());
    if (
      !action ||
      !draft ||
      !action.artworkInput ||
      (typeof prepareImageVersion !== "function" && (draft.dirty || draft.baseVersion < 1)) ||
      draft.pieceId !== action.context.pieceId ||
      draft.baseVersion !== action.context.baseVersion ||
      (["headline", "price", "date"] satisfies (keyof typeof draft.content)[]).some(field => draft.content[field] !== action.artworkInput?.literalText[field])
    ) {
      setNotice("O post ou seus textos mudaram. Abra a versão indicada e consulte a mesma proposta para revisar antes de gerar.");
      return;
    }
    setBusy(true);
    const snapshot = getState();
    let imageAvailable=false,imageApplied=false;
    let target = {pieceId: draft.pieceId, version: draft.baseVersion};
    const isCurrentScope=()=>mounted.current&&activeMarker.current===marker;
    try {
      const fingerprint = await artworkSourceFingerprint({proposal: action.proposal, draft, referenceIds: snapshot.references.map(item => item.id), loadReference, loadBase});
      if (!isCurrentScope()) return;
      const current = getState(), selected = getCurrentDraft(current);
      if (current.revision !== snapshot.revision || selected?.pieceId !== draft.pieceId || selected?.baseVersion !== draft.baseVersion || fingerprint !== action.sourceFingerprint) {
        setImageAction({...action, artworkInput: null, conversions: [], sourceFingerprint: null, canPrepareTransport: false});
        throw Error('O post ou suas imagens mudaram. Consulte a mesma proposta para revisar antes de gerar.');
      }
      setImageAction(null);
      if (typeof prepareImageVersion === "function") {
        const saved = await prepareImageVersion({pieceId: draft.pieceId, baseVersion: draft.baseVersion, expectedLatestVersion: draft.expectedLatestVersion});
        if (!saved || saved.status !== "completed" || saved.pieceId !== draft.pieceId || typeof saved.version!=="number" || !Number.isSafeInteger(saved.version) || saved.version <= draft.baseVersion) throw Error("Não foi possível preparar a nova versão. Confira o histórico antes de tentar novamente.");
        target = {pieceId: saved.pieceId, version: saved.version};
        if (!isCurrentScope()) return;
      }
      if (action.artworkInput.source && target.version <= action.artworkInput.source.version) throw Error("Salve uma nova versão para preservar a imagem de origem antes de editar.");
      imageContext.current = {pieceId: target.pieceId, baseVersion: target.version};
      remember(action.requestId);
      const data = await api("/api/agent/image", {
        projectId: state.projectId,
        pieceId: target.pieceId,
        version: target.version,
        attemptId: action.attemptId,
        actionBinding: action.actionBinding,
        explicitApproval: true,
        artworkInput: action.artworkInput,
      });
      if (data.assetId) {
        if(!uuid(data.assetId))throw Error("A referência da imagem não pôde ser confirmada.");
        const { fetchPrivateImage } =
          await import("../lib/private-image-fetch.ts");
        const image = await fetchPrivateImage(
          new URLSearchParams({
            projectId: state.projectId,
            pieceId: target.pieceId,
            version: String(target.version),
            assetId: data.assetId,
          }),
        );
        imageAvailable=true;
        if(!isCurrentScope())return;
        if(typeof onUseImage!=='function'||await onUseImage({
            blob: image,
            pieceId: target.pieceId,
            version: target.version,
          })!==true)throw Error('image application unconfirmed');
        if(!isCurrentScope())return;
        imageApplied=true;
        receiptRef.current={userId:state.userId,projectId:state.projectId,requestId:action.requestId,pieceId:target.pieceId,version:target.version,assetId:data.assetId};
        setImageReceipt(receiptRef.current);
        remember(action.requestId);
      }
      if(isCurrentScope())await poll(action.requestId);
    } catch (e) {
      if (isCurrentScope()) {
        setBusy(false);
        setNotice(imageApplied?"A imagem foi adicionada à nova versão, mas não foi possível guardar sua confirmação neste navegador. Consulte a mesma tentativa.":imageAvailable?"A imagem foi gerada, mas não foi possível confirmar sua aplicação à nova versão. Consulte as imagens dessa versão para recuperá-la; não haverá nova geração automática.":errorMessage(e));
      }
    }
  }
  const currentDraft=getCurrentDraft(state);
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
        {imageReceipt&&imageReceiptFor(imageReceipt,state.userId,state.projectId)&&state.selection?.pieceId===imageReceipt.pieceId&&state.selection?.baseVersion===imageReceipt.version&&(
          <p role="status" className="studio-hint">Imagem gerada e adicionada a este post · versão {imageReceipt.version}.</p>
        )}
        {imageAction && (
          <div className="studio-image-consent">
            <h3>{imageAction.proposal.operation === "edit" ? "Editar a arte em uma nova versão" : "Gerar a arte completa"}</h3>
            <p>
              {imageAction.context.headline || "Post sem título"} · versão{" "}
              {imageAction.context.baseVersion || "ainda não salva"}
            </p>
            <p>{imageAction.prompt}</p>
            {imageAction.canPrepareTransport && <div>
              <p>Prepare cópias em JPEG neste navegador, sem IA nem envio. A qualidade será ajustada e as dimensões só serão reduzidas se necessário. Transparências recebem fundo branco. Os arquivos originais permanecem intactos.</p>
              <button type="button" disabled={busy} onClick={prepareImageCopies}>{imageAction.proposal.operation === 'edit' ? 'Preparar cópia para edição' : 'Preparar cópias para envio'}</button>
            </div>}
            {imageAction.conversions.length > 0 && <div>
              <ul aria-label="Cópias preparadas para envio">{imageAction.conversions.map(conversion => <li key={conversion.id}>
                {conversion.role === 'base' ? 'Imagem de origem' : 'Referência'}: {conversion.original.mime === 'image/png' ? 'PNG' : 'JPEG'} {conversion.original.width} × {conversion.original.height} ({Math.ceil(conversion.original.bytes / 1024)} KB) → JPEG {conversion.copy.width} × {conversion.copy.height} ({Math.ceil(conversion.copy.bytes / 1024)} KB). {conversion.original.width === conversion.copy.width && conversion.original.height === conversion.copy.height ? 'Dimensões preservadas.' : 'Dimensões reduzidas.'}
              </li>)}</ul>
              <p>Apenas essas cópias serão enviadas. Os arquivos originais permanecem intactos. Transparências recebem fundo branco.</p>
            </div>}
            {imageAction.artworkInput && <>
              <p>{imageAction.proposal.operation === "edit" ? "A imagem selecionada será enviada como origem. " : ""}{imageAction.proposal.referenceIds.length} referências visuais. Formato retrato 4:5.</p>
              <dl className="studio-artwork-texts">{Object.entries(imageAction.artworkInput.literalText).filter(([, value]) => value).map(([field, value]) => <div key={field}><dt>{field === "headline" ? "Título na arte" : field === "price" ? "Preço na arte" : "Data na arte"}</dt><dd>{value}</dd></div>)}</dl>
              <p>A arte inteira será gerada, incluindo esses textos. Confira grafia, fatos e legibilidade no resultado. A versão anterior permanece no histórico.</p>
            </>}
            <p>
              A geração será cobrada pela OpenAI. O custo final ainda é
              desconhecido.
            </p>
            <button
              type="button"
              className="studio-button"
              disabled={busy || !hasApiKey || !imageAction.artworkInput}
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
            </dl>{inspection.technical.errorClasses.map(code=><p key={code}>Ocorrência: {code==='timeout'?'tempo de espera excedido':code==='unavailable'?'ferramenta indisponível':'falha sem classificação'}.</p>)}</details>}
          </div>}
        </div>}
      </div>
      <form className="studio-chat-composer" onSubmit={send}>
        {connection}
        <div className="studio-chat-context">
          <strong>
            {currentDraft?.content.headline || "Post sem título"}
          </strong>
          <span>
            {" "}
            ·{" "}
            {currentDraft?.baseVersion
              ? `base: versão ${currentDraft.baseVersion}`
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
                    : `Elemento: ${mark.elementId}`}{" "}
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
