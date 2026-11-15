import {z} from 'zod';
import type {StoreContext,StoreOptions} from './web-contracts';
import {postCreationSchema,postDeletionSchema,postMutationSchema,postRecordSchema} from './post-catalog';

export function createPostStore({url,anonKey,fetchImpl=fetch}:StoreOptions){
  async function rpc(context:StoreContext,name:string,body:unknown):Promise<unknown>{
    const response=await fetchImpl(new URL(`/rest/v1/rpc/${name}`,url),{method:'POST',headers:{apikey:anonKey,authorization:`Bearer ${context.token}`,'content-type':'application/json'},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(5000)});
    if(!response.ok)throw Error('unavailable');return response.json();
  }
  return {
    async list(context:StoreContext,projectId:string){
      const records=z.array(postRecordSchema).max(1000).parse(await rpc(context,'list_project_posts',{p_project_id:projectId}));
      if(records.some(row=>row.projectId!==projectId)||new Set(records.map(row=>row.pieceId)).size!==records.length)throw Error('invalid response');
      return records;
    },
    async mutate(context:StoreContext,method:'POST'|'DELETE',input:unknown){
      const data=method==='POST'?postCreationSchema.parse(input):postDeletionSchema.parse(input);
      const result=postMutationSchema.parse(await rpc(context,method==='POST'?'create_project_post':'delete_project_post',{p_project_id:data.projectId,p_piece_id:data.pieceId,...('name' in data?{p_name:data.name}:{})}));
      if('post' in result&&(result.post.projectId!==data.projectId||result.post.pieceId!==data.pieceId||result.status!==(method==='POST'?'created':'deleted')||result.post.deleted!==(method==='DELETE')||'name' in data&&result.post.name!==data.name))throw Error('invalid response');
      return result;
    },
  };
}
