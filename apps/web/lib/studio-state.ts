import {studioStateSchema, type StudioState, type StudioDraft, type PieceContent, type Approval, type DraftContext, type StudioReference, type StudioMark, type AdjustmentContext, type Adjustment, type AdjustmentResult, type ActionResult, type ActionReceipt, type StudioMessage, type StudioEvent, type CreativeCriterion, type CreativeDecision, type Persona, type Brief, type RequestStatus} from './studio-domain.ts';
export type * from './studio-domain.ts';
import { parseDirection, proposeCriterion, decideCriterion } from './studio-direction.ts';
export const STUDIO_SCHEMA_VERSION = 1;
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
const contentValid = (value: PieceContent) => keys(value, ['headline','price','date','caption','captionOrigin']) && text(value.headline, 500) && text(value.price, 100) && text(value.date, 100) && text(value.caption, 4000) && ['user','agent'].includes(value.captionOrigin);
const sameContent = (left: PieceContent, right: PieceContent) => contentValid(left) && contentValid(right) && Object.entries(left).every(([field,value]) => value === Reflect.get(right,field));
const approvalValid = (value: Approval) => keys(value, ['status'], ['kind','sourceVersion','at']) && (value.status === 'unapproved' ? Object.keys(value).length === 1 : value.status === 'approved' && ['explicit','inherited'].includes(value.kind) && integer(value.sourceVersion,1) && iso(value.at));
const approvalForBase = (value: Approval,baseVersion: number) => approvalValid(value) && (value.status==='unapproved'||value.sourceVersion<=baseVersion&&(value.kind==='inherited'||value.sourceVersion===baseVersion));
const sameDraft = (a: Partial<Pick<StudioDraft,"pieceId"|"baseVersion">>, b: Partial<Pick<StudioDraft,"pieceId"|"baseVersion">>) => a.pieceId === b.pieceId && a.baseVersion === b.baseVersion;
const contextValid = (value: DraftContext) => keys(value, ['pieceId','baseVersion','expectedLatestVersion']) && uuid(value.pieceId) && integer(value.baseVersion) && integer(value.expectedLatestVersion) && value.baseVersion <= value.expectedLatestVersion;
const referenceValid = (value: StudioReference) => keys(value, ['id','name','mime','size','width','height']) && uuid(value.id) && text(value.name, 200, false) && ['image/png','image/jpeg'].includes(value.mime) && integer(value.size, 1) && value.size <= STUDIO_LIMITS.referenceBytes && integer(value.width, 1) && integer(value.height, 1) && value.width * value.height <= 40_000_000;
const markValid = (value: StudioMark) => keys(value, ['id','pieceId','baseVersion','kind','note'], ['x','y','width','height','elementId']) && uuid(value.id) && uuid(value.pieceId) && integer(value.baseVersion) && text(value.note, 2000) && (value.kind === 'area' ? Object.keys(value).length === 9 && (['x','y','width','height'] as const).every(key => Number.isFinite(value[key]) && value[key] >= 0 && value[key] <= 1) && value.width > 0 && value.height > 0 && value.x + value.width <= 1.000000001 && value.y + value.height <= 1.000000001 : value.kind === 'element' && Object.keys(value).length === 6 && text(value.elementId, 100, false));
const freeze = <T>(value: T): T => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const clone = <T>(value: T): T => structuredClone(value);
const blankContent = (): PieceContent => ({ headline: '', price: '', date: '', caption: '', captionOrigin: 'user' });
const noApproval = (): Approval => ({ status: 'unapproved' });
const requestStates: RequestStatus[] = ['pending','in_progress','consent_required','completed','failed','unknown'];
const actionResultValid = (value: ActionResult,projectId: string) => keys(value,['status'],['revision','projectId','pieceId','baseVersion','expectedLatestVersion','version','unsaved','local','title']) && ['completed','declined','unknown','pending_confirmation'].includes(value.status) && (!Object.hasOwn(value,'revision')||integer(value.revision)) && (!Object.hasOwn(value,'projectId')||value.projectId===projectId) && (!Object.hasOwn(value,'pieceId')||value.pieceId===null||uuid(value.pieceId)) && (!Object.hasOwn(value,'baseVersion')||value.baseVersion===null||integer(value.baseVersion)) && (!Object.hasOwn(value,'expectedLatestVersion')||integer(value.expectedLatestVersion)) && (!Object.hasOwn(value,'version')||integer(value.version,1)) && (['unsaved','local'] as const).every(key=>!Object.hasOwn(value,key)||typeof value[key]==='boolean') && (!Object.hasOwn(value,'title')||text(value.title,200,false));
const actionReceiptValid = (value: ActionReceipt,projectId: string) => keys(value,['requestId','fingerprint','result']) && uuid(value.requestId) && typeof value.fingerprint==='string' && /^[0-9a-f]{64}$/.test(value.fingerprint) && actionResultValid(value.result,projectId);
const sameActionResult = (left: ActionResult,right: ActionResult) => Object.keys(left).length===Object.keys(right).length && Object.keys(left).every(key=>Object.hasOwn(right,key)&&Reflect.get(left,key)===Reflect.get(right,key));

