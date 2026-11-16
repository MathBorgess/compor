import {createServer} from 'node:https';
import {createHmac, timingSafeEqual, createHash} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';

export const ACTORS = Object.freeze({a:'11111111-1111-4111-8111-111111111111',b:'22222222-2222-4222-8222-222222222222'});
export const SYNTHETIC_KEY = 'sk-compor-offline-synthetic-provider-fixture-key';
// A valid synthetic 1x1 PNG; byte integrity is tested separately from aesthetics.
export const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jfusAAAAASUVORK5CYII=', 'base64');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

export function tokenFor(secret, sub, role = 'authenticated') {
  const header = Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');
  const payload = Buffer.from(JSON.stringify({sub,role,aud:'authenticated',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600})).toString('base64url');
  const signed = `${header}.${payload}`;
  return `${signed}.${createHmac('sha256',secret).update(signed).digest('base64url')}`;
}

function actorFor(request, secret) {
  const value = request.headers.authorization?.replace(/^Bearer /,'') ?? '';
  const parts=value.split('.');
  if(parts.length!==3)throw Error('unauthorized');
  const expected=createHmac('sha256',secret).update(`${parts[0]}.${parts[1]}`).digest();
  const received=Buffer.from(parts[2],'base64url');
  if(expected.length!==received.length||!timingSafeEqual(expected,received))throw Error('unauthorized');
  const claims=JSON.parse(Buffer.from(parts[1],'base64url').toString());
  if(claims.exp<=Date.now()/1000||!Object.values(ACTORS).includes(claims.sub)||!['authenticated','service_role'].includes(claims.role))throw Error('unauthorized');
  return claims;
}

async function bodyOf(request,limit=16*1024*1024) {
  const chunks=[];let size=0;
  for await(const chunk of request){size+=chunk.length;if(size>limit)throw Error('body too large');chunks.push(chunk);}
  return Buffer.concat(chunks);
}
function json(response, value, status=200) {
  response.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});
  response.end(JSON.stringify(value));
}

/** Only external contracts are simulated. SQL filters, RPCs, JWT roles and RLS
 * are delegated to the real local PostgREST/PostgreSQL processes. */
