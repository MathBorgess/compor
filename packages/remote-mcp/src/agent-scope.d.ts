import type {Buffer} from 'node:buffer';
import type {Authenticate,Principal,PieceStore} from './index.js';
export interface AgentScope {issue(input:{token:string;projectId:string}):Promise<string|null>;handle(request:Request):Promise<Response>}
export interface AgentMcpTool {type:'mcp';server_label:'compor';connection_origin:'service';required:true;allowed_tools:string[];transport:{type:'http';server_url:string;authorization:string}}
export function createAgentScope(options:{secret:Buffer;authenticate:Authenticate;ownsProject:(actor:Principal,projectId:string,token:string)=>Promise<boolean>;pieceStore:Pick<PieceStore,'list'|'save'>;now?:()=>number}):AgentScope;
export function withAgentMcpTool(options:{appOrigin:string;scope:Pick<AgentScope,'issue'>;token:string;projectId:string},submit:(tool:AgentMcpTool)=>Promise<void>):Promise<{status:'invoked'|'unavailable'}|{status:'result_unknown';retryAutomatically:false}>;