export function parseStudioState(input: unknown): StudioState {
  if (!plain(input)) fail();
  const shape = studioStateSchema.safeParse(input);
  if (!shape.success) fail();
  const value = shape.data;
  if (!keys(value, ['schemaVersion','userId','projectId','revision','brief','persona','selection','drafts','messages','marks','references','adjustments','events'],['actionReceipts','direction']) || value.schemaVersion !== STUDIO_SCHEMA_VERSION || !uuid(value.userId) || !uuid(value.projectId) || !integer(value.revision)) fail();
  if (!keys(value.brief, ['offer','audience','action','direction']) || !Object.values(value.brief).every(item => text(item, 4000))) fail();
  const persona = value.persona;
  if (!keys(persona, ['audience','situation','need','culturalReferences','claims']) || !(['audience','situation','need'] as const).every(key => text(persona[key], 2000)) || !text(persona.culturalReferences, 4000) || !Array.isArray(persona.claims) || persona.claims.length > 100 || !unique(persona.claims) || !persona.claims.every(item => keys(item, ['id','text','provenance','source']) && uuid(item.id) && text(item.text, 2000) && text(item.source, 2000) && ['hypothesis','creator_report','buyer_report','public_source','unknown'].includes(item.provenance))) fail();
  for (const [field, limit] of [["drafts",100],["messages",200],["marks",200],["references",20],["adjustments",100],["events",500]] as const) if (!Array.isArray(value[field]) || value[field].length > limit) fail();
  if (!value.drafts.every(item => keys(item, ['pieceId','baseVersion','expectedLatestVersion','content','dirty','approval']) && contextValid({pieceId:item.pieceId,baseVersion:item.baseVersion,expectedLatestVersion:item.expectedLatestVersion}) && contentValid(item.content) && typeof item.dirty === 'boolean' && approvalForBase(item.approval,item.baseVersion)) || !unique(value.drafts, item => `${item.pieceId}:${item.baseVersion}`)) fail();
  if (value.selection !== null && (!keys(value.selection, ['pieceId','baseVersion']) || !value.drafts.some(item => sameDraft(item, value.selection??{})))) fail();
  if (!unique(value.messages) || !value.messages.every(item => keys(item, ['id','role','text','createdAt','context','status']) && uuid(item.id) && ['user','assistant'].includes(item.role) && text(item.text, 16_000) && iso(item.createdAt) && (item.context === null || contextValid(item.context)) && requestStates.includes(item.status))) fail();
  if (!unique(value.marks) || !value.marks.every(markValid) || !value.marks.every(mark => value.drafts.some(draft => sameDraft(draft, mark)))) fail();
  if (!unique(value.references) || !value.references.every(referenceValid) || value.references.reduce((sum, item) => sum + item.size, 0) > STUDIO_LIMITS.referenceTotalBytes) fail();
  if (!unique(value.adjustments) || !value.adjustments.every(item => adjustmentValid(item,value))) fail();
  if (!unique(value.events) || !value.events.every((item,index) => keys(item, ['id','type','requestId','sequence']) && uuid(item.id) && ['context_frozen','operation_in_progress','action_required','operation_completed','operation_failed','outcome_unknown','version_saved','approval_explicit'].includes(item.type) && (item.requestId === null || uuid(item.requestId) && value.adjustments.some(request=>request.id===item.requestId)) && item.sequence === index + 1)) fail();
  const actionReceipts=Object.hasOwn(value,'actionReceipts')?value.actionReceipts:[];
  if(!Array.isArray(actionReceipts)||actionReceipts.length>STUDIO_LIMITS.actionReceipts||!unique(actionReceipts,item=>item.requestId)||!actionReceipts.every(item=>actionReceiptValid(item,value.projectId)))fail();
  const normalized={...value,actionReceipts,direction:parseDirection(value.direction)};
  if (new TextEncoder().encode(JSON.stringify(normalized)).byteLength > STUDIO_LIMITS.stateBytes) throw new StudioStateError('studio_state_limit');
  return freeze(clone(normalized));
}
function resultValid(value: AdjustmentResult) { return keys(value, [], ['messageId','text','assetId']) && Object.keys(value).length>0 && (!Object.hasOwn(value, 'messageId') || Object.hasOwn(value,'text') && uuid(value.messageId)) && (!Object.hasOwn(value, 'text') || uuid(value.messageId) && text(value.text, 16_000)) && (!Object.hasOwn(value, 'assetId') || uuid(value.assetId)); }
function adjustmentValid(item: Adjustment,state: StudioState) {
  if(!keys(item,['id','messageId','createdAt','status','context'],['result']) || !uuid(item.id) || !uuid(item.messageId) || !iso(item.createdAt) || !requestStates.includes(item.status) || !adjustmentContextValid(item.context,state.projectId))return false;
  const message=state.messages.find(message=>message.id===item.messageId);
  if(!message || message.role!=='user' || message.text!==item.context.instruction || message.createdAt!==item.createdAt || message.context?.pieceId!==item.context.pieceId || message.context?.baseVersion!==item.context.baseVersion || message.context?.expectedLatestVersion!==item.context.expectedLatestVersion)return false;
  if(!Object.hasOwn(item,'result'))return true;
  if(!item.result)return false;
  if(!resultValid(item.result) || Object.hasOwn(item.result,'text')&&item.status!=='completed')return false;
  if(!Object.hasOwn(item.result,'text'))return true;
  return state.messages.some(message=>message.id===item.result?.messageId&&message.role==='assistant'&&message.text===item.result?.text&&sameDraft(message.context??{},item.context)&&message.context?.expectedLatestVersion===item.context.expectedLatestVersion);
}
function adjustmentContextValid(value: AdjustmentContext, projectId: string) { return keys(value, ['projectId','pieceId','baseVersion','expectedLatestVersion','instruction','marks','references','approval'], ['direction']) && (!Object.hasOwn(value,'direction') || Boolean(parseDirection(value.direction))) && value.projectId === projectId && contextValid({pieceId:value.pieceId,baseVersion:value.baseVersion,expectedLatestVersion:value.expectedLatestVersion}) && text(value.instruction, 4000, false) && Array.isArray(value.marks) && value.marks.length <= 200 && unique(value.marks) && value.marks.every(mark => markValid(mark) && sameDraft(mark, value)) && Array.isArray(value.references) && value.references.length <= 20 && unique(value.references) && value.references.every(referenceValid) && value.references.reduce((sum,item)=>sum+item.size,0)<=STUDIO_LIMITS.referenceTotalBytes && approvalForBase(value.approval,value.baseVersion); }
function change(state: StudioState, action: (state: StudioState)=>void) { const next = clone(parseStudioState(state)); action(next); next.revision++; return parseStudioState(next); }
function current(state: StudioState) { const draft = state.drafts.find(item => state.selection && sameDraft(item, state.selection)); if (!draft) throw new StudioStateError('studio_no_selection'); return draft; }
function event(state: StudioState, type: StudioEvent["type"], requestId: string|null, id: string) { if (!uuid(id)) fail(); if (state.events.length >= STUDIO_LIMITS.events) throw new StudioStateError('studio_state_limit'); state.events.push({id,type,requestId,sequence:state.events.length + 1}); }

