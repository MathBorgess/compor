import {referenceSourceSchema,studioStateSchema, type StudioState, type StudioDraft, type PieceContent, type PieceFrame, type PostFormat, type BrandVoice, type CreativeField, type Approval, type DraftContext, type StudioReference, type StudioMark, type AdjustmentContext, type Adjustment, type AdjustmentResult, type ActionResult, type ActionReceipt, type StudioMessage, type StudioEvent, type CreativeCriterion, type CreativeDecision, type Persona, type Brief, type RequestStatus} from './studio-domain.ts';
export type * from './studio-domain.ts';
import { parseDirection, proposeCriterion, decideCriterion } from './studio-direction.ts';
import {conversationDirection,effectiveReferences,emptyPostSettings,postContext,validatePostSettings} from './studio-post-context.ts';
import { audienceResolution } from './studio-context.ts';
import { clampFrameCount, postFormatOption, resizeFrames } from './studio-post-formats.ts';
import {carouselPlanJson} from './carousel-plan-json.ts';
import {carouselMatchesFrames,carouselPlanSchema,carouselRenderSchema,type CarouselPlan,type CarouselRender} from './studio-carousel-contract.ts';
import type {FramePlanInput} from '@compor/agents-api/studio-chat-tools';
export const STUDIO_SCHEMA_VERSION = 4;
export const REFERENCE_SELECTION_EVENT = 'A seleção de referências ficou estável.';
export const STUDIO_LIMITS = Object.freeze({ messages: 200, drafts: 100, marks: 200, references: 20, adjustments: 100, events: 500, actionReceipts: 200, stateBytes: 512 * 1024, referenceBytes: 8 * 1024 * 1024, referenceTotalBytes: 64 * 1024 * 1024, localFiles: 500, localFileBytes: 256 * 1024 * 1024 });

export class StudioStateError extends Error {
  code: string;
  constructor(code = 'invalid_studio_state') { super(code); this.name = 'StudioStateError'; this.code = code; }
}
function fail(): never { throw new StudioStateError(); }
const plain = (value: unknown): value is Record<string,unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const keys = (value: unknown, required: string[], optional: string[] = []) => plain(value) && required.every(key => Object.hasOwn(value, key)) && Object.keys(value).every(key => required.includes(key) || optional.includes(key));
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const integer = (value: unknown, min = 0): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= min;
const text = (value: unknown, max: number, empty = true): value is string => typeof value === 'string' && value.length <= max && (empty || value.trim().length > 0) && !/sk-[A-Za-z0-9_-]{20,}/.test(value);
const iso = (value: unknown): value is string => typeof value === 'string' && value.length <= 32 && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const unique = <T>(items: T[], by: (item:T)=>unknown = item => item && typeof item === "object" && "id" in item ? item.id : undefined) => new Set(items.map(by)).size === items.length;
const frameValid = (frame: PieceFrame, total: number) => keys(frame, ['id','position','role','headline','body','visualCue','assetId']) && uuid(frame.id) && integer(frame.position, 1) && frame.position <= total && text(frame.role, 80) && !/[\u0000-\u001f\u007f]/.test(frame.role) && text(frame.headline, 500) && !/[\u0000-\u0009\u000b-\u001f\u007f]/.test(frame.headline) && text(frame.body, 1000) && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(frame.body) && text(frame.visualCue, 500) && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(frame.visualCue) && (frame.assetId === null || uuid(frame.assetId));
const contentValid = (value: PieceContent) => keys(value, ['headline','price','date','caption','captionOrigin'], ['fields','format','visualInvariants','frames','carouselPlan','carouselRender']) && text(value.headline, 500) && text(value.price, 100) && text(value.date, 100) && text(value.caption, 4000) && ['user','agent'].includes(value.captionOrigin) && (value.fields === undefined || Array.isArray(value.fields) && value.fields.length <= 20 && new Set(value.fields.map(field=>field.id.toLowerCase())).size===value.fields.length && value.fields.every(field=>keys(field,['id','label','value','origin']) && uuid(field.id) && text(field.label,80,false) && text(field.value,500) && !/[\u0000-\u001f\u007f]/.test(field.label+field.value) && ['user','agent'].includes(field.origin))) && (value.format === undefined || ['single','carousel','collection','story'].includes(value.format)) && (value.visualInvariants === undefined || text(value.visualInvariants, 1000) && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value.visualInvariants)) && (value.frames === undefined || (value.format === 'carousel' || value.format === 'collection') && Array.isArray(value.frames) && value.frames.length >= 2 && value.frames.length <= 10 && new Set(value.frames.map(frame => frame.id.toLowerCase())).size === value.frames.length && new Set(value.frames.map(frame => frame.position)).size === value.frames.length && value.frames.every(frame => frameValid(frame, value.frames!.length)))
  && (value.carouselPlan===undefined || carouselPlanSchema.safeParse(value.carouselPlan).success)
  && (value.carouselRender===undefined || carouselRenderSchema.safeParse(value.carouselRender).success)
  && carouselMatchesFrames(value);
