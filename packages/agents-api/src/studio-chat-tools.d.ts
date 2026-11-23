import type {JsonSchema} from './contracts.js';
import type {PostFormat} from './creative-skills/index.js';
interface Scope {projectId:string;revision:number;requestId:string}
export type CarouselCompositionMode = 'editorial_art' | 'native_serial';
export interface CarouselCompositionTokens { light?: string; dark?: string; accent?: string }
type DiagramShape = 'flow' | 'balance' | 'steps' | 'focus';
type CompositionDiagram = DiagramShape
  | { type: DiagramShape; labels: string[] }
  | { type: 'contrast' | 'type_scale'; labels: string[]; sample: string }
  | { type: 'hierarchy'; labels: string[]; items: string[] }
  | { type: 'category_split'; labels: [string, string]; items: [string, string] }
  | { type: 'orientation'; labels: ['Em pé', 'De cabeça para baixo']; sample: string }
  | { type: 'readability_matrix' | 'spacing' | 'shape_scale' | 'shape_grouping' };
export interface CarouselSlideComposition {
  layout: 'hero_bleed' | 'split_horizontal' | 'split_vertical' | 'framed_plate' | 'stat_monument'
    | 'svg_diagram' | 'comparison_dual' | 'bento_grid' | 'artifact_proof' | 'typo_breather' | 'native_serial' | 'cta_closing';
  alt: string;
  polarity?: 'base' | 'inverted';
  diagram?: CompositionDiagram;
  kicker?: string;
  listItems?: string[];
  source?: string;
  accentPhrase?: string;
  figure?: string;
  bridge?: 'hairline_thread' | 'color_band_echo';
}
export interface FramePlanInput {id?:string;position:number;role:string;headline:string;body:string;visualCue:string;composition?:CarouselSlideComposition}
type CompositionDeckContext = {mode:string;slideCount:number};
export function isCarouselSlideComposition(value:unknown,deck?:CompositionDeckContext):value is CarouselSlideComposition;
export function allowsCarouselSemanticDiagram(diagram:unknown,layout:unknown,hasRaster?:boolean,deck?:CompositionDeckContext):boolean;
export function isCarouselCompositionTokens(value:unknown):value is CarouselCompositionTokens;
export interface ActionInputByName {
 compor_contexto: Omit<Scope,'revision'> & {revision?:number};
 compor_editar_briefing: Scope & {field:'offer'|'audience'|'action'|'direction';value:string};
 compor_editar_voz: Scope & {field:'tone'|'examples'|'avoid';value:string};
 compor_editar_persona: Scope & {field:'audience'|'situation'|'need'|'culturalReferences';value:string};
 compor_registrar_afirmacao_persona: Scope & {text:string;provenance:'hypothesis'|'creator_report'|'buyer_report'|'public_source';source?:string};
 compor_propor_criterio: Scope & {viewpoint:'creator'|'recipient';dimension:'visual'|'message';statement:string;example:string;counterexample:string;exampleReferenceId:string;counterexampleReferenceId:string;provenance:'hypothesis'|'creator_report'|'buyer_report'|'public_source';source:string;tension:string};
 compor_registrar_feedback_visual: Scope & {referenceId:string;action:'selected'|'rejected'|'comment';quote:string};
 compor_comentar_imagem_gerada: Scope & {ordinal:number;quote:string};
 compor_novo_post: Scope;
 compor_definir_formato: Scope & {pieceId:string;format:PostFormat;frameCount?:number};
 compor_definir_plano_laminas: Scope & {pieceId:string;baseVersion:number;visualInvariants:string;frames:FramePlanInput[];compositionMode?:CarouselCompositionMode;compositionTokens?:CarouselCompositionTokens};
 compor_editar_lamina: Scope & {pieceId:string;baseVersion:number;frameId:string;field:'role'|'headline'|'body'|'visualCue';value:string};
 compor_editar_peca: Scope & {pieceId:string;baseVersion:number;field:'headline'|'price'|'date'|'caption';value:string};
 compor_adicionar_campo: Scope & {pieceId:string;baseVersion:number;label:string};
 compor_abrir_versao: Scope & {pieceId:string;version:number};
 compor_salvar_versao: Scope & {pieceId:string;baseVersion:number;expectedLatestVersion:number};
 compor_renomear_projeto: Scope & {title:string};
 compor_propor_imagem: Scope & {prompt:string};
}
/** Longest project title the agent may propose and the provisional cut of the idea. Manual renames and the database accept 200. */
export const SHORT_PROJECT_TITLE_LENGTH:48;
export type StudioActionName=keyof ActionInputByName;
export type StudioAction=ActionInputByName[StudioActionName];
export interface StudioTool {readonly name:StudioActionName;readonly description:string;readonly inputSchema:JsonSchema & {properties:Readonly<Record<string,JsonSchema>>;required:readonly string[]};readonly annotations:{readOnlyHint:boolean;consequentialHint:boolean}}
export const STUDIO_TOOLS:readonly StudioTool[];
export const AGENT_STUDIO_TOOLS:readonly {type:'function';name:StudioActionName|'generate_image';description:string;parameters:JsonSchema}[];
export function parseStudioAction<Name extends StudioActionName>(name:Name,value:unknown):ActionInputByName[Name];
export function parseStudioAction(name:string,value:unknown):StudioAction;
