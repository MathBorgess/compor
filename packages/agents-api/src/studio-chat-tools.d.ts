import type {JsonSchema} from './contracts.js';
interface Scope {projectId:string;revision:number;requestId:string}
export interface ActionInputByName {
 compor_contexto: Omit<Scope,'revision'> & {revision?:number};
 compor_editar_briefing: Scope & {field:'offer'|'audience'|'action'|'direction';value:string};
 compor_editar_persona: Scope & {field:'audience'|'situation'|'need'|'culturalReferences';value:string};
 compor_registrar_afirmacao_persona: Scope & {text:string;provenance:'hypothesis'|'creator_report'|'buyer_report'|'public_source';source?:string};
 compor_propor_criterio: Scope & {viewpoint:'creator'|'recipient';dimension:'visual'|'message';statement:string;example:string;counterexample:string;exampleReferenceId:string;counterexampleReferenceId:string;provenance:'hypothesis'|'creator_report'|'buyer_report'|'public_source';source:string;tension:string};
 compor_registrar_feedback_visual: Scope & {referenceId:string;action:'selected'|'rejected'|'comment';quote:string};
 compor_comentar_imagem_gerada: Scope & {ordinal:number;quote:string};
 compor_novo_post: Scope;
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