export const sameCreativeFields = (left: CreativeField[] | undefined, right: CreativeField[] | undefined) => left === undefined ? right === undefined : right !== undefined && left.length === right.length && left.every((field,index)=>{const other=right[index];return !!other && (['id','label','value','origin'] as const).every(key=>field[key]===other[key]);});
export const samePieceFrames = (left: PieceFrame[] | undefined, right: PieceFrame[] | undefined) => left === undefined ? right === undefined : right !== undefined && left.length === right.length && left.every((frame,index)=>{const other=right[index];return !!other && (['id','position','role','headline','body','visualCue','assetId'] as const).every(key=>frame[key]===other[key]);});
export const samePieceContent = (left: PieceContent, right: PieceContent) => contentValid(left) && contentValid(right) && (['headline','price','date','caption','captionOrigin'] as const).every(key=>left[key]===right[key]) && left.format === right.format && left.visualInvariants === right.visualInvariants && sameCreativeFields(left.fields,right.fields) && samePieceFrames(left.frames,right.frames)
  && carouselPlanJson(left.carouselPlan)===carouselPlanJson(right.carouselPlan)
  && carouselPlanJson(left.carouselRender)===carouselPlanJson(right.carouselRender);
const sameContent = samePieceContent;
const approvalValid = (value: Approval) => keys(value, ['status'], ['kind','sourceVersion','at']) && (value.status === 'unapproved' ? Object.keys(value).length === 1 : value.status === 'approved' && ['explicit','inherited'].includes(value.kind) && integer(value.sourceVersion,1) && iso(value.at));
const approvalForBase = (value: Approval,baseVersion: number) => approvalValid(value) && (value.status==='unapproved'||value.sourceVersion<=baseVersion&&(value.kind==='inherited'||value.sourceVersion===baseVersion));
const sameDraft = (a: Partial<Pick<StudioDraft,"pieceId"|"baseVersion">>, b: Partial<Pick<StudioDraft,"pieceId"|"baseVersion">>) => a.pieceId === b.pieceId && a.baseVersion === b.baseVersion;
const contextValid = (value: DraftContext) => uuid(value.pieceId) && integer(value.baseVersion) && integer(value.expectedLatestVersion) && value.baseVersion <= value.expectedLatestVersion;
const referenceValid = (value: StudioReference) => (!value.source || referenceSourceSchema.safeParse(value.source).success) && uuid(value.id) && text(value.name, 200, false) && ['image/png','image/jpeg'].includes(value.mime) && integer(value.size, 1) && value.size <= STUDIO_LIMITS.referenceBytes && integer(value.width, 1) && integer(value.height, 1) && value.width * value.height <= 40_000_000;
const referenceInProject = (value: StudioReference, projectId: string) => referenceValid(value) && (!value.source || !('kind' in value.source) || value.source.kind !== 'generated' || value.source.projectId === projectId);
const markValid = (value: StudioMark) => uuid(value.id) && uuid(value.pieceId) && integer(value.baseVersion) && text(value.note, 2000) && (value.frameId === undefined || uuid(value.frameId)) && (value.kind === 'area' ? (['x','y','width','height'] as const).every(key => Number.isFinite(value[key]) && value[key] >= 0 && value[key] <= 1) && value.width > 0 && value.height > 0 && value.x + value.width <= 1.000000001 && value.y + value.height <= 1.000000001 : value.kind === 'element' && text(value.elementId, 100, false));
const freeze = <T>(value: T): T => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const clone = <T>(value: T): T => structuredClone(value);
const blankContent = (): PieceContent => ({ headline: '', price: '', date: '', caption: '', captionOrigin: 'user' });
const noApproval = (): Approval => ({ status: 'unapproved' });
const requestStates: RequestStatus[] = ['pending','in_progress','consent_required','completed','failed','unknown'];
const actionResultValid = (value: ActionResult,projectId: string) => keys(value,['status'],['revision','projectId','pieceId','baseVersion','expectedLatestVersion','version','unsaved','local','title','feedbackStatus','carouselCompositionAvailable']) && ['completed','declined','unknown','pending_confirmation'].includes(value.status) && (!Object.hasOwn(value,'revision')||integer(value.revision)) && (!Object.hasOwn(value,'projectId')||value.projectId===projectId) && (!Object.hasOwn(value,'pieceId')||value.pieceId===null||uuid(value.pieceId)) && (!Object.hasOwn(value,'baseVersion')||value.baseVersion===null||integer(value.baseVersion)) && (!Object.hasOwn(value,'expectedLatestVersion')||integer(value.expectedLatestVersion)) && (!Object.hasOwn(value,'version')||integer(value.version,1)) && (['unsaved','local','carouselCompositionAvailable'] as const).every(key=>!Object.hasOwn(value,key)||typeof value[key]==='boolean') && (!Object.hasOwn(value,'title')||text(value.title,200,false)) && (!Object.hasOwn(value,'feedbackStatus')||['recorded','ambiguous','quote_not_found','reference_unavailable'].includes(value.feedbackStatus!));
const actionReceiptValid = (value: ActionReceipt,projectId: string) => keys(value,['requestId','fingerprint','result']) && uuid(value.requestId) && typeof value.fingerprint==='string' && /^[0-9a-f]{64}$/.test(value.fingerprint) && actionResultValid(value.result,projectId);
const sameActionResult = (left: ActionResult,right: ActionResult) => Object.keys(left).length===Object.keys(right).length && Object.keys(left).every(key=>Object.hasOwn(right,key)&&Reflect.get(left,key)===Reflect.get(right,key));

