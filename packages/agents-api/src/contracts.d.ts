export interface Actor { userId: string; token: string }
export interface ProjectScope { actor: Actor; projectId: string }
export interface VersionScope extends ProjectScope { pieceId: string; version: number }
export interface AttemptScope extends ProjectScope { attemptId: string }
export interface RequestScope extends ProjectScope { requestId: string }
export interface StoreOptions { url: string; anonKey: string; fetch?: typeof fetch }
export type RequestHandler = (request: Request) => Promise<Response>;
export type ResolveActor = () => Promise<Actor | null>;
export type OwnsProject = (scope: ProjectScope) => Promise<boolean>;
export type OwnsVersion = (scope: VersionScope) => Promise<boolean>;
export interface TokenUsage { input_tokens?: number; output_tokens?: number; total_tokens?: number; input_tokens_details?: {text_tokens?: number; image_tokens?: number}; output_tokens_details?: {image_tokens?: number} }
export interface JsonSchema { readonly type?: string; readonly enum?: readonly (string | number | null)[]; readonly properties?: Readonly<Record<string, JsonSchema>>; readonly required?: readonly string[]; readonly additionalProperties?: boolean; readonly maxLength?: number; readonly minimum?: number; readonly maximum?: number; readonly items?: JsonSchema; readonly maxItems?: number; readonly anyOf?: readonly JsonSchema[] }
export interface McpTool { type: 'mcp'; server_label: string; connection_origin: 'service'; required: boolean; allowed_tools: string[]; transport: {type:'http';server_url:string;authorization:string} }
export type McpInvocation = {status:'invoked'|'unavailable'} | {status:'result_unknown';retryAutomatically:false};
