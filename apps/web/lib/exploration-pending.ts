/** Reserve a local marker only while the session is current and before the request is sent. */
export function markBeforeDispatch(storage:Pick<Storage,'setItem'|'getItem'|'removeItem'>, key:string, value:string, current:()=>boolean):boolean {
  if (!current()) return false;
  storage.setItem(key,value);
  if (current()) return true;
  if (storage.getItem(key)===value) storage.removeItem(key);
  return false;
}
import * as z from './schema.ts';
import {pendingSchema} from './exploration-batch.ts';


/** Read-only consultation; never removes the marker or dispatches a generation. */
export async function inspectSerialPending({storage,userId,projectId,conversationId,fetchApi=fetch}:{storage:Pick<Storage,'getItem'>;userId:string;projectId:string;conversationId:string;fetchApi?:typeof fetch}):Promise<string>{
  const raw=storage.getItem(`compor-exploration-pending:${userId}`);
  if(raw===null)return 'Não há recibo pendente neste navegador.';
  const pending=pendingSchema.parse(JSON.parse(raw));
  if(pending.projectId!==projectId)return 'Abra o projeto de origem para consultar a tentativa.';
  if(!pending.conversationId)return 'A tentativa antiga não identifica a conversa de origem. O recibo foi preservado.';
  if(pending.conversationId!==conversationId)return 'Abra a conversa de origem para consultar a tentativa.';
  const response=await fetchApi(`/api/studio/explorations?${new URLSearchParams({projectId})}`,{cache:'no-store'});
  if(!response.ok)throw Error('inspection_unavailable');
  const rows=z.object({images:z.array(z.object({id:z.uuid(),project_id:z.uuid(),state:z.enum(['running','unknown','completed','rejected'])})).check(z.maxLength(100))}).parse(await response.json()).images;
  const row=rows.find(item=>item.id===pending.requestId&&item.project_id===projectId);
  return row?.state==='completed'?'A tentativa anterior foi confirmada. O recibo permanece preservado.':row?.state==='rejected'?'A tentativa anterior foi recusada. O recibo permanece preservado.':'A tentativa anterior ainda não foi confirmada. O recibo permanece preservado.';
}