export function parseStudioState(input: unknown): StudioState {
  if (!plain(input)) fail();
  const legacy = input.schemaVersion === 1 ? {...input,schemaVersion:2,workflow:{phase:'ready',view:'posts',aiPreference:'none'}} : input;
  const v3 = legacy.schemaVersion === 2 ? {...legacy,schemaVersion:3,projectReferenceIds:Array.isArray(legacy.references)?legacy.references.map(item=>plain(item)?item.id:null):[],posts:{}} : legacy;
  const candidate = v3.schemaVersion === 3 ? {...v3,schemaVersion:4} : v3;
  const shape = studioStateSchema.safeParse(candidate);
  if (!shape.success) fail();
  const value = shape.data;
  if (!uuid(value.userId) || !uuid(value.projectId) || !integer(value.revision) || !text(value.projectIdea,4000)) fail();
  if (!Object.values(value.brief).every(item => text(item, 4000))) fail();
  const persona = value.persona;
  if (!text(persona.audience,4000) || !(['situation','need'] as const).every(key => text(persona[key], 2000)) || !text(persona.culturalReferences, 4000) || persona.claims.length > 100 || !unique(persona.claims) || !persona.claims.every(item => uuid(item.id) && text(item.text, 2000) && text(item.source, 2000))) fail();
  for (const field of ['drafts','messages','marks','references','adjustments','events'] as const) if (value[field].length > STUDIO_LIMITS[field]) fail();
  if (!value.drafts.every(item => contextValid({pieceId:item.pieceId,baseVersion:item.baseVersion,expectedLatestVersion:item.expectedLatestVersion}) && contentValid(item.content) && approvalForBase(item.approval,item.baseVersion) && (!item.creationContext || unique(item.creationContext.references)&&item.creationContext.references.every(reference=>referenceInProject(reference,value.projectId))&&item.creationContext.references.reduce((sum,reference)=>sum+reference.size,0)<=STUDIO_LIMITS.referenceTotalBytes)) || !unique(value.drafts, item => `${item.pieceId}:${item.baseVersion}`)) fail();
  if (value.selection !== null && (!value.drafts.some(item => sameDraft(item, value.selection??{})))) fail();
  if(value.selection&&value.posts[value.selection.pieceId]?.deleted)fail();
  if(value.workflow.pendingPost&&value.drafts.some(draft=>draft.pieceId===value.workflow.pendingPost?.pieceId))fail();
  if(value.workflow.referencePieceId!==null&&!value.drafts.some(item=>item.pieceId===value.workflow.referencePieceId&&item.baseVersion===0))fail();
  if (!unique(value.messages) || !value.messages.every(item => uuid(item.id) && (item.role!=='system'||item.text===REFERENCE_SELECTION_EVENT) && text(item.text, 16_000) && iso(item.createdAt) && (item.context === null || contextValid(item.context)))) fail();
  if (!unique(value.marks) || !value.marks.every(markValid) || !value.marks.every(mark => value.drafts.some(draft => sameDraft(draft, mark)))) fail();
  if (!unique(value.references) || !value.references.every(reference => referenceInProject(reference, value.projectId)) || value.references.reduce((sum, item) => sum + item.size, 0) > STUDIO_LIMITS.referenceTotalBytes) fail();
  if (!validatePostSettings(value)) fail();
  if(Object.keys(value.workflow.latestExplorations??{}).some(scope=>scope!=='references'&&!value.drafts.some(draft=>draft.pieceId===scope)))fail();
  if(Object.values(value.workflow.latestExplorations??{}).some(candidate=>candidate.creationContext&&(!unique(candidate.creationContext.references)||!candidate.creationContext.references.every(reference=>referenceInProject(reference,value.projectId))||candidate.creationContext.references.reduce((sum,reference)=>sum+reference.size,0)>STUDIO_LIMITS.referenceTotalBytes||candidate.creationContext.explorationSource?.projectId!==undefined&&candidate.creationContext.explorationSource.projectId!==value.projectId)))fail();
  if(value.drafts.some(draft=>draft.creationContext?.explorationSource&&(draft.creationContext.explorationSource.projectId!==value.projectId||draft.creationContext.explorationSource.conversationId!=='references'&&draft.creationContext.explorationSource.conversationId!==draft.pieceId)))fail();
  if (!unique(value.adjustments) || !value.adjustments.every(item => adjustmentValid(item,value))) fail();
  if (!unique(value.events) || !value.events.every((item,index) => uuid(item.id) && (item.requestId === null || uuid(item.requestId) && value.adjustments.some(request=>request.id===item.requestId)) && item.sequence === index + 1)) fail();
  const actionReceipts=value.actionReceipts;
  if(actionReceipts.length>STUDIO_LIMITS.actionReceipts||!unique(actionReceipts,item=>item.requestId)||!actionReceipts.every(item=>actionReceiptValid(item,value.projectId)))fail();
  const audience=audienceResolution(value);
  const audienceText=value.brief.audience===value.persona.audience?value.brief.audience:audience.status==='resolved'?audience.value:null;
  const normalized={...value,...(audienceText!==null?{brief:{...value.brief,audience:audienceText},persona:{...value.persona,audience:audienceText}}:{}),actionReceipts,direction:parseDirection(value.direction)};
  if (new TextEncoder().encode(JSON.stringify(normalized)).byteLength > STUDIO_LIMITS.stateBytes) throw new StudioStateError('studio_state_limit');
  return freeze(clone(normalized));
}
function resultValid(value: AdjustmentResult) { return Object.keys(value).length>0 && (!Object.hasOwn(value, 'messageId') || Object.hasOwn(value,'text') && uuid(value.messageId)) && (!Object.hasOwn(value, 'text') || uuid(value.messageId) && text(value.text, 16_000)) && (!Object.hasOwn(value, 'assetId') || uuid(value.assetId)); }
function adjustmentValid(item: Adjustment,state: StudioState) {
  if(!uuid(item.id) || !uuid(item.messageId) || !iso(item.createdAt) || !adjustmentContextValid(item.context,state.projectId))return false;
  const message=state.messages.find(message=>message.id===item.messageId);
  if(item.context.conversationId && item.context.conversationId!=='references' && item.context.conversationId!==item.context.pieceId)return false;
  if(!message || message.conversationId!==item.context.conversationId || !['user','system'].includes(message.role) || message.text!==item.context.instruction || message.createdAt!==item.createdAt || message.context?.pieceId!==item.context.pieceId || message.context?.baseVersion!==item.context.baseVersion || message.context?.expectedLatestVersion!==item.context.expectedLatestVersion)return false;
  if(!Object.hasOwn(item,'result'))return true;
  if(!item.result)return false;
  if(!resultValid(item.result) || Object.hasOwn(item.result,'text')&&item.status!=='completed')return false;
  if(!Object.hasOwn(item.result,'text'))return true;
  return state.messages.some(message=>message.id===item.result?.messageId&&message.role==='assistant'&&message.text===item.result?.text&&sameDraft(message.context??{},item.context)&&message.context?.expectedLatestVersion===item.context.expectedLatestVersion);
}
function adjustmentContextValid(value: AdjustmentContext, projectId: string) { return (!Object.hasOwn(value,'direction') || Boolean(parseDirection(value.direction))) && value.projectId === projectId && contextValid({pieceId:value.pieceId,baseVersion:value.baseVersion,expectedLatestVersion:value.expectedLatestVersion}) && text(value.instruction, 4000, false) && value.marks.length <= 200 && unique(value.marks) && value.marks.every(mark => markValid(mark) && sameDraft(mark, value)) && value.references.length <= 20 && unique(value.references) && value.references.every(reference => referenceInProject(reference,projectId)) && value.references.reduce((sum,item)=>sum+item.size,0)<=STUDIO_LIMITS.referenceTotalBytes && approvalForBase(value.approval,value.baseVersion); }
export function changeStudioState(state: StudioState, action: (state: StudioState)=>void) { const next = clone(parseStudioState(state)); action(next); if(next.selection)next.workflow.selections[next.selection.pieceId]=next.selection.baseVersion; next.revision++; return parseStudioState(next); }
function current(state: StudioState) { const draft = state.drafts.find(item => state.selection && sameDraft(item, state.selection)); if (!draft) throw new StudioStateError('studio_no_selection'); return draft; }
function event(state: StudioState, type: StudioEvent["type"], requestId: string|null, id: string) { if (!uuid(id)) fail(); if (state.events.length >= STUDIO_LIMITS.events) throw new StudioStateError('studio_state_limit'); state.events.push({id,type,requestId,sequence:state.events.length + 1}); }

