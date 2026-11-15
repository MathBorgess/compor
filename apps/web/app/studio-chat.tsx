"use client";
import {conversationContext,postContext} from '../lib/studio-post-context';
import { useEffect, useRef, useState, type RefObject, type ReactNode, type FormEvent } from "react";
import {conversationMessages} from '../lib/studio-workflow';
import {useConversationDraft} from './use-conversation-draft';
import Markdown from "markdown-to-jsx";
import {
  prepareAdjustment,
  settleAdjustment,
  resolveProjectTitle,
  REFERENCE_SELECTION_EVENT,
} from "../lib/studio-state.ts";
import { parseImageProposal, type ImageProposal } from "@compor/agents-api/image-proposal";
import { prepareArtworkTransport, artworkSourceFingerprint, ArtworkTransportRequiredError } from "../lib/studio-artwork-input.ts";
import { sameCreativeFields } from "../lib/studio-state.ts";
import { loadReadinessFeedback } from '../lib/studio-readiness.ts';
import { canStartReferenceRound, ensureReferenceRound, readReferenceRound, referenceFingerprint, referenceRoundKey } from '../lib/studio-reference-round.ts';
import { assessReadiness } from '@compor/agile-deliberation/readiness';
import { referenceImagesForRequest } from "../lib/studio-reference-images.ts";
import { submitOnEnter } from "../lib/submit-on-enter.ts";
import {offerContext} from '../lib/studio-context.ts';
import type {StudioContext} from '@compor/agents-api/studio-chat';
import { imageRejectedBeforeDispatch,recordImageNotDispatched } from '../lib/image-dispatch-state.ts';

