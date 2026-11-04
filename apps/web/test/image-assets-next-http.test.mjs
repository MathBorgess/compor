import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {once} from 'node:events';
import {createServer} from 'node:net';
import {createServer as httpsServer} from 'node:https';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

test('listagem permanece indisponível quando imagens privadas estão desativadas',async t=>{
 const socket=createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));const origin=`http://127.0.0.1:${port}`;
 const child=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','-p',String(port),'-H','127.0.0.1'],{stdio:'ignore',env:{...process.env,SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fake',APP_ORIGIN:origin,COMPOR_PRIVATE_IMAGES_ENABLED:''}});
 t.after(async()=>{if(child.exitCode===null&&child.signalCode===null){child.kill('SIGTERM');await once(child,'exit');}});
 const deadline=Date.now()+30000;let response;while(true){try{response=await fetch(`${origin}/api/image-assets`);break;}catch{}if(Date.now()>deadline)throw Error('app unavailable');await new Promise(r=>setTimeout(r,200));}
 assert.equal(response.status,503);assert.equal(response.headers.get('cache-control'),'no-store');
});

test('rota lista referências sem storage local e respeita token da conta',async t=>{
 const owner='11111111-1111-4111-8111-111111111111',other='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',project='22222222-2222-4222-8222-222222222222',piece='33333333-3333-4333-8333-333333333333';
 const assets=Array.from({length:51},(_,i)=>`44444444-4444-4444-8444-${String(i+1).padStart(12,'0')}`);
 const dir=await mkdtemp(join(tmpdir(),'compor-asset-list-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const key=join(dir,'key.pem'),cert=join(dir,'cert.pem');execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','1','-keyout',key,'-out',cert,'-subj','/CN=127.0.0.1','-addext','subjectAltName=IP:127.0.0.1'],{stdio:'ignore'});
 const service=httpsServer({key:await readFile(key),cert:await readFile(cert)},async(req,res)=>{
  const auth=req.headers.authorization;res.setHeader('content-type','application/json');
  if(req.url==='/auth/v1/user')return res.end(JSON.stringify({id:auth==='Bearer mock-owner'?owner:other,aud:'authenticated'}));
  if(req.url==='/rest/v1/rpc/list_piece_image_assets'){
   let body='';for await(const part of req)body+=part;const input=JSON.parse(body);assert.equal(input.p_project_id,project);assert.equal(input.p_piece_id,piece);assert.equal(input.p_version,1);
   const items=auth==='Bearer mock-owner'?assets.filter(id=>!input.p_after||id>input.p_after):[];
   return res.end(JSON.stringify({assets:items.slice(0,50),nextCursor:items.length>50?items[49]:null}));
  }
  res.statusCode=404;res.end();
 });
 await new Promise(r=>service.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>service.close(r)));
 const socket=createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));const origin=`http://127.0.0.1:${port}`;
 const child=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','-p',String(port),'-H','127.0.0.1'],{stdio:'ignore',env:{...process.env,SUPABASE_URL:`https://127.0.0.1:${service.address().port}`,SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fake',APP_ORIGIN:origin,COMPOR_PRIVATE_IMAGES_ENABLED:'true',NODE_EXTRA_CA_CERTS:cert}});
 t.after(async()=>{if(child.exitCode===null&&child.signalCode===null){child.kill('SIGTERM');await once(child,'exit');}});
 const endpoint=`${origin}/api/image-assets?projectId=${project}&pieceId=${piece}&version=1`,deadline=Date.now()+30000;
 while(true){try{await fetch(endpoint);break;}catch{}if(Date.now()>deadline)throw Error('app unavailable');await new Promise(r=>setTimeout(r,200));}
 const cookie=(id,token)=>`sb-127-auth-token=base64-${Buffer.from(JSON.stringify({access_token:token,refresh_token:'mock-refresh',token_type:'bearer',expires_at:4102444800,expires_in:3600,user:{id}})).toString('base64url')}`;
 assert.equal((await fetch(endpoint)).status,401);
 const headers={cookie:cookie(owner,'mock-owner')};const first=await (await fetch(endpoint,{headers})).json();assert.equal(first.assets.length,50);assert.equal(first.nextCursor,assets[49]);assert.equal(first.assets[0].origin,'unknown');
 const second=await (await fetch(`${endpoint}&after=${first.nextCursor}`,{headers})).json();assert.deepEqual(second,{assets:[{assetId:assets[50],origin:'unknown'}],nextCursor:null});
 const denied=await (await fetch(endpoint,{headers:{cookie:cookie(other,'mock-other')}})).json();assert.deepEqual(denied,{assets:[],nextCursor:null});
});