export function createStudioState({userId,projectId,projectTitleProvisional=false,projectIdea='',prepare=false}: {userId:string;projectId:string;projectTitleProvisional?:boolean;projectIdea?:string;prepare?:boolean}) { return parseStudioState({schemaVersion:4,posts:{},projectReferenceIds:[],workflow:{phase:prepare?'context':'ready',view:prepare?'compose':'posts',aiPreference:'default'},userId,projectId,revision:0,projectTitleProvisional,projectIdea,brief:{offer:'',audience:'',action:'',direction:''},persona:{audience:'',situation:'',need:'',culturalReferences:'',claims:[]},selection:null,drafts:[],messages:[],marks:[],references:[],adjustments:[],events:[]}); }
/** A proposed or manually chosen name never becomes provisional again. */
export function resolveProjectTitle(state: StudioState) { return state.projectTitleProvisional ? changeStudioState(state,next=>{next.projectTitleProvisional=false;}) : state; }
export const getCurrentDraft = (state: StudioState) => { parseStudioState(state); return state.selection ? freeze(clone(current(state))) : null; };
export function selectDraft(state: StudioState, {pieceId,baseVersion}: Pick<StudioDraft,"pieceId"|"baseVersion">) { return changeStudioState(state,next=>{if(!uuid(pieceId)||!integer(baseVersion)||!next.drafts.some(item=>item.pieceId===pieceId&&item.baseVersion===baseVersion))throw new StudioStateError('studio_draft_unavailable');next.selection={pieceId,baseVersion};}); }
/** Compose with a domain reducer and save once to commit the effect and receipt together. */
export function recordActionReceipt(state: StudioState,receipt: ActionReceipt) {
  const parsed=parseStudioState(state);
  if(!actionReceiptValid(receipt,parsed.projectId))throw new StudioStateError('studio_action_receipt_invalid');
  const previous=parsed.actionReceipts.find(item=>item.requestId===receipt.requestId);
  if(previous){
    if(previous.fingerprint!==receipt.fingerprint)throw new StudioStateError('studio_action_conflict');
    if(sameActionResult(previous.result,receipt.result))return state;
    if(['completed','declined'].includes(previous.result.status))throw new StudioStateError('studio_action_conflict');
  }else if(parsed.actionReceipts.length>=STUDIO_LIMITS.actionReceipts)throw new StudioStateError('studio_action_receipt_limit');
  return changeStudioState(state,next=>{const existing=next.actionReceipts.find(item=>item.requestId===receipt.requestId);if(existing)existing.result=clone(receipt.result);else next.actionReceipts.push(clone(receipt));});
}
export const updateBrief = (state: StudioState, patch: Partial<Brief>) => changeStudioState(state, next => { if (!plain(patch) || !Object.keys(patch).length || !Object.keys(patch).every(key => Object.hasOwn(next.brief,key))) fail(); Object.assign(next.brief,patch); if(Object.hasOwn(patch,'audience'))next.persona.audience=next.brief.audience; });
export const updateBrandVoice = (state: StudioState, patch: Partial<BrandVoice>) => changeStudioState(state, next => {
  if (!plain(patch) || !Object.keys(patch).length || !Object.keys(patch).every(key => ['tone','examples','avoid'].includes(key))) fail();
  next.brandVoice = { tone: '', examples: '', avoid: '', ...next.brandVoice, ...patch };
});
function invalidateCarouselRender(content: PieceContent) {
  if (!content.carouselRender) return;
  delete content.carouselRender;
  if (content.frames) content.frames=content.frames.map(frame=>({...frame,assetId:null}));
}
export function setDraftCarouselRender(state: StudioState, source: StudioDraft, render: CarouselRender) {
  return changeStudioState(state, next=>{
    const draft=current(next);
    if (!sameDraft(draft,source) || draft.expectedLatestVersion!==source.expectedLatestVersion ||
      !samePieceContent(draft.content,source.content)) throw new StudioStateError('studio_carousel_changed');
    invalidateCarouselRender(draft.content);
    draft.content.carouselRender=carouselRenderSchema.parse(render);
    if (!contentValid(draft.content)) fail();
    draft.dirty=true;
  });
}

