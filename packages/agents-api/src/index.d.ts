import type {RequestHandler,McpTool} from './contracts.js';
import type {ImageProposal} from './image-proposal.js';
export function pendingImageAction(session:unknown,key:string,delegated?:string):{prompt:string;proposal:ImageProposal;sessionId:string;turnId:string;callId:string};
export function createAgentHandler(options:{authenticate:(request:Request)=>Promise<{userId:string}|null>;fetch?:typeof fetch;enableImageTool?:boolean;mcpTool?:McpTool;onSession?:(sessionId:string)=>Promise<void>}):RequestHandler;