export async function startFixtureService({runDir,jwtSecret,postgrestUrl='http://127.0.0.1:3001',onRequest=()=>{}}) {
  const certDir=join(runDir,'tls'),objectsDir=join(runDir,'objects');
  await mkdir(certDir,{recursive:true});await mkdir(objectsDir,{recursive:true});
  const cert=join(certDir,'cert.pem'),key=join(certDir,'key.pem');
  execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','1','-keyout',key,'-out',cert,'-subj','/CN=127.0.0.1','-addext','subjectAltName=IP:127.0.0.1'],{stdio:'ignore'});
  const ledger=[],requests=[],sessions=new Map(),faults={};
  let sequence=0,releaseImage=null;
  const metadataHeaders=request=>({authorization:request.headers.authorization,'content-type':'application/json','accept-profile':'storage','content-profile':'storage'});
  const server=createServer({key:await readFile(key),cert:await readFile(cert)},async(request,response)=>{
    try {
      onRequest();
      const url=new URL(request.url,'https://127.0.0.1:3443');
      requests.push({method:request.method,path:url.pathname});
      if(url.pathname==='/health')return json(response,{fixture:'compor-goal-v1'});
      if(url.pathname.startsWith('/provider/')) {
        if(request.headers.authorization!==`Bearer ${SYNTHETIC_KEY}`)return json(response,{error:'synthetic_credential_required'},401);
        const path=url.pathname.slice('/provider'.length),body=request.method==='GET'?null:JSON.parse((await bodyOf(request)).toString());
        if(path==='/v1/agents/sessions'&&request.method==='POST') {
          const id=`sess_verification${++sequence}`;
          sessions.set(id,{agent:body.agent,input:body.input});
          ledger.push({kind:'session',id,input:body.input,model:body.agent.model});
          return json(response,{id,status:'in_progress'},201);
        }
        const nestedItems=path.match(/^\/v1\/agents\/sessions\/(sess_verification\d+)\/turns\/[^/]+\/items$/);
        const match=nestedItems?[nestedItems[0],nestedItems[1],'items']:path.match(/^\/v1\/agents\/sessions\/(sess_verification\d+)(?:\/(items|turns|events))?$/);
        if(match&&sessions.has(match[1])) {
          const session=sessions.get(match[1]),id=match[1],turn=`turn_${id}`;
          if(match[2]==='items')return json(response,{has_more:false,data:[{type:'message',role:'assistant',status:'completed',phase:'final_answer',turn_id:turn,content:[{type:'output_text',text:'Pedido sintético recebido; os fatos permanecem como informados.'}]}]});
          if(match[2]==='turns')return json(response,{has_more:false,data:[{id:turn,session_id:id,subagent_id:null,status:'completed'}]});
          if(match[2]==='events')return json(response,{},202);
          return json(response,{id,agent:session.agent,status:'idle',required_actions:[],usage:{input_tokens:10,output_tokens:5,total_tokens:15}});
        }
        if(path==='/v1/images/generations'&&request.method==='POST') {
          ledger.push({kind:'image',id:`fixture_image_${++sequence}`,prompt:body.prompt,sha256:digest(PNG),outcome:faults.loseProviderReply?'reply_lost':'returned'});
          if(faults.holdImage)await new Promise(resolve=>{releaseImage=resolve;});
          if(faults.loseProviderReply){faults.loseProviderReply=false;response.destroy();return;}
          return json(response,{data:[{b64_json:PNG.toString('base64')}],usage:{input_tokens:10,output_tokens:5,total_tokens:15}});
        }
        return json(response,{error:'unexpected_provider_contract'},400);
      }
      const actor=actorFor(request,jwtSecret);
      if(url.pathname==='/auth/v1/user')return json(response,{id:actor.sub,aud:'authenticated',role:actor.role,email:`${actor.sub}@synthetic.invalid`});
      if(url.pathname.startsWith('/rest/v1/')) {
        const destination=`${postgrestUrl}/${url.pathname.slice('/rest/v1/'.length)}${url.search}`;
        const bytes=await bodyOf(request);
        if(faults.omitPersistence&&/^\/rest\/v1\/rpc\/save_piece_version_v[23]$/.test(url.pathname)){
          const input=JSON.parse(bytes.toString());
          requests.push({fault:'omit-persistence',path:url.pathname});
          return json(response,{status:'saved',version:{project_id:input.p_project_id,piece_id:input.p_piece_id,version:input.p_expected_version+1,content:input.p_content,created_at:new Date().toISOString(),metadata:{revision:0,baseVersion:input.p_base_version||null,approval:{status:'unapproved',kind:null,sourceVersion:null,at:null},...(input.p_operation?{operation:input.p_operation,changedDimension:input.p_changed_dimension??null}:{})}}});
        }
        const upstream=await fetch(destination,{method:request.method,headers:{authorization:request.headers.authorization,'content-type':request.headers['content-type']??'application/json',...(request.headers.prefer?{prefer:request.headers.prefer}:{})},...(bytes.length?{body:bytes}:{})});
        const result=Buffer.from(await upstream.arrayBuffer());
        if(faults.loseCompletionReply&&url.pathname==='/rest/v1/rpc/complete_exploration_image_proven'&&upstream.ok){faults.loseCompletionReply=false;response.destroy();return;}
        response.writeHead(upstream.status,{'content-type':upstream.headers.get('content-type')??'application/json'});response.end(result);return;
      }
      const storage=url.pathname.match(/^\/storage\/v1\/object\/(authenticated\/)?(compor-(?:project|exploration)-images)\/(.+)$/);
      if(storage) {
        const [,readPrefix,bucket,name]=storage;
        if(!/^[0-9a-f/-]+\.png$/.test(name)||name.includes('..'))return json(response,{error:'invalid path'},400);
        const metadata=new URL(`${postgrestUrl}/objects`);metadata.searchParams.set('bucket_id',`eq.${bucket}`);metadata.searchParams.set('name',`eq.${name}`);metadata.searchParams.set('select','id,bucket_id,name');
        const file=join(objectsDir,`${digest(`${bucket}/${name}`)}.png`);
        if(request.method==='POST'&&!readPrefix) {
          const bytes=await bodyOf(request);
          const stored=await fetch(`${postgrestUrl}/objects`,{method:'POST',headers:{...metadataHeaders(request),prefer:'return=representation'},body:JSON.stringify({bucket_id:bucket,name,owner:actor.sub})});
          if(!stored.ok)return json(response,{error:'storage_metadata_denied'},stored.status===409?409:403);
          await writeFile(file,bytes,{flag:'wx'});
          return json(response,{Key:`${bucket}/${name}`},200);
        }
        if(request.method==='GET'&&readPrefix) {
          const result=await fetch(metadata,{headers:metadataHeaders(request)});
          if(!result.ok)return json(response,{error:'denied'},403);
          if((await result.json()).length!==1)return json(response,{error:'not_found'},404);
          const bytes=await readFile(file).catch(()=>null);
          if(!bytes)return json(response,{error:'not_found'},404);
          response.writeHead(200,{'content-type':'image/png'});response.end(bytes);return;
        }
      }
      json(response,{error:'unsupported_fixture_contract'},404);
    } catch(error) {
      if(!response.headersSent)json(response,{error:error.message==='unauthorized'?'unauthorized':'fixture_failed'},error.message==='unauthorized'?401:500);
      else response.destroy();
    }
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(3443,'127.0.0.1',resolve);});
  return {cert,ledger,requests,objectsDir,setFault(name,value=true){faults[name]=value;},releaseImage(){faults.holdImage=false;releaseImage?.();releaseImage=null;},async close(){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}};
}