export function setPostFormat(state: StudioState, pieceId: string, format: PostFormat, frameCount?: number) {
  return changeStudioState(state, next => {
    if (!uuid(pieceId) || !['single','carousel','collection','story'].includes(format)) fail();
    const post = next.posts[pieceId] ?? (next.posts[pieceId] = emptyPostSettings());
    const count = clampFrameCount(format, frameCount);
    post.format = format;
    post.targetFrameCount = count;
    const draft = next.selection?.pieceId === pieceId ? current(next) : next.drafts.find(item => item.pieceId === pieceId);
    if (draft) {
      if (format!=='carousel' || draft.content.frames?.length!==count) {
        invalidateCarouselRender(draft.content);
        delete draft.content.carouselPlan;
      }
      draft.content.format = format;
      if (postFormatOption(format).multiFrame) {
        draft.content.frames = resizeFrames(format, draft.content.frames, count, draft.content.headline);
      } else {
        delete draft.content.frames;
        delete draft.content.visualInvariants;
      }
      if (!contentValid(draft.content)) fail();
      draft.dirty = true;
    }
  });
}
export function setDraftFrames(state: StudioState, {
  pieceId, baseVersion, visualInvariants, frames, compositionMode, compositionTokens,
}: {
  pieceId:string; baseVersion:number; visualInvariants?:string;
  frames:(FramePlanInput&{assetId?:string|null})[];
  compositionMode?:CarouselPlan['mode']; compositionTokens?:CarouselPlan['tokens'];
}) {
  return changeStudioState(state, next => {
    const draft = next.drafts.find(item => item.pieceId === pieceId && item.baseVersion === baseVersion);
    if (!draft) throw new StudioStateError('studio_draft_unavailable');
    const post = next.posts[pieceId] ?? (next.posts[pieceId] = emptyPostSettings());
    const format: PostFormat = post.format === 'carousel' || post.format === 'collection' ? post.format : 'carousel';
    if (compositionMode && format!=='carousel') fail();
    const hadComposition = draft.content.carouselPlan !== undefined;
    if (compositionMode || hadComposition) invalidateCarouselRender(draft.content);
    delete draft.content.carouselPlan;
    post.format = format;
    post.targetFrameCount = clampFrameCount(format, frames.length);
    const existingById = new Map((draft.content.frames ?? []).map(frame => [frame.id, frame]));
    const existingByPosition = new Map((draft.content.frames ?? []).map(frame => [frame.position, frame]));
    const sorted = [...frames].sort((a,b)=>a.position-b.position);
    const ordered = sorted.map((frame, index) => {
      const matched = (frame.id && existingById.get(frame.id)) || existingByPosition.get(index + 1);
      return {
        id: frame.id ?? matched?.id ?? crypto.randomUUID(),
        position: index + 1,
        role: frame.role,
        headline: frame.headline,
        body: frame.body,
        visualCue: frame.visualCue,
        assetId: compositionMode || hadComposition ? null : frame.assetId !== undefined ? frame.assetId : (matched?.assetId ?? null),
      };
    });
    draft.content.format = format;
    if (visualInvariants !== undefined) draft.content.visualInvariants = visualInvariants;
    draft.content.frames = ordered;
    if (compositionMode) draft.content.carouselPlan=carouselPlanSchema.parse({
      mode:compositionMode,tokens:compositionTokens,
      slides:sorted.map((frame,index)=>({...frame.composition,frameId:ordered[index].id})),
    });
    if (ordered[0]?.headline) draft.content.headline = ordered[0].headline;
    if (!contentValid(draft.content)) fail();
    draft.dirty = true;
  });
}
export function updateDraftFrame(state: StudioState, { pieceId, baseVersion, frameId, patch }: { pieceId: string; baseVersion: number; frameId: string; patch: Partial<Pick<PieceFrame, 'role' | 'headline' | 'body' | 'visualCue' | 'assetId'>> }) {
  return changeStudioState(state, next => {
    const draft = next.drafts.find(item => item.pieceId === pieceId && item.baseVersion === baseVersion);
    if (!draft || !draft.content.frames) throw new StudioStateError('studio_draft_unavailable');
    const index = draft.content.frames.findIndex(item => item.id === frameId);
    if (index < 0) throw new StudioStateError('studio_draft_unavailable');
    if (draft.content.carouselPlan && patch.assetId!==undefined) fail();
    if (Object.entries(patch).some(([key,value])=>Reflect.get(draft.content.frames?.[index]??{},key)!==value)) {
      invalidateCarouselRender(draft.content);
    }
    draft.content.frames[index] = { ...draft.content.frames[index], ...patch };
    if (draft.content.frames[index].position === 1 && patch.headline !== undefined) draft.content.headline = patch.headline;
    if (!contentValid(draft.content)) fail();
    draft.dirty = true;
  });
}
export function reorderDraftFrames(state: StudioState, { pieceId, baseVersion, fromIndex, toIndex }: { pieceId: string; baseVersion: number; fromIndex: number; toIndex: number }) {
  return changeStudioState(state, next => {
    const draft = next.drafts.find(item => item.pieceId === pieceId && item.baseVersion === baseVersion);
    if (!draft || !draft.content.frames) throw new StudioStateError('studio_draft_unavailable');
    const list = [...draft.content.frames].sort((a, b) => a.position - b.position);
    if (fromIndex < 0 || fromIndex >= list.length || toIndex < 0 || toIndex >= list.length || fromIndex === toIndex) return;
    invalidateCarouselRender(draft.content);
    const [moved] = list.splice(fromIndex, 1);
    list.splice(toIndex, 0, moved);
    draft.content.frames = list.map((frame, index) => ({ ...frame, position: index + 1, ...(draft.content.carouselPlan?{assetId:null}:{}) }));
    if (draft.content.frames[0]?.headline) draft.content.headline = draft.content.frames[0].headline;
    if (!contentValid(draft.content)) fail();
    draft.dirty = true;
  });
}
export const updatePersona = (state: StudioState, patch: Partial<Persona>) => changeStudioState(state, next => { if (!plain(patch) || !Object.keys(patch).length || !Object.keys(patch).every(key => Object.hasOwn(next.persona,key))) fail(); Object.assign(next.persona,clone(patch)); if(Object.hasOwn(patch,'audience'))next.brief.audience=next.persona.audience; });
export const updateOfferFacts = (state: StudioState, facts: NonNullable<StudioState['offerFacts']>) => changeStudioState(state,next=>{next.offerFacts=clone(facts);});
export const addCreativeCriterion = (state: StudioState, criterion: CreativeCriterion) => changeStudioState(state, next => { next.direction=proposeCriterion(next.direction,criterion); });
export const recordCreativeDecision = (state: StudioState, decision: CreativeDecision) => changeStudioState(state, next => { next.direction=decideCriterion(next.direction,decision); });
export function createPost(state: StudioState, {pieceId}: {pieceId:string}) { parseStudioState(state); if(!uuid(pieceId))fail();if(state.drafts.some(item=>item.pieceId===pieceId))return state;return changeStudioState(state, next => { next.drafts.push({pieceId,baseVersion:0,expectedLatestVersion:0,content:blankContent(),dirty:false,approval:noApproval()}); next.selection={pieceId,baseVersion:0}; }); }
export function selectVersion(state: StudioState, {pieceId,version,latestVersion,content,approval = noApproval()}: {pieceId:string;version:number;latestVersion:number;content:PieceContent;approval?:Approval}) {
  return changeStudioState(state, next => {
    if (!contextValid({pieceId,baseVersion:version,expectedLatestVersion:latestVersion}) || !contentValid(content) || !approvalForBase(approval,version)) fail();
    const existing=next.drafts.find(item => item.pieceId===pieceId && item.baseVersion===version);
    if (!existing) next.drafts.push({pieceId,baseVersion:version,expectedLatestVersion:latestVersion,content:clone(content),dirty:false,approval:clone(approval)});
    else if (!existing.dirty) {
      existing.expectedLatestVersion=latestVersion;
      existing.approval=clone(approval);
    }
    next.selection={pieceId,baseVersion:version};
  });
}
export function editDraft(state: StudioState, {field,value,captionOrigin='user'}: {field:"headline"|"price"|"date"|"caption";value:string;captionOrigin?:PieceContent['captionOrigin']}) {
  return changeStudioState(state, next => {
    const draft=current(next);
    if (!['headline','price','date','caption'].includes(field)) fail();
    if(field==='caption'&&(draft.content.caption!==value||captionOrigin==='user')) draft.content.captionOrigin=captionOrigin;
    if (draft.content[field]!==value && (field==='caption'||field==='headline')) {
      invalidateCarouselRender(draft.content);
      const cover=draft.content.frames?.find(frame=>frame.position===1);
      if (field==='headline' && cover && draft.content.carouselPlan) cover.headline=value;
    }
    draft.content[field]=value;
    draft.dirty=true;
  });
}
export function setCreativeField(state: StudioState, field: CreativeField) { return changeStudioState(state, next => {
  const draft=current(next), fields=draft.content.fields ?? [];
  const index=fields.findIndex(item=>item.id.toLowerCase()===field.id.toLowerCase());
  if(index<0 && fields.length>=20)fail();
  draft.content.fields=index<0 ? [...fields,clone(field)] : fields.map((item,i)=>i===index?clone(field):item);
  if(!contentValid(draft.content))fail();
  draft.dirty=true;
}); }
export function removeCreativeField(state: StudioState, id: string) { return changeStudioState(state, next => {
  if(!uuid(id))fail(); const draft=current(next),fields=draft.content.fields;
  if(!fields?.some(field=>field.id.toLowerCase()===id.toLowerCase()))fail();
  draft.content.fields=fields.filter(field=>field.id.toLowerCase()!==id.toLowerCase());
  draft.dirty=true;
}); }
export function addMessage(state: StudioState, message: Omit<StudioMessage,"status"|"context"> & Partial<Pick<StudioMessage,"status"|"context">>) { return changeStudioState(state, next => { if (!keys(message,['id','role','text','createdAt'],['status','context','conversationId'])) fail(); const draft=next.selection?current(next):null; next.messages.push({...clone(message),context:message.context??(draft?{pieceId:draft.pieceId,baseVersion:draft.baseVersion,expectedLatestVersion:draft.expectedLatestVersion}:null),status:message.status??'completed'}); }); }
export function addMark(state: StudioState, mark: (Omit<Extract<StudioMark,{kind:"area"}>,"pieceId"|"baseVersion">|Omit<Extract<StudioMark,{kind:"element"}>,"pieceId"|"baseVersion">)) { return changeStudioState(state, next => { const draft=current(next); const value={...clone(mark),pieceId:draft.pieceId,baseVersion:draft.baseVersion}; if (!markValid(value)) fail(); next.marks.push(value); }); }
export const removeMark = (state: StudioState, id: string) => changeStudioState(state, next => { if(!uuid(id))fail(); next.marks=next.marks.filter(mark=>mark.id!==id); });
export const addReference = (state: StudioState, reference: StudioReference) => changeStudioState(state, next => { if(!referenceInProject(reference,next.projectId))fail(); next.references.push(clone(reference)); next.projectReferenceIds.push(reference.id); });
export const removeReference = (state: StudioState, id: string) => changeStudioState(state, next => { if(!uuid(id))fail(); next.projectReferenceIds=next.projectReferenceIds.filter(item=>item!==id); for(const post of Object.values(next.posts)){post.referenceIds=post.referenceIds.filter(item=>item!==id);post.excludedReferenceIds=post.excludedReferenceIds.filter(item=>item!==id);} next.references=next.references.filter(item=>item.id!==id); });

