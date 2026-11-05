import { parseImageProposal } from './image-proposal.mjs';
import {AGENT_STUDIO_TOOLS,parseStudioAction} from './studio-chat-tools.mjs';
import {isAgentCallId} from './agent-call-id.mjs';

const knownNames=new Set(AGENT_STUDIO_TOOLS.map(tool=>tool.name));
const knownKeys=new Set(AGENT_STUDIO_TOOLS.flatMap(tool=>Object.keys(tool.parameters.properties)));
const statuses=new Set(['in_progress','completed','failed','incomplete']);
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
function toolName(value){
 if(typeof value!=='string')return {name:null,canonical:null};
 if(knownNames.has(value))return {name:value,canonical:value};
 if(value.startsWith('functions.')&&knownNames.has(value.slice(10)))return {name:value,canonical:value.slice(10)};
 return {name:null,canonical:null};
}
function argumentsObject(value){
 try{if(typeof value==='string'){if(value.length>16000)return null;value=JSON.parse(value);}return value&&typeof value==='object'&&!Array.isArray(value)?value:null;}catch{return null;}
}
function schemaValid(name,args){
 if(!name||!args)return false;
 try{
  if(name==='generate_image'){parseImageProposal(args);return true;}
  parseStudioAction(name,args);return true;
 }catch{return false;}
}
function outputErrorText(item){
 let error=typeof item.error==='string'?item.error.slice(0,8192):'';
 if(!error&&typeof item.output==='string'&&item.output.length<=16000){
  try{const parsed=JSON.parse(item.output);if(typeof parsed?.error==='string')error=parsed.error.slice(0,8192);else if(parsed?.error&&typeof parsed.error==='object')error=[parsed.error.code,parsed.error.message].filter(value=>typeof value==='string').map(value=>value.slice(0,4096)).join(' ');}catch{}
 }
 if(!error&&['failed','incomplete'].includes(item.status)){
  if(typeof item.output==='string')error=item.output.slice(0,8192);
  else if(Array.isArray(item.output))error=item.output.slice(0,8).filter(part=>part?.type==='input_text'&&typeof part.text==='string').map(part=>part.text.slice(0,1024)).join(' ');
 }
 return error.slice(0,8192);
}
function outputErrorClass(error){
 if(!error)return 'none';
 if(/(?:^|[^a-z])(?:timeout|timed[ _-]?out|deadline[ _-]?exceeded)(?:$|[^a-z])/i.test(error))return 'timeout';
 if(/(?:^|[^a-z])(?:unavailable|not[ _-]available|not[ _-]enabled|tool[ _-]not[ _-]found|unknown[ _-]tool)(?:$|[^a-z])/i.test(error))return 'unavailable';
 return 'other';
}
function outputErrorSignals(error){
 // Text matches are diagnostic hints, not proof of a failure's cause.
 return {
  noResponse:/(?:^|[^a-z])(?:no[ _-](?:tool[ _-])?(?:response|result)|(?:did[ _-]not|didn't|never|not)[ _-]respond(?:ed)?|(?:response|result)[ _-](?:not[ _-]received|missing)|missing[ _-](?:response|result))(?:$|[^a-z])/i.test(error),
  expired:/(?:^|[^a-z])(?:expired|expiry|expiration)(?:$|[^a-z])/i.test(error),
  invalidOrMalformed:/(?:^|[^a-z])(?:invalid|malformed|parse[ _-]error|validation[ _-]error)(?:$|[^a-z])/i.test(error),
  permissionDenied:/(?:^|[^a-z])(?:permission[ _-]denied|access[ _-]denied|unauthorized|forbidden|not[ _-](?:authorized|allowed|permitted)|(?:authorization|approval)[ _-]required)(?:$|[^a-z])/i.test(error),
  interrupted:/(?:^|[^a-z])(?:interrupted|cancelled|canceled|aborted|stopped|shutdown|disconnected)(?:$|[^a-z])/i.test(error),
  providerInternal:/(?:^|[^a-z])(?:internal[ _-](?:server[ _-])?error|(?:server|provider|service|upstream)[ _-]error)(?:$|[^a-z])/i.test(error),
 };
}

/** Closed fields only: never return provider text, argument values, IDs or unknown names/keys. */
export function summarizeStudioItems(items,{projectId,turnId}={}){
 const scoped=Array.isArray(items)?items.slice(0,100).filter(item=>item?.turn_id===turnId):[];
 const names=new Map();
 for(const item of scoped)if(item.type==='function_call'&&typeof item.call_id==='string'&&item.call_id.length<=256)names.set(item.call_id,toolName(item.name));
 const rows=[];let functionCalls=0,outputs=0;
 for(const item of scoped){
  const status=statuses.has(item.status)?item.status:'other';
  if(item.type==='function_call'){
   functionCalls++;const {name,canonical}=toolName(item.name),args=argumentsObject(item.arguments),keys=args?Object.keys(args):[];
   rows.push({type:'function_call',status,name,callIdAccepted:isAgentCallId(item.call_id),argumentKeys:keys.filter(key=>knownKeys.has(key)).sort(),unknownArgumentKeyCount:Math.min(1000,keys.filter(key=>!knownKeys.has(key)).length),argumentsParsed:Boolean(args),requestIdUuid:uuid(args?.requestId),projectMatches:typeof projectId==='string'&&args?.projectId===projectId,revisionIsInteger:Number.isSafeInteger(args?.revision),schemaValid:schemaValid(canonical,args)});
  }else if(item.type==='function_call_output'){
   const error=outputErrorText(item);outputs++;rows.push({type:'function_call_output',status,name:names.get(item.call_id)?.name??null,callIdAccepted:isAgentCallId(item.call_id),errorClass:outputErrorClass(error),errorSignals:outputErrorSignals(error)});
  }
 }
 return {observedItems:scoped.length,functionCalls,outputs,omittedItems:Math.max(0,rows.length-24),items:rows.slice(0,24)};
}