import { parseStudioAction } from '@compor/agents-api/studio-chat-tools';
import type { StudioState, AdjustmentResult, RequestStatus, DraftContext, StoredImage, ActionResult } from '../lib/studio-domain';
import { createStudioTools } from '../lib/studio-tools';
import { uuid, errorMessage, type ImageSelection } from './studio-ui-types';
import { parseTasteReply, quickReplyKey, readQuickReplies, rememberQuickReply, recordQuickReplyAnswer, quickReplyStatus, quickReplyMessage, QUICK_REPLY_ADJUST_PREFIX, type QuickReplyEntry, type QuickReplyOption } from '../lib/studio-quick-replies.ts';
import TasteReadingCard from './studio-taste-reading';
import { chatResponseSchema, errorResponseSchema, defaultCredentialNotSubmittedSchema, chatMarkerSchema, receiptSchema, type ChatResponse, type ImageAction, type ImageContext, type ImageReceipt, type Usage, type Inspection } from './studio-chat-contract';
const getCurrentDraft=(state:StudioState)=>state.drafts.find(item=>item.pieceId===state.selection?.pieceId&&item.baseVersion===state.selection.baseVersion)??null;
const diagnosticCount=(value:unknown)=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0&&value<=100000000?value:null;
const referenceContext = (state:StudioState) => JSON.stringify({postContext:state.selection?postContext(state,state.selection.pieceId):undefined,brief:state.brief,persona:state.persona,...offerContext(state),direction:state.direction,selection:state.selection,draft:getCurrentDraft(state),marks:state.marks,references:state.references});
async function contextDigest(state:StudioState) {
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(referenceContext(state)));
 return Array.from(new Uint8Array(bytes),value=>value.toString(16).padStart(2,'0')).join('');
}
const openAIAuthenticationNotice='A OpenAI recusou a autenticação desta chave. Confira sua chave para consultar a solicitação anterior.';
type CredentialSource='default'|'byok';
const sourceNotice=(source:CredentialSource)=>source==='default'?'Esta tentativa começou com a IA do Compor. Volte a essa opção para consultá-la; ela não será reenviada.':'Esta tentativa começou com sua chave OpenAI. Reconecte a chave original para consultá-la; ela não será reenviada.';
/** Assistant text is Markdown without raw HTML; links open safely and images become their alt text. */
function MessageMarkdown({text}:{text:string}) {
  return <Markdown
    options={{
      disableParsingRawHTML: true,
      sanitizer: (value) => {
        try {
          const url = new URL(value);
          return ['https:', 'http:', 'mailto:'].includes(url.protocol) ? url.href : null;
        } catch { return null; }
      },
      overrides: {
        a: ({href, children}: {href?: string; children?: ReactNode}) => href ? <a href={href} target="_blank" rel="noopener noreferrer">{children}</a> : <>{children}</>,
        img: ({alt}: {alt?: string}) => <span>{alt}</span>,
      },
    }}
  >{text}</Markdown>;
}
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
  state:sourceState,
  projectRevision,
  getState:readState,
  change:writeState,
  flush,
  tools,
  hasApiKey,
  getApiKey,
  credentialSource = 'byok',
  credentialEpoch = 0,
  canUseAI = hasApiKey,
  onUseAI,
  onUseImage,
  prepareImageVersion,
  loadReference,
  loadBase,
  initialMessage = "",
  messageDraft,
  onMessageDraftChange,
  connection,
  explorationRecovery,
  developerMode:requestedDeveloperMode = false,
  conversationId,
  readOnly = false,
  allowReferenceAnalysis = true,
  intro = false,
}: { state:StudioState;projectRevision?:number;getState:()=>StudioState;change:(update:(state:StudioState)=>StudioState)=>StudioState|null;flush:()=>Promise<unknown>;tools:RefObject<ReturnType<typeof createStudioTools>|null>;hasApiKey:boolean;getApiKey:()=>string;credentialSource?:CredentialSource;credentialEpoch?:number;canUseAI?:boolean;onUseAI?:()=>void;onUseImage:(image:ImageSelection)=>Promise<boolean>;prepareImageVersion?:(context:DraftContext&Pick<ImageProposal,'operation'|'changedDimension'>)=>Promise<ActionResult>;loadReference:(id:string)=>Promise<StoredImage|null|undefined>;loadBase?:()=>Promise<StoredImage|null|undefined>;initialMessage?:string;messageDraft?:string;onMessageDraftChange?:(value:string)=>void;connection?:ReactNode;explorationRecovery?:ReactNode;developerMode?:boolean;conversationId?:string;readOnly?:boolean;allowReferenceAnalysis?:boolean;intro?:boolean }) {
  const developerMode=process.env.NODE_ENV==='development'&&requestedDeveloperMode;
  const state=conversationContext(sourceState,conversationId);
  const getState=()=>conversationContext(readState(),conversationId);
  const change=(reducer:(value:StudioState)=>StudioState)=>{const next=writeState(reducer);return next?conversationContext(next,conversationId):null;};
  const ownedDraft=useConversationDraft(state.userId,state.projectId,conversationId??'legacy');
  const composerId=conversationId?`studio-chat-message-${conversationId}`:'studio-chat-message';
  const detailsId=conversationId?`studio-chat-details-${conversationId}`:'studio-chat-details';
  const restoredDraft=messageDraft??(conversationId?ownedDraft.value:undefined);
  const [message, setMessageState] = useState(restoredDraft ?? initialMessage),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [imageAction, setImageAction] = useState<ImageAction|null>(null),
    [pending, setPending] = useState<string|null>(null),
    [usage, setUsage] = useState<Usage|null>(null),
    [lastCompleted,setLastCompleted]=useState<string|null>(null),
    [inspecting,setInspecting]=useState(false),
    [inspection,setInspection]=useState<Inspection|null>(null);
  useEffect(()=>{if(restoredDraft!==undefined&&!busy&&!pending)setMessageState(restoredDraft);},[restoredDraft]);
  function setMessage(value:string){setMessageState(value);if(onMessageDraftChange)onMessageDraftChange(value);else if(conversationId)ownedDraft.setValue(value);}
  const [imageReceipt,setImageReceipt]=useState<ImageReceipt|null>(null);
  const [detailsVisible,setDetailsVisible]=useState(true);
  const [imageNeedsReconciliation,setImageNeedsReconciliation]=useState(false);
  const [imageNeedsDecision,setImageNeedsDecision]=useState(false);
  const [closedImageAttempt,setClosedImageAttempt]=useState<string|null>(null);
  const [roundRevision,setRoundRevision]=useState(0);
  const [pendingSource,setPendingSource]=useState<CredentialSource|null>(null);
  const [quickReplies,setQuickReplies]=useState<QuickReplyEntry[]>([]);
  const [currentContext,setCurrentContext]=useState<{value:string;digest:string}|null>(null);
  const attemptSource=useRef<CredentialSource>(credentialSource);
  const previousScope=useRef<{marker:string;source:CredentialSource;epoch:number}|null>(null);
  const mounted = useRef(true),
    messagesRef = useRef<HTMLDivElement>(null),
    followMessages = useRef(true),
    previous = useRef<string|null>(null),
    timer = useRef<ReturnType<typeof setTimeout>|undefined>(undefined),
    request = useRef<AbortController|null>(null),
    actionCount = useRef(new Map<string,number>()),
    imageContext=useRef<ImageContext|null>(null),
    receiptRef=useRef<ImageReceipt|null>(null),
    activeMarker=useRef<string|null>(null),
    preparationSequence=useRef(0),
    legacyPending=useRef(false),
    inspectionLock=useRef(false),
    inspectionSequence=useRef(0),
    failedAutomatic=useRef<string|null>(null),
    // Synchronous guard shared by the composer and quick replies: a double click
    // or a click followed by Enter cannot start a second submission.
    submitLock=useRef(false),
    composerRef=useRef<HTMLTextAreaElement>(null),
    focusAnswer=useRef<string|null>(null);
  const marker = `compor-studio-chat:${state.userId}:${state.projectId}${conversationId?":conversation:"+conversationId:""}`;
  const scopeMarker=`${marker}:${credentialSource}:${credentialEpoch}`;
  const currentScope=useRef(scopeMarker);
  currentScope.current=scopeMarker;
  const credentialIsCurrent=()=>mounted.current&&activeMarker.current===scopeMarker&&currentScope.current===scopeMarker;
  const sourceMismatch=Boolean(pending&&pendingSource&&pendingSource!==credentialSource);
  const authenticationNotice=credentialSource==='default'?'A IA do Compor está indisponível. Você pode usar sua chave OpenAI ou continuar editando.':openAIAuthenticationNotice;
  const referenceMarker = `compor-reference-review:${state.userId}:${state.projectId}${conversationId?":"+conversationId:""}`;
  const availability=useRef({message,busy,pending,hasApiKey});
  availability.current={message,busy,pending,hasApiKey};
  const referenceSet=referenceFingerprint(state), referenceContextValue=referenceContext(state);
  const quickReplyStorage=quickReplyKey(state.userId,state.projectId,conversationId);
  function refreshQuickReplies(){try{setQuickReplies(readQuickReplies(localStorage,quickReplyStorage));}catch{setQuickReplies([]);}}
  useEffect(()=>{
    refreshQuickReplies();
    const stored=(event:StorageEvent)=>{if(event.storageArea===localStorage&&event.key===quickReplyStorage)refreshQuickReplies();};
    window.addEventListener('storage',stored);
    return ()=>window.removeEventListener('storage',stored);
  },[quickReplyStorage]);
  useEffect(()=>{
    let active=true;
    void contextDigest(state).then(digest=>{if(active)setCurrentContext({value:referenceContextValue,digest});}).catch(()=>{if(active)setCurrentContext(null);});
    return ()=>{active=false;};
  },[referenceContextValue]);
  useEffect(()=>{
    const id=focusAnswer.current;if(!id)return;
    const target=document.getElementById(`studio-quick-reply-status-${id}`);
    if(target){focusAnswer.current=null;target.focus();}
  },[quickReplies,state.messages]);
  function referenceRecord() {
    try {
      const raw=localStorage.getItem(referenceMarker);
      if(raw===null)return undefined;
      const value:unknown=JSON.parse(raw);
      if (!value || typeof value!=='object' || !('fingerprint' in value) || !('requestId' in value) || !('context' in value) || !('status' in value)) return null;
      if (typeof value.fingerprint!=='string'||typeof value.context!=='string'||!uuid(value.requestId)||!['submitted','completed'].includes(String(value.status))) return null;
      const epoch='epoch' in value&&typeof value.epoch==='string'?value.epoch:'initial';
      if('credentialSource' in value&&value.credentialSource!=='default'&&value.credentialSource!=='byok')return null;
      return {fingerprint:value.fingerprint,context:value.context,requestId:value.requestId,status:value.status,epoch,credentialSource:'credentialSource' in value&&value.credentialSource==='default'?'default' as const:'byok' as const};
    } catch { return null; }
  }
  function completeReferenceRecord(requestId:string) {
    const value=referenceRecord();
    if(value?.requestId===requestId) localStorage.setItem(referenceMarker,JSON.stringify({...value,status:'completed'}));
  }
  function automaticRequest(requestId:string) {
    const snapshot=getState();
    const operation=snapshot.adjustments.find(item=>item.id===requestId);
    return Boolean(operation&&snapshot.messages.some(item=>item.id===operation.messageId&&item.role==='system'));
  }
  useEffect(() => {
    const messages = messagesRef.current;
    if (messages && followMessages.current) messages.scrollTop = messages.scrollHeight;
  }, [state.messages, notice, imageAction, pending, explorationRecovery]);
  useEffect(() => {
    if (!busy || !messagesRef.current) return;
    followMessages.current = true;
    messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
  }, [busy]);
  const imageSubmissionMarker = `compor-image-submission:${state.userId}`;
  const imageRejectedMarker = `compor-image-not-dispatched:${state.userId}:${state.projectId}`;
  useEffect(() => {
    mounted.current = true;
    const changed=previousScope.current?.marker===marker&&(previousScope.current.source!==credentialSource||previousScope.current.epoch!==credentialEpoch);
    previousScope.current={marker,source:credentialSource,epoch:credentialEpoch};
    preparationSequence.current++;setImageAction(null);setBusy(false);setImageNeedsReconciliation(false);setImageNeedsDecision(false);
    activeMarker.current=scopeMarker;receiptRef.current=null;setImageReceipt(null);setPending(null);setPendingSource(null);
    setLastCompleted(null);setInspection(null);setInspecting(false);inspectionLock.current=false;
    actionCount.current.clear();
    try {
      const submitted=localStorage.getItem(imageSubmissionMarker);
      setClosedImageAttempt(uuid(submitted)?submitted:null);
      const parsed = chatMarkerSchema.safeParse(JSON.parse(sessionStorage.getItem(marker) ?? "null"));
      const value = parsed.success ? parsed.data : null;
      const originalSource=value?.credentialSource??'byok';
      attemptSource.current=value?.requestId?originalSource:credentialSource;
      legacyPending.current=Boolean(value?.requestId && value.imageProtocolVersion !== 1);
      if (value && typeof value.requestId === "string") {
        setPending(value.requestId);
        setPendingSource(originalSource);
        if(originalSource!==credentialSource)setNotice(sourceNotice(originalSource));
        else if(changed)setNotice('A fonte da IA mudou. Consulte a tentativa anterior antes de continuar.');
      } else if(changed)setNotice('A fonte da IA mudou. Seu trabalho foi preservado; novas ações começarão outra conversa com a IA.');
      previous.current = !changed&&originalSource===credentialSource?value?.previousAttemptKey??null:null;
      setLastCompleted(uuid(previous.current)?previous.current:null);
      imageContext.current=value?.imageContext??null;
      receiptRef.current=imageReceiptFor(value?.imageReceipt,state.userId,state.projectId);setImageReceipt(receiptRef.current);
      if(changed||originalSource!==credentialSource)remember(value?.requestId??null);
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
  }, [marker,credentialSource,credentialEpoch]);
  function remember(requestId:string|null) {
    try {
      sessionStorage.setItem(
        marker,
        JSON.stringify({ requestId, previousAttemptKey: previous.current,credentialSource:attemptSource.current,imageProtocolVersion:1,...(requestId&&imageContext.current?{imageContext:imageContext.current}:{}),...(receiptRef.current?{imageReceipt:receiptRef.current}:{}) }),
      );
    } catch {
      throw Error("Não foi possível preservar a tentativa neste navegador.");
    }
  }
  useEffect(()=>{
    if(pending)return;
    const record=referenceRecord();
    if(record?.status!=='submitted')return;
    const operation=state.adjustments.find(item=>item.id===record.requestId);
    if(!operation||['completed','failed'].includes(operation.status)||!state.messages.some(item=>item.id===operation.messageId&&item.role==='system'))return;
    try { attemptSource.current=record.credentialSource;remember(record.requestId);setPending(record.requestId);setPendingSource(record.credentialSource);setNotice(record.credentialSource!==credentialSource?sourceNotice(record.credentialSource):'Uma conversa anterior ainda precisa ser consultada.'); } catch { setNotice('Não foi possível recuperar a tentativa neste navegador.'); }
  },[marker,pending,state.adjustments,state.messages]);
  useEffect(()=>{
    try{ensureReferenceRound(state);}catch{}
    const key=referenceRoundKey(state);
    const changed=(event:Event)=>{if(event instanceof CustomEvent&&event.detail===key)setRoundRevision(value=>value+1);};
    const stored=(event:StorageEvent)=>{if(event.storageArea===localStorage&&event.key===key)setRoundRevision(value=>value+1);};
    window.addEventListener('compor-reference-round-changed',changed);
    window.addEventListener('storage',stored);
    return ()=>{window.removeEventListener('compor-reference-round-changed',changed);window.removeEventListener('storage',stored);};
  },[marker]);
  async function api(path:string, body:Record<string,unknown>):Promise<ChatResponse> {
    if(!credentialIsCurrent())throw Error('A fonte da IA mudou. A tentativa anterior foi preservada.');
    if(!canUseAI)throw Error('A IA está indisponível. Você pode continuar editando.');
    if(pending&&attemptSource.current!==credentialSource)throw Error(sourceNotice(attemptSource.current));
    const key = getApiKey?.();
    if (credentialSource==='byok'&&!key) throw Error("Conecte sua chave OpenAI para continuar.");
    const controller = new AbortController();
    request.current = controller;
    const response = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...body, ...(conversationId&&path.startsWith("/api/studio/")?{conversationId}:{}), ...(credentialSource==='byok'?{apiKey:key}:{}) }),
      signal: controller.signal,
    });
    if(!credentialIsCurrent())throw Error('A fonte da IA mudou. A tentativa anterior foi preservada.');
    const input:unknown = await response.json();
    if(!credentialIsCurrent())throw Error('A fonte da IA mudou. A tentativa anterior foi preservada.');
    const envelope = errorResponseSchema.parse(input);
    if(response.status===503&&envelope.error==='default_credential_unavailable'){
      const fresh=path==='/api/studio/chat'&&(body.op===undefined||body.op==='submit'||body.op==='reference_selection');
      const proof=defaultCredentialNotSubmittedSchema.safeParse(input);
      if(credentialSource==='default'&&fresh&&proof.success&&proof.data.requestId===body.requestId)return proof.data;
      throw Error('A IA do Compor está indisponível. A tentativa anterior continua preservada para consulta.');
    }
    if (path === "/api/agent/image" && imageRejectedBeforeDispatch(response.status,envelope.error))
      return {status:"failed",error:"image_invalid_request"};
    if (path === "/api/agent/image" && response.ok && (envelope.status === "busy" || envelope.status === "blocked"))
      return {status:"failed",error:`image_${envelope.status}`};
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
    if (!mounted.current || !credentialIsCurrent()) return;
    if (readOnly && (data.status === 'action_required' || data.status === 'consent_required')) {
      setBusy(false);
      setNotice('Este pedido pertence ao histórico anterior. Seus dados foram preservados; consulte o resultado antes de fazer um novo pedido na conversa do post.');
      return;
    }
    const automatic=automaticRequest(requestId);
    if(automatic&&(data.status==='consent_required'||data.status==='action_required')) {
      setBusy(false);setNotice('A resposta precisa ser consultada antes de continuar.');return;
    }
    if (data.status === "completed") {
      const record=automatic?referenceRecord():null;
      const current=automatic?getState():null;
      const valid=!automatic||Boolean(record&&current&&record.requestId===requestId&&record.fingerprint===referenceFingerprint(current)&&record.epoch===readReferenceRound(current)?.epoch&&record.context===await contextDigest(current));
      if(!credentialIsCurrent())return;
      setUsage(data.usage ?? null);
      if(valid) {
        const messageId=crypto.randomUUID(),reply=automatic&&record?parseTasteReply(data.reply):null;
        // Invalid or absent structure keeps the textual reply, which is always stored.
        if(reply&&record) { try { rememberQuickReply(localStorage,quickReplyStorage,{messageId,requestId,fingerprint:record.fingerprint,context:record.context,epoch:record.epoch,reply,answer:null}); } catch {} }
        settle(requestId, "completed", {
          messageId,
          text: data.text ?? "Operação concluída.",
        });
        if(reply)refreshQuickReplies();
      }
      else settle(requestId,"completed");
      if(automatic) { try { if(valid) completeReferenceRecord(requestId); else localStorage.removeItem(referenceMarker); } catch {} previous.current=null; }
      else previous.current = requestId;
      try {
        if (receiptRef.current?.requestId === requestId && localStorage.getItem(imageSubmissionMarker) === requestId) localStorage.removeItem(imageSubmissionMarker);
        if (localStorage.getItem(imageRejectedMarker) === requestId) localStorage.removeItem(imageRejectedMarker);
        const submitted=localStorage.getItem(imageSubmissionMarker);
        setClosedImageAttempt(uuid(submitted)?submitted:null);
      } catch { /* A stale marker safely prevents automatic resubmission. */ }
      setImageNeedsReconciliation(false);setImageNeedsDecision(false);
      setLastCompleted(requestId);
      remember(null);
      setPending(null);
      setPendingSource(null);
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
      if (!mounted.current || !credentialIsCurrent() || preparationSequence.current !== preparation) return;
      const action = { ...data, proposal, artworkInput, inputError, requestId, context, canPrepareTransport, sourceFingerprint, conversions: [] };
      setImageAction(action);
      try {
        if (localStorage.getItem(imageRejectedMarker) === requestId) {
          setImageNeedsReconciliation(false);setImageNeedsDecision(true);setBusy(false);
          setNotice('A imagem não foi enviada. Recuse esta proposta antes de pedir outra geração.');
          return;
        }
        const submitted=localStorage.getItem(imageSubmissionMarker);
        if (submitted) {
          setBusy(false);
          if (submitted === requestId) { setImageNeedsReconciliation(true);setImageNeedsDecision(false);setNotice('Esta tentativa precisa ser verificada antes de continuar.'); }
          else { setImageAction(null);setNotice('Uma geração anterior ainda precisa ser consultada. Não iniciaremos outra automaticamente.'); }
          return;
        }
      } catch {setBusy(false);setNotice('Não foi possível preservar o estado da geração neste navegador.');return;}
      setImageNeedsReconciliation(false);setImageNeedsDecision(false);
      if (artworkInput) {
        if(!availability.current.hasApiKey){setBusy(false);setNotice('Comece a criar com IA para continuar esta proposta. Nenhuma imagem foi enviada.');return;}
        if (legacyPending.current) {
          setImageAction(null);
          setBusy(false);
          setNotice("Esta tentativa começou antes da proteção de reenvio. Consulte seus resultados antes de iniciar outra geração.");
          return;
        }
        await confirmImage(action);
      } else {
        setBusy(false);
        setNotice(inputError);
      }
      return;
    }
    if (data.status === "action_required") {
      if(!availability.current.hasApiKey){setBusy(false);setNotice('Comece a criar com IA para continuar esta solicitação. Nenhuma nova ação foi executada.');return;}
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
        {signal:request.current?.signal,conversationId},
      );
      if(!credentialIsCurrent())return;
      if(data.action.name==='compor_renomear_projeto')change(resolveProjectTitle);
      await flush();
      if(!credentialIsCurrent())return;
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
      setNotice("");
      timer.current = setTimeout(() => poll(requestId, count + 1), 2000);
      return;
    }
    if (data.status === "failed") {
      if(automatic) { try { completeReferenceRecord(requestId); } catch {} }
      settle(requestId, "failed");
      if(data.failurePhase!=='before_submission')previous.current=null;
      setPending(null);
      setPendingSource(null);
      remember(null);
      setBusy(false);
      setNotice(
        data.error==='default_credential_unavailable'&&data.failurePhase==='before_submission'&&data.requestId===requestId
          ? 'A IA do Compor está indisponível. Você pode usar sua chave OpenAI ou continuar editando.'
          : data.error === "project_busy" &&
          data.failurePhase === "before_submission" &&
          data.requestId === requestId
          ? "Este pedido não foi enviado à OpenAI porque outro pedido deste projeto ainda precisa ser consultado. Seu trabalho foi preservado."
          : "A solicitação terminou com falha. Seu trabalho foi preservado.",
      );
      return;
    }
    if(data.status==='unknown'&&data.errorCode==='provider_http_401'){
      setBusy(false);setNotice(credentialSource==='default'?'Não foi possível confirmar o resultado desta solicitação. Consulte seu estado antes de iniciar outra. Você pode continuar editando.':authenticationNotice);return;
    }
    setBusy(false);
    setNotice(
      "O resultado ainda não foi confirmado. Consulte a mesma tentativa antes de enviar outro pedido.",
    );
  }
  async function poll(requestId:string, count = 0) {
    if (!credentialIsCurrent()||!canUseAI) return;
    if(attemptSource.current!==credentialSource){setNotice(sourceNotice(attemptSource.current));return;}
    setBusy(true);
    try {
      const data = await api("/api/studio/chat", {
        op: "poll",
        projectId: state.projectId,
        requestId,
      });
      await handle(data, requestId, count);
    } catch (e) {
      if (credentialIsCurrent()) {
        setBusy(false);
        setNotice(errorMessage(e));
      }
    }
  }
  async function inspectLastCompleted(){
    if(!credentialIsCurrent()||pending||busy||inspectionLock.current||!uuid(lastCompleted)||!canUseAI)return;
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
  useEffect(()=>{
    if(readOnly||!allowReferenceAnalysis||!hasApiKey||busy||pending||message.trim()||referenceSet==='[]'||!navigator.locks) return;
    const timeout=setTimeout(()=>{ void navigator.locks.request(referenceMarker,{ifAvailable:true},async lock=>{
      if(!lock||!mounted.current||!credentialIsCurrent())return;
      const available=availability.current;
      if(!available.hasApiKey||available.busy||available.pending||available.message.trim()||inspectionLock.current)return;
      const before=getState();
      if(referenceFingerprint(before)!==referenceSet||referenceContext(before)!==referenceContextValue||!before.references.length||!getCurrentDraft(before)||before.adjustments.some(item=>!['completed','failed'].includes(item.status)))return;
      const existing=referenceRecord(),round=readReferenceRound(before);
      if(existing===null||!round||round.fingerprint!==referenceSet||existing?.status==='submitted')return;
      let prepared=false,submitted=false;
      const identity=`${round.epoch}:${referenceContextValue}`;
      const requestId=crypto.randomUUID();
      availability.current.busy=true;setBusy(true);setNotice('');
      try {
        const digest=await contextDigest(before);
        if(!canStartReferenceRound({record:existing,round,fingerprint:referenceSet,context:digest,failed:failedAutomatic.current===identity}))return;
        const feedback=await loadReadinessFeedback(before.projectId,before.references,fetch,conversationId==='references'?undefined:conversationId);
        const readiness=assessReadiness({brief:before.brief,persona:before.persona,direction:before.direction,references:before.references,referenceFeedback:feedback.referenceFeedback});
        if(!mounted.current||!credentialIsCurrent()||!availability.current.hasApiKey||availability.current.message.trim()||getState().revision!==before.revision||referenceFingerprint(getState())!==referenceSet||readReferenceRound(getState())?.epoch!==round.epoch)return;
        const referenceImages=await referenceImagesForRequest(before.references,loadReference,20);
        if(!mounted.current||!credentialIsCurrent()||!availability.current.hasApiKey||availability.current.message.trim()||getState().revision!==before.revision||referenceFingerprint(getState())!==referenceSet||readReferenceRound(getState())?.epoch!==round.epoch)return;
        attemptSource.current=credentialSource;
        const next=change(value=>prepareAdjustment(value,{requestId,messageId:crypto.randomUUID(),instruction:REFERENCE_SELECTION_EVENT,origin:'system',conversationId,createdAt:new Date().toISOString(),eventId:crypto.randomUUID()}));
        if(!next)throw Error('O projeto ainda está carregando.');
        prepared=true;
        await flush();
        if(!mounted.current||!credentialIsCurrent()||!availability.current.hasApiKey||availability.current.message.trim()||referenceFingerprint(getState())!==referenceSet||readReferenceRound(getState())?.epoch!==round.epoch||await contextDigest(getState())!==digest) {
          settle(requestId,'failed');prepared=false;return;
        }
        localStorage.setItem(referenceMarker,JSON.stringify({fingerprint:referenceSet,context:digest,requestId,status:'submitted',epoch:round.epoch,credentialSource}));
        remember(requestId);setPending(requestId);setPendingSource(credentialSource);availability.current.pending=requestId;
        const draft=getCurrentDraft(next);
        const context={revision:next.revision,pieceId:draft?.pieceId??null,baseVersion:draft?.baseVersion??0,expectedLatestVersion:draft?.expectedLatestVersion??0,content:draft?.content??null,approval:draft?.approval??null,baseImageId:null,brief:next.brief,persona:next.persona,...offerContext(next),...(conversationId&&conversationId!=='references'?{postContext:postContext(next,conversationId)}:{}),direction:next.direction,readiness,referenceFeedback:feedback.referenceFeedback,accountReferenceHints:feedback.accountHints,feedbackAvailability:feedback.availability,marks:next.marks.filter(mark=>mark.pieceId===draft?.pieceId&&mark.baseVersion===draft?.baseVersion),references:next.references} satisfies StudioContext;
        submitted=true;
        const data=await api('/api/studio/chat',{op:'reference_selection',projectId:state.projectId,requestId,context,history:conversationMessages(before,conversationId).filter(item=>item.role!=='system').slice(-30).map(({role,text})=>({role,text})),referenceImages});
        await handle(data,requestId);
      } catch(error) {
        if(credentialIsCurrent()){
          if(!submitted)failedAutomatic.current=identity;
          if(prepared&&!submitted){settle(requestId,'failed');try{completeReferenceRecord(requestId);remember(null);}catch{}setPending(null);}
          setNotice(errorMessage(error));setBusy(false);
        }
      } finally { if(!submitted&&credentialIsCurrent()){availability.current.busy=false;setBusy(false);} }
    });},5000);
    return ()=>clearTimeout(timeout);
  },[referenceSet,referenceContextValue,roundRevision,hasApiKey,busy,pending,message,marker,credentialSource,credentialEpoch]);
  async function send(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submitText(message,{fromComposer:true});
  }
  type SubmitOptions={fromComposer:boolean;quickReply?:{version:1;intent:'agree'|'prefer'};onPrepared?:(userMessageId:string)=>void};
  /** The composer and quick replies share this path. A quick reply never sends or clears the draft. */
  async function submitText(text:string,{fromComposer,quickReply,onPrepared}:SubmitOptions) {
    if (readOnly || !text.trim() || !canUseAI || busy || pending || submitLock.current || availability.current.busy || availability.current.pending || inspectionLock.current||!credentialIsCurrent()) return false;
    submitLock.current=true;
    try { return await submitLocked(text,{fromComposer,quickReply,onPrepared}); }
    finally { submitLock.current=false; }
  }
  async function submitLocked(text:string,{fromComposer,quickReply,onPrepared}:SubmitOptions) {
    onUseAI?.();
    setNotice("");
    setBusy(true);
    legacyPending.current=false;
    const requestId = crypto.randomUUID(), userMessageId = crypto.randomUUID();
    let prepared = false,
      submitted = false;
    try {
      const before = getState();
      const selected=getCurrentDraft(before), storedBase=await loadBase?.();
      if(!credentialIsCurrent())return;
      if(!selected)throw Error("Selecione um post antes de conversar.");
      const feedback=before.references.length?await loadReadinessFeedback(before.projectId,before.references,fetch,conversationId==='references'?undefined:conversationId):{referenceFeedback:[],accountHints:[],availability:'available'};
      const baseId=storedBase?selected?.pieceId:null;
      const visualReferences=[...before.references,...(baseId?[{id:baseId}]:[])];
      const referenceImages=await referenceImagesForRequest(visualReferences,async id=>id===baseId?storedBase:loadReference(id),21);
      if(!credentialIsCurrent())return;
      if (getState().revision !== before.revision)
        throw Error(
          "O contexto mudou enquanto as referências eram preparadas. Revise e envie novamente.",
        );
      attemptSource.current=credentialSource;
      const next = change((value) =>
        prepareAdjustment(value, {
          requestId,
          messageId: userMessageId,
          instruction: text,
          conversationId,
          createdAt: new Date().toISOString(),
          eventId: crypto.randomUUID(),
        }),
      );
      if (!next) throw Error("O projeto ainda está carregando.");
      prepared = true;
      onPrepared?.(userMessageId);
      imageContext.current={pieceId:selected.pieceId,baseVersion:selected.baseVersion};
      await flush();
      if(!credentialIsCurrent()){settle(requestId,'failed');return;}
      remember(requestId);
      setPending(requestId);
      setPendingSource(credentialSource);
      setBusy(true);
      if(fromComposer)setMessage("");
      const draft = getCurrentDraft(next),
        {level, evidence, gaps, limitations} = assessReadiness({brief:next.brief,persona:next.persona,direction:next.direction,references:next.references,referenceFeedback:feedback.referenceFeedback}),
        context = {
          revision: next.revision,
          pieceId: draft?.pieceId ?? null,
          baseVersion: draft?.baseVersion ?? 0,
          expectedLatestVersion: draft?.expectedLatestVersion ?? 0,
          content: draft?.content ?? null,
          approval: draft?.approval ?? null,
          baseImageId: baseId,
          brief: next.brief,
          ...offerContext(next),...(conversationId&&conversationId!=='references'?{postContext:postContext(next,conversationId)}:{}),
          persona: next.persona,
          direction: next.direction,
          readiness: {level, evidence, gaps, limitations},
          referenceFeedback: feedback.referenceFeedback,
          accountReferenceHints: feedback.accountHints,
          feedbackAvailability: feedback.availability,
          marks: next.marks.filter(
            (mark) =>
              mark.pieceId === draft?.pieceId &&
              mark.baseVersion === draft?.baseVersion,
          ),
          references: next.references,
          projectTitleProvisional: next.projectTitleProvisional && projectRevision===1,
        } satisfies StudioContext;
      submitted = true;
      const data = await api("/api/studio/chat", {
        projectId: state.projectId,
        requestId,
        message: text.trim(),
        context,
        history: conversationMessages(before,conversationId)
          .filter(item=>item.role!=='system')
          .slice(-30)
          .map(({ role, text }) => ({ role, text })),
        referenceImages,
        // A quick reply starts a text-only turn; it never resumes a tool-enabled session.
        ...(quickReply ? { quickReply } : previous.current ? { previousAttemptKey: previous.current } : {}),
      });
      await handle(data, requestId);
      return true;
    } catch (e) {
      if (credentialIsCurrent()) {
        if (prepared && !submitted) {
          settle(requestId, "failed");
          remember(null);
          setPending(null);
        }
        setBusy(false);
        setNotice(errorMessage(e));
      }
      return submitted;
    }
  }
  function quickReplyContext(){
    const snapshot=getState();
    return {fingerprint:referenceFingerprint(snapshot),epoch:readReferenceRound(snapshot)?.epoch,context:currentContext?.value===referenceContext(snapshot)?currentContext.digest:null};
  }
  async function chooseQuickReply(entry:QuickReplyEntry,option:QuickReplyOption){
    if(option.intent==='adjust'){
      // Adjusting never sends: it opens the composer and keeps any typed draft.
      if(!message.trim())setMessage(QUICK_REPLY_ADJUST_PREFIX);
      const field=composerRef.current;
      if(field&&!field.disabled)field.focus();
      requestAnimationFrame(()=>{const current=composerRef.current;if(current&&document.activeElement===current)current.setSelectionRange(current.value.length,current.value.length);});
      return;
    }
    if(quickReplyStatus(entry,conversationMessages(getState(),conversationId),quickReplyContext()).kind!=='active')return;
    const text=quickReplyMessage(entry.reply,option);
    if(!text)return;
    await submitText(text,{fromComposer:false,quickReply:{version:1,intent:option.intent},onPrepared:userMessageId=>{
      try{recordQuickReplyAnswer(localStorage,quickReplyStorage,entry.messageId,{optionId:option.id,userMessageId});}catch{}
      focusAnswer.current=entry.messageId;refreshQuickReplies();
    }});
  }
  async function reconcileImage() {
    const action=imageAction;
    if(!action||busy||!imageNeedsReconciliation||action.context.baseVersion<1)return;
    setBusy(true);
    try {
      const response=await fetch('/api/agent/image/reconcile',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({projectId:state.projectId,pieceId:action.context.pieceId,version:action.context.baseVersion,attemptId:action.attemptId,actionBinding:action.actionBinding})});
      const result:unknown=await response.json();
      if(!response.ok||!result||typeof result!=='object'||!('status' in result)||result.status!=='fenced')throw Error('unverified');
      if(!mounted.current||!credentialIsCurrent())return;
      if(!recordImageNotDispatched(localStorage,imageSubmissionMarker,imageRejectedMarker,action.requestId))throw Error('marker changed');
      setImageNeedsReconciliation(false);setImageNeedsDecision(true);
      setNotice('A imagem não foi enviada. A proposta antiga foi bloqueada; recuse-a antes de pedir outra geração.');
    } catch {
      if(mounted.current&&credentialIsCurrent())setNotice('Não foi possível confirmar o envio. A tentativa continua preservada e não será repetida automaticamente.');
    } finally {if(mounted.current&&credentialIsCurrent())setBusy(false);}
  }
  async function reconcileClosedImage() {
    const requestId=closedImageAttempt;
    if(!requestId||busy)return;
    setBusy(true);
    try {
      const response=await fetch('/api/agent/image/reconcile-closed',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({projectId:state.projectId,requestId})});
      const result:unknown=await response.json();
      if(!response.ok||!result||typeof result!=='object'||!('status' in result)||result.status!=='confirmed')throw Error('unverified');
      if(!mounted.current||!credentialIsCurrent())return;
      if(localStorage.getItem(imageSubmissionMarker)!==requestId)throw Error('marker changed');
      localStorage.removeItem(imageSubmissionMarker);setClosedImageAttempt(null);
      setNotice('A tentativa terminou sem enviar imagem. Você pode pedir uma nova geração.');
    } catch {
      if(mounted.current&&credentialIsCurrent())setNotice('Não foi possível confirmar o envio. A tentativa continua preservada.');
    } finally {if(mounted.current&&credentialIsCurrent())setBusy(false);}
  }
  async function declineImage() {
    const action = imageAction;
    if (!action?.declineBinding || busy || imageNeedsReconciliation) return;
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
      if (credentialIsCurrent()) {
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
    const isCurrentScope = () => mounted.current && credentialIsCurrent() && preparationSequence.current === preparation;
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
      const ready = {...action, ...prepared, inputError: '', canPrepareTransport: false};
      setImageAction(ready);
      await confirmImage(ready);
    } catch (error) {
      if (isCurrentScope()) {
        setImageAction({...action, artworkInput: null, conversions: [], sourceFingerprint: null});
        setNotice(errorMessage(error));
      }
    } finally {
      if (isCurrentScope()) setBusy(false);
    }
  }
  async function confirmImage(action:ImageAction|null = imageAction) {
    const
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
      setBusy(false);
      setNotice("O post ou seus textos mudaram. Abra a versão indicada e consulte a mesma proposta para revisar antes de gerar.");
      return;
    }
    try {
      if (localStorage.getItem(imageSubmissionMarker)) {
        setImageAction(null);
        setBusy(false);
        setNotice("Uma geração anterior ainda precisa ser consultada. Não iniciaremos outra automaticamente.");
        return;
      }
    } catch {
      setBusy(false);
      setNotice("Não foi possível preservar o estado da geração neste navegador.");
      return;
    }
    setBusy(true);
    const snapshot = getState();
    let imageAvailable=false,imageApplied=false;
    let target = {pieceId: draft.pieceId, version: draft.baseVersion};
    const isCurrentScope=()=>mounted.current&&credentialIsCurrent();
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
        const saved = await prepareImageVersion({pieceId: draft.pieceId, baseVersion: draft.baseVersion, expectedLatestVersion: draft.expectedLatestVersion,operation:action.proposal.operation,...(action.proposal.changedDimension?{changedDimension:action.proposal.changedDimension}:{})});
        if (!saved || saved.status !== "completed" || saved.pieceId !== draft.pieceId || typeof saved.version!=="number" || !Number.isSafeInteger(saved.version) || saved.version <= draft.baseVersion) throw Error("Não foi possível preparar a nova versão. Confira o histórico antes de tentar novamente.");
        target = {pieceId: saved.pieceId, version: saved.version};
        if (!isCurrentScope()) return;
        const savedDraft = getCurrentDraft(getState());
        if (!savedDraft || savedDraft.pieceId !== target.pieceId || savedDraft.baseVersion !== target.version || savedDraft.dirty ||
          (["headline", "price", "date"] satisfies (keyof typeof savedDraft.content)[]).some(field => savedDraft.content[field] !== action.artworkInput?.literalText[field]) ||
          !sameCreativeFields(savedDraft.content.fields, action.artworkInput?.literalText.fields)) {
          imageContext.current = {pieceId: target.pieceId, baseVersion: target.version};
          remember(action.requestId);
          setImageAction({...action, context: {...action.context, baseVersion: target.version}, artworkInput: null, conversions: [], sourceFingerprint: null, canPrepareTransport: false});
          throw Error("O post mudou enquanto a versão era salva. Consulte a mesma proposta antes de gerar.");
        }
      }
      if (action.artworkInput.source && target.version <= action.artworkInput.source.version) throw Error("Salve uma nova versão para preservar a imagem de origem antes de editar.");
      imageContext.current = {pieceId: target.pieceId, baseVersion: target.version};
      remember(action.requestId);
      if (!credentialIsCurrent() || !availability.current.hasApiKey || !canUseAI || (credentialSource==='byok'&&!getApiKey())) throw Error("Ative a IA escolhida para continuar.");
      const savedRevision = getState().revision;
      let data:ChatResponse;
      for (;;) {
        try {
          if (localStorage.getItem(imageSubmissionMarker)) throw Error();
          localStorage.setItem(imageSubmissionMarker, action.requestId);
          if (localStorage.getItem(imageSubmissionMarker) !== action.requestId) throw Error();
        } catch { throw Error("Não foi possível preservar o estado da geração. Nenhuma imagem foi enviada."); }
        data = await api("/api/agent/image", {
          projectId: state.projectId,
          pieceId: target.pieceId,
          version: target.version,
          attemptId: action.attemptId,
          actionBinding: action.actionBinding,
          explicitApproval: true,
          artworkInput: action.artworkInput,
        });
        if (data.status === 'failed' && data.error === 'image_invalid_request') {
          setImageAction({...action,context:{...action.context,baseVersion:target.version},artworkInput:null,conversions:[],sourceFingerprint:null,canPrepareTransport:false});
          setImageNeedsReconciliation(true);setImageNeedsDecision(false);setBusy(false);
          setNotice('Esta requisição não enviou a imagem e o post salvo foi preservado. Verifique a tentativa antes de continuar.');
          return;
        }
        if (data.status !== "failed" || !["image_busy", "image_blocked"].includes(data.error ?? "")) break;
        // The server confirms that no image request was sent for this reservation.
        if (localStorage.getItem(imageSubmissionMarker) === action.requestId) localStorage.removeItem(imageSubmissionMarker);
        if (data.error === "image_blocked") throw Error("Uma geração anterior tem resultado incerto. Consulte essa tentativa antes de gerar outra imagem.");
        setNotice("Aguardando a exploração atual terminar para gerar esta peça…");
        await new Promise(resolve => setTimeout(resolve, 1500));
        if (!isCurrentScope()) return;
        if (!credentialIsCurrent() || !availability.current.hasApiKey || (credentialSource==='byok'&&!getApiKey()) || getState().revision !== savedRevision) throw Error("O contexto mudou enquanto aguardávamos. Consulte a mesma proposta antes de gerar.");
      }
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
            creationContext:{postContext:getState().adjustments.find(item=>item.id===action.requestId)?.context.postContext??postContext(getState(),target.pieceId),references:getState().adjustments.find(item=>item.id===action.requestId)?.context.references.filter(reference=>action.proposal.referenceIds.includes(reference.id))??[]},
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
  const visibleMessages=conversationMessages(state,conversationId);
  return (
    <section className={intro?"studio-chat-panel studio-post-intro":"studio-chat-panel"} aria-label={conversationId==='references'?'Conversa sobre referências':conversationId?'Conversa deste post':'Conversa do projeto'}>
      <header className="studio-chat-header">
        <img src="/studio/compor-avatar.svg" alt="" width="26" height="26.4044" />
        <div>
          <h2>{readOnly?"Histórico anterior do projeto":intro?"Qual post você quer criar agora?":"Vamos compor juntos"}</h2>
          <p>{intro?"O contexto do projeto já está preparado. Agora descreva esta peça.":"Uma conversa, muitas possibilidades."}</p>
        </div>
        <button type="button" className="studio-chat-details-toggle" aria-label={detailsVisible?'Ocultar detalhes da conversa':'Mostrar detalhes da conversa'} aria-expanded={detailsVisible} aria-controls={detailsId} onClick={()=>setDetailsVisible(value=>!value)}>Detalhes</button>
      </header>
      {intro&&!canUseAI&&<p className="studio-hint">Para criar pela conversa, escolha sua IA nas configurações do projeto. Você também pode começar pelo editor.</p>}
      <div id={detailsId} className="studio-chat-meta" hidden={intro||!detailsVisible} onToggle={(event) => {
        const opened = event.target;
        if (!(opened instanceof HTMLDetailsElement) || !opened.open || opened.parentElement !== event.currentTarget) return;
        event.currentTarget.querySelectorAll<HTMLDetailsElement>(":scope > details").forEach((item) => { if (item !== opened) item.open = false; });
      }}>
        {connection}
        <details className="studio-chat-context">
          <summary>Contexto do pedido</summary>
          <strong className="studio-context-title">
            {currentDraft?.content.headline || "Post sem título"}
          </strong>
          <span>
            {" "}
            ·{" "}
            {currentDraft?.baseVersion
              ? `base: versão ${currentDraft.baseVersion}`
              : "rascunho novo"}
          </span>
          <p>{state.references.length} referências · {state.marks.filter(mark => mark.pieceId === state.selection?.pieceId && mark.baseVersion === state.selection?.baseVersion).length} marcações no post</p>
          {developerMode && usage && (
            <small>
              Uso acumulado informado pela sessão: {usage.input_tokens ?? "?"}{" "}
              tokens de entrada e {usage.output_tokens ?? "?"} de saída. Custo
              final desconhecido.
            </small>
          )}
        </details>
      </div>
      <div className="studio-chat-messages" aria-live="polite" ref={messagesRef} onScroll={(event) => {
        const element = event.currentTarget;
        followMessages.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
      }}>
        {visibleMessages.length === 0 && !intro && (
          <div className="studio-message" data-role="assistant">
            <p>
              Me conte o que você quer criar. Posso ajudar a organizar a ideia,
              entender quem vai comprar e ajustar o post aberto.
            </p>
          </div>
        )}
        {visibleMessages.filter(item=>item.role!=='system').map((item) => {
          const entry=item.role==='assistant'?quickReplies.find(candidate=>candidate.messageId===item.id):undefined;
          if(entry)return <TasteReadingCard key={item.id} entry={entry} status={quickReplyStatus(entry,visibleMessages,{fingerprint:referenceSet,epoch:readReferenceRound(state)?.epoch,context:currentContext?.value===referenceContextValue?currentContext.digest:null})} disabled={readOnly||!canUseAI||busy||Boolean(pending)||inspecting||sourceMismatch} renderText={text=><MessageMarkdown text={text}/>} onChoose={option=>{void chooseQuickReply(entry,option);}}/>;
          return <article
            className="studio-message"
            data-role={item.role}
            key={item.id}
          >
            <span className="studio-message-label">
              {item.role === "user" ? "Você" : "Compor"}
            </span>
            {item.role === 'assistant' ? (
              <div className="studio-message-markdown">
                <MessageMarkdown text={item.text} />
              </div>
            ) : <p>{item.text}</p>}
          </article>;
        })}
        {busy && <div className="studio-message studio-thinking" role="status">
          <span className="studio-thinking-dots" aria-hidden="true"><i /><i /><i /></span>
          <span>Compor está trabalhando…</span>
        </div>}
        {explorationRecovery}
        {sourceMismatch && pendingSource && <p role="status" className="studio-hint">{sourceNotice(pendingSource)}</p>}
        {notice && !sourceMismatch && (
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
              <button type="button" disabled={busy||imageNeedsReconciliation||imageNeedsDecision} onClick={prepareImageCopies}>{imageAction.proposal.operation === 'edit' ? 'Preparar cópia para edição' : 'Preparar cópias para envio'}</button>
            </div>}
            {imageAction.conversions.length > 0 && <div>
              <ul aria-label="Cópias preparadas para envio">{imageAction.conversions.map(conversion => <li key={conversion.id}>
                {conversion.role === 'base' ? 'Imagem de origem' : 'Referência'}: {conversion.original.mime === 'image/png' ? 'PNG' : 'JPEG'} {conversion.original.width} × {conversion.original.height} ({Math.ceil(conversion.original.bytes / 1024)} KB) → JPEG {conversion.copy.width} × {conversion.copy.height} ({Math.ceil(conversion.copy.bytes / 1024)} KB). {conversion.original.width === conversion.copy.width && conversion.original.height === conversion.copy.height ? 'Dimensões preservadas.' : 'Dimensões reduzidas.'}
              </li>)}</ul>
              <p>Apenas essas cópias serão enviadas. Os arquivos originais permanecem intactos. Transparências recebem fundo branco.</p>
            </div>}
            {imageAction.artworkInput && <>
              <p>{imageAction.proposal.operation === "edit" ? "A imagem selecionada será enviada como origem. " : ""}{imageAction.proposal.referenceIds.length} referências visuais. Formato retrato 4:5.</p>
              <dl className="studio-artwork-texts">{([['Título na arte',imageAction.artworkInput.literalText.headline],['Preço na arte',imageAction.artworkInput.literalText.price],['Data na arte',imageAction.artworkInput.literalText.date]] satisfies [string,string][]).filter(([,value])=>value).map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}{imageAction.artworkInput.literalText.fields?.filter(field=>field.value).map(field=><div key={field.id}><dt>{field.label}</dt><dd>{field.value}</dd></div>)}</dl>
              <p>A arte inteira será gerada, incluindo esses textos. Confira grafia, fatos e legibilidade no resultado. A versão anterior permanece no histórico.</p>
            </>}
            <p>
              {credentialSource==='byok'?'A geração usa sua chave e é cobrada pela OpenAI. O custo final ainda é desconhecido.':'A geração usa a IA do Compor.'}
            </p>
            {imageNeedsReconciliation && <button type="button" disabled={busy} onClick={reconcileImage}>Verificar envio anterior</button>}
            <button type="button" disabled={busy||!canUseAI||sourceMismatch} onClick={()=>poll(imageAction.requestId)}>Consultar a mesma proposta</button>
            <button
              type="button"
              disabled={busy || !canUseAI || sourceMismatch || imageNeedsReconciliation}
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
            disabled={!canUseAI||sourceMismatch}
            onClick={() => poll(pending)}
          >
            Consultar esta tentativa
          </button>
        )}
        {closedImageAttempt && !pending && !imageAction && <button type="button" className="studio-button-secondary" disabled={busy} onClick={reconcileClosedImage}>Verificar envio anterior</button>}
        {developerMode&&!pending&&!busy&&lastCompleted&&<div className="studio-attempt-inspection">
          <button type="button" className="studio-button-secondary" disabled={!canUseAI||inspecting} onClick={inspectLastCompleted}>{inspecting?'Consultando estado…':'Consultar estado'}</button>
          {!canUseAI&&<p>A IA está indisponível para consultar a solicitação anterior.</p>}
          {inspection&&<div role="status">
            {inspection.authenticationRejected?<p role="alert">{authenticationNotice}</p>:<p>Estado da solicitação anterior: {{completed:'concluída',failed:'terminou com falha',running:'em andamento',action_required:'aguardando ação',consent_required:'aguardando confirmação',unknown:'não confirmado',unavailable:'consulta indisponível'}[inspection.status]}.</p>}
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
      {conversationId&&ownedDraft.error&&<p role="status" className="studio-hint">{ownedDraft.error}</p>}
      <form className="studio-chat-composer" onSubmit={send}>
        <img src="/studio/compor-avatar.svg" alt="" width="24" height="24" />
        <label className="studio-visually-hidden" htmlFor={composerId}>Sua mensagem</label>
        <textarea
          ref={composerRef}
          id={composerId}
          rows={1}
          maxLength={4000}
          value={message}
          disabled={busy||readOnly}
          placeholder={intro?"Ex.: crie um post para anunciar as inscrições da oficina, com uma mensagem acolhedora.":"Escreva uma mensagem…"}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={submitOnEnter}
        />
          <button
            className="studio-button"
            aria-label={busy ? "Trabalhando…" : intro ? "Criar post" : "Enviar →"}
            disabled={readOnly || !message.trim() || !canUseAI || busy || inspecting || Boolean(pending)}
          >
            <span aria-hidden="true">{intro?"Criar post":"↑"}</span>
          </button>
      </form>
    </section>
  );
}