export function prepareAdjustment(state: StudioState, {requestId,messageId,instruction,createdAt,eventId,origin='user',conversationId}: {requestId:string;messageId:string;instruction:string;createdAt:string;eventId:string;origin?:'user'|'system';conversationId?:string}) { return changeStudioState(state, next => { const draft=current(next); if(origin==='system'&&instruction!==REFERENCE_SELECTION_EVENT)fail(); if (!uuid(requestId)||!uuid(messageId)||!text(instruction,4000,false)||!iso(createdAt))fail(); if(next.adjustments.some(item=>!['completed','failed'].includes(item.status)))throw new StudioStateError('studio_operation_active'); const conversation=conversationId??(origin==='system'?'references':draft.pieceId); if(origin==='user'&&conversation!=='references'){const post=next.posts[conversation]??(next.posts[conversation]=emptyPostSettings());if(!post.message)post.message=instruction;} const context={conversationId:conversation,projectId:next.projectId,pieceId:draft.pieceId,baseVersion:draft.baseVersion,expectedLatestVersion:draft.expectedLatestVersion,instruction,marks:clone(next.marks.filter(mark=>sameDraft(mark,draft))),references:clone(effectiveReferences(next,conversation)),...(conversation!=='references'?{postContext:postContext(next,conversation)}:{}),approval:clone(draft.approval),direction:clone(conversationDirection(next,conversation))}; next.messages.push({conversationId:conversation,id:messageId,role:origin,text:instruction,createdAt,context:{pieceId:draft.pieceId,baseVersion:draft.baseVersion,expectedLatestVersion:draft.expectedLatestVersion},status:'pending'}); next.adjustments.push({id:requestId,messageId,createdAt,status:'pending',context}); event(next,'context_frozen',requestId,eventId); }); }
export function settleAdjustment(state: StudioState, {requestId,status,result,eventId,createdAt}: {requestId:string;status:RequestStatus;result?:AdjustmentResult;eventId:string;createdAt?:string}) { return changeStudioState(state, next => { const request=next.adjustments.find(item=>item.id===requestId); if(!request||!requestStates.includes(status)||status==='pending')fail(); if(['completed','failed'].includes(request.status))throw new StudioStateError('studio_operation_terminal'); if(result!==undefined && (!resultValid(result)||Object.hasOwn(result,'text')&&status!=='completed'))fail(); request.status=status; const message=next.messages.find(item=>item.id===request.messageId); if (!message) fail(); message.status=status; if(result!==undefined){request.result={...request.result,...clone(result)}; if(Object.hasOwn(result,'text')){if(!uuid(result.messageId)||!iso(createdAt)||typeof result.text!=='string')fail();next.messages.push({...(request.context.conversationId?{conversationId:request.context.conversationId}:{}),id:result.messageId,role:'assistant',text:result.text,createdAt,context:{pieceId:request.context.pieceId,baseVersion:request.context.baseVersion,expectedLatestVersion:request.context.expectedLatestVersion},status:'completed'});}} event(next,({in_progress:'operation_in_progress',consent_required:'action_required',completed:'operation_completed',failed:'operation_failed',unknown:'outcome_unknown'} as const)[status],requestId,eventId); }); }
/** Automatic turns do not answer an earlier selection question; a person's message or a newly selected image does. */
export function pendingSelectionQuestion(state: StudioState, conversationId?:string): string|null {
  for(let index=state.messages.length-1;index>=0;index--){
    const message=state.messages[index];
    const sourceTurn=state.adjustments.find(item=>item.result?.messageId===message.id);
    const fromReferences=message.role==='system'||Boolean(sourceTurn&&state.messages.find(item=>item.id===sourceTurn.messageId)?.role==='system');
    if(conversationId!==undefined && (message.conversationId??(fromReferences?'references':message.context?.pieceId))!==conversationId)continue;
    if(message.role==='user')return null;
    if(message.role!=='assistant')continue;
    const turn=state.adjustments.find(item=>item.result?.messageId===message.id);
    if(!turn||state.messages.find(item=>item.id===turn.messageId)?.role!=='system')continue;
    const known=new Set(turn.context.references.map(item=>item.id));
    return state.references.every(item=>known.has(item.id))?message.id:null;
  }
  return null;
}
export function approveDraft(state: StudioState, {at,eventId}: {at:string;eventId:string}) { return changeStudioState(state, next => { const draft=current(next); if(!iso(at))fail();if(draft.baseVersion===0||draft.dirty)throw new StudioStateError('studio_unsaved_draft');draft.approval={status:'approved',kind:'explicit',sourceVersion:draft.baseVersion,at};event(next,'approval_explicit',null,eventId); }); }
export function inheritApproval(approval: Approval, baseVersion: number): Approval { if(!approvalForBase(approval,baseVersion)||!integer(baseVersion))fail();return freeze(approval.status==='approved'?{status:'approved',kind:'inherited',sourceVersion:baseVersion,at:approval.at}:noApproval()); }
export function recordSavedVersion(state: StudioState, {pieceId,baseVersion,version,content,sourceContent=content,eventId,approval}: {pieceId:string;baseVersion:number;version:number;content:PieceContent;sourceContent?:PieceContent;eventId:string;approval?:Approval}) {
  parseStudioState(state);
  if(approval!==undefined&&(!integer(version,1)||!approvalForBase(approval,version)))fail();
  const prior=state.drafts.find(item=>item.pieceId===pieceId&&item.baseVersion===version);
  if(prior&&sameContent(prior.content,content)&&state.events.some(item=>item.id===eventId&&item.type==='version_saved'))return state;
  return changeStudioState(state,next=>{
    const draft=next.drafts.find(item=>item.pieceId===pieceId&&item.baseVersion===baseVersion);
    if(!draft||!integer(version,1)||version!==draft.expectedLatestVersion+1||!contentValid(content)||next.drafts.some(item=>item.pieceId===pieceId&&item.baseVersion===version))throw new StudioStateError('studio_version_conflict');
    const unchanged=sameContent(draft.content,sourceContent),value={pieceId,baseVersion:version,expectedLatestVersion:version,content:clone(unchanged?content:draft.content),dirty:!unchanged,approval:approval===undefined?inheritApproval(draft.approval,baseVersion):clone(approval),creationContext:clone(draft.creationContext??{postContext:postContext(next,pieceId),references:[]})};
    next.drafts.push(value);
    if(unchanged)draft.dirty=false;
    if(next.selection&&sameDraft(next.selection,draft))next.selection={pieceId,baseVersion:version};
    event(next,'version_saved',null,eventId);
  });
}