export function createStudioState({userId,projectId}: {userId:string;projectId:string}) { return parseStudioState({schemaVersion:1,userId,projectId,revision:0,brief:{offer:'',audience:'',action:'',direction:''},persona:{audience:'',situation:'',need:'',culturalReferences:'',claims:[]},selection:null,drafts:[],messages:[],marks:[],references:[],adjustments:[],events:[]}); }
export const getCurrentDraft = (state: StudioState) => { parseStudioState(state); return state.selection ? freeze(clone(current(state))) : null; };
export function selectDraft(state: StudioState, {pieceId,baseVersion}: Pick<StudioDraft,"pieceId"|"baseVersion">) { return change(state,next=>{if(!uuid(pieceId)||!integer(baseVersion)||!next.drafts.some(item=>item.pieceId===pieceId&&item.baseVersion===baseVersion))throw new StudioStateError('studio_draft_unavailable');next.selection={pieceId,baseVersion};}); }
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
  return change(state,next=>{const existing=next.actionReceipts.find(item=>item.requestId===receipt.requestId);if(existing)existing.result=clone(receipt.result);else next.actionReceipts.push(clone(receipt));});
}
export const updateBrief = (state: StudioState, patch: Partial<Brief>) => change(state, next => { if (!plain(patch) || !Object.keys(patch).length || !Object.keys(patch).every(key => Object.hasOwn(next.brief,key))) fail(); Object.assign(next.brief,patch); });
export const updatePersona = (state: StudioState, patch: Partial<Persona>) => change(state, next => { if (!plain(patch) || !Object.keys(patch).length || !Object.keys(patch).every(key => Object.hasOwn(next.persona,key))) fail(); Object.assign(next.persona,clone(patch)); });
export const addCreativeCriterion = (state: StudioState, criterion: CreativeCriterion) => change(state, next => { next.direction=proposeCriterion(next.direction,criterion); });
export const recordCreativeDecision = (state: StudioState, decision: CreativeDecision) => change(state, next => { next.direction=decideCriterion(next.direction,decision); });
export function createPost(state: StudioState, {pieceId}: {pieceId:string}) { parseStudioState(state); if(!uuid(pieceId))fail();if(state.drafts.some(item=>item.pieceId===pieceId))return state;return change(state, next => { next.drafts.push({pieceId,baseVersion:0,expectedLatestVersion:0,content:blankContent(),dirty:false,approval:noApproval()}); next.selection={pieceId,baseVersion:0}; }); }
export function selectVersion(state: StudioState, {pieceId,version,latestVersion,content,approval = noApproval()}: {pieceId:string;version:number;latestVersion:number;content:PieceContent;approval?:Approval}) {
  return change(state, next => {
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
export function editDraft(state: StudioState, {field,value}: {field:Exclude<keyof PieceContent,"captionOrigin">;value:string}) { return change(state, next => { const draft=current(next); if (!['headline','price','date','caption'].includes(field)) fail(); draft.content[field]=value; if(field==='caption')draft.content.captionOrigin='user'; draft.dirty=true; }); }
export function addMessage(state: StudioState, message: Omit<StudioMessage,"status"|"context"> & Partial<Pick<StudioMessage,"status"|"context">>) { return change(state, next => { if (!keys(message,['id','role','text','createdAt'],['status','context'])) fail(); const draft=next.selection?current(next):null; next.messages.push({...clone(message),context:message.context??(draft?{pieceId:draft.pieceId,baseVersion:draft.baseVersion,expectedLatestVersion:draft.expectedLatestVersion}:null),status:message.status??'completed'}); }); }
export function addMark(state: StudioState, mark: (Omit<Extract<StudioMark,{kind:"area"}>,"pieceId"|"baseVersion">|Omit<Extract<StudioMark,{kind:"element"}>,"pieceId"|"baseVersion">)) { return change(state, next => { const draft=current(next); const value={...clone(mark),pieceId:draft.pieceId,baseVersion:draft.baseVersion}; if (!markValid(value)) fail(); next.marks.push(value); }); }
export const removeMark = (state: StudioState, id: string) => change(state, next => { if(!uuid(id))fail(); next.marks=next.marks.filter(mark=>mark.id!==id); });
export const addReference = (state: StudioState, reference: StudioReference) => change(state, next => { if(!referenceValid(reference))fail(); next.references.push(clone(reference)); });
export const removeReference = (state: StudioState, id: string) => change(state, next => { if(!uuid(id))fail(); next.references=next.references.filter(item=>item.id!==id); });

export function prepareAdjustment(state: StudioState, {requestId,messageId,instruction,createdAt,eventId}: {requestId:string;messageId:string;instruction:string;createdAt:string;eventId:string}) { return change(state, next => { const draft=current(next); if (!uuid(requestId)||!uuid(messageId)||!text(instruction,4000,false)||!iso(createdAt))fail(); if(next.adjustments.some(item=>!['completed','failed'].includes(item.status)))throw new StudioStateError('studio_operation_active'); const context={projectId:next.projectId,pieceId:draft.pieceId,baseVersion:draft.baseVersion,expectedLatestVersion:draft.expectedLatestVersion,instruction,marks:clone(next.marks.filter(mark=>sameDraft(mark,draft))),references:clone(next.references),approval:clone(draft.approval),direction:clone(next.direction)}; next.messages.push({id:messageId,role:'user',text:instruction,createdAt,context:{pieceId:draft.pieceId,baseVersion:draft.baseVersion,expectedLatestVersion:draft.expectedLatestVersion},status:'pending'}); next.adjustments.push({id:requestId,messageId,createdAt,status:'pending',context}); event(next,'context_frozen',requestId,eventId); }); }
export function settleAdjustment(state: StudioState, {requestId,status,result,eventId,createdAt}: {requestId:string;status:RequestStatus;result?:AdjustmentResult;eventId:string;createdAt?:string}) { return change(state, next => { const request=next.adjustments.find(item=>item.id===requestId); if(!request||!requestStates.includes(status)||status==='pending')fail(); if(['completed','failed'].includes(request.status))throw new StudioStateError('studio_operation_terminal'); if(result!==undefined && (!resultValid(result)||Object.hasOwn(result,'text')&&status!=='completed'))fail(); request.status=status; const message=next.messages.find(item=>item.id===request.messageId); if (!message) fail(); message.status=status; if(result!==undefined){request.result={...request.result,...clone(result)}; if(Object.hasOwn(result,'text')){if(!uuid(result.messageId)||!iso(createdAt)||typeof result.text!=='string')fail();next.messages.push({id:result.messageId,role:'assistant',text:result.text,createdAt,context:{pieceId:request.context.pieceId,baseVersion:request.context.baseVersion,expectedLatestVersion:request.context.expectedLatestVersion},status:'completed'});}} event(next,({in_progress:'operation_in_progress',consent_required:'action_required',completed:'operation_completed',failed:'operation_failed',unknown:'outcome_unknown'} as const)[status],requestId,eventId); }); }
export function approveDraft(state: StudioState, {at,eventId}: {at:string;eventId:string}) { return change(state, next => { const draft=current(next); if(!iso(at))fail();if(draft.baseVersion===0||draft.dirty)throw new StudioStateError('studio_unsaved_draft');draft.approval={status:'approved',kind:'explicit',sourceVersion:draft.baseVersion,at};event(next,'approval_explicit',null,eventId); }); }
export function inheritApproval(approval: Approval, baseVersion: number): Approval { if(!approvalForBase(approval,baseVersion)||!integer(baseVersion))fail();return freeze(approval.status==='approved'?{status:'approved',kind:'inherited',sourceVersion:baseVersion,at:approval.at}:noApproval()); }
export function recordSavedVersion(state: StudioState, {pieceId,baseVersion,version,content,eventId,approval}: {pieceId:string;baseVersion:number;version:number;content:PieceContent;eventId:string;approval?:Approval}) {
  parseStudioState(state);
  if(approval!==undefined&&(!integer(version,1)||!approvalForBase(approval,version)))fail();
  const prior=state.drafts.find(item=>item.pieceId===pieceId&&item.baseVersion===version);
  if(prior&&sameContent(prior.content,content)&&state.events.some(item=>item.id===eventId&&item.type==='version_saved'))return state;
  return change(state,next=>{
    const draft=next.drafts.find(item=>item.pieceId===pieceId&&item.baseVersion===baseVersion);
    if(!draft||!integer(version,1)||version!==draft.expectedLatestVersion+1||!contentValid(content)||next.drafts.some(item=>item.pieceId===pieceId&&item.baseVersion===version))throw new StudioStateError('studio_version_conflict');
    const unchanged=sameContent(draft.content,content),value={pieceId,baseVersion:version,expectedLatestVersion:version,content:clone(content),dirty:false,approval:approval===undefined?inheritApproval(draft.approval,baseVersion):clone(approval)};
    next.drafts.push(value);
    if(unchanged){draft.dirty=false;if(next.selection&&sameDraft(next.selection,draft))next.selection={pieceId,baseVersion:version};}
    event(next,'version_saved',null,eventId);
  });
}
