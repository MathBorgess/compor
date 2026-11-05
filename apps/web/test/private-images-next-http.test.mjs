import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { createServer as httpsServer } from 'node:https';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fetchPrivateImage } from '../lib/private-image-fetch.ts';

test('rota de imagens permanece fechada sem habilitação explícita', async t => {
  const probe=createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
  const child=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','-p',String(port),'-H','127.0.0.1'],{stdio:'ignore',env:{...process.env,SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fake',APP_ORIGIN:`http://127.0.0.1:${port}`,COMPOR_PRIVATE_IMAGES_ENABLED:'',COMPOR_AGENT_ENABLED:'true',COMPOR_AGENT_HMAC_SECRET:Buffer.alloc(32,8).toString('base64url')}});
  t.after(async()=>{if(child.exitCode===null&&child.signalCode===null){child.kill('SIGTERM');await once(child,'exit');}});
  const deadline=Date.now()+30000; let response;
  while(true){try{response=await fetch(`http://127.0.0.1:${port}/api/images`);break;}catch{}if(Date.now()>deadline)throw Error('aplicação indisponível');await new Promise(resolve=>setTimeout(resolve,200));}
  assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:'unavailable'});assert.equal(response.headers.get('cache-control'),'no-store');
  const generated=await fetch(`http://127.0.0.1:${port}/api/agent/image`,{method:'POST',headers:{origin:`http://127.0.0.1:${port}`,'content-type':'application/json'},body:'{}'});
  assert.equal(generated.status,503);assert.deepEqual(await generated.json(),{error:'unavailable'});
});

test('rota privada recupera a imagem apenas para a conta proprietária, sem repetir upload incerto', async t => {
  const user='11111111-1111-4111-8111-111111111111', other='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const project='22222222-2222-4222-8222-222222222222', piece='33333333-3333-4333-8333-333333333333', asset='44444444-4444-4444-8444-444444444444';
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
  const dir=await mkdtemp(join(tmpdir(),'compor-image-route-')); t.after(()=>rm(dir,{recursive:true,force:true}));
  const key=join(dir,'key.pem'), cert=join(dir,'cert.pem');
  execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','1','-keyout',key,'-out',cert,'-subj','/CN=127.0.0.1','-addext','subjectAltName=IP:127.0.0.1'],{stdio:'ignore'});
  let uploads=0, downloads=0, image=png;
  const service=httpsServer({key:await readFile(key),cert:await readFile(cert)},(req,res)=>{
    const token=req.headers.authorization;
    if(req.url==='/auth/v1/user'){res.setHeader('content-type','application/json');return res.end(JSON.stringify({id:token==='Bearer mock-owner'?user:other,aud:'authenticated'}));}
    if(req.url.startsWith('/rest/v1/piece_versions?')){res.setHeader('content-type','application/json');return res.end(JSON.stringify(token==='Bearer mock-owner'?[{project_id:project,piece_id:piece,version:1,projects:{owner_id:user}}]:[]));}
    if(req.url.startsWith('/storage/v1/object/')){if(req.method==='POST'){uploads++; assert.equal(req.headers['x-upsert'],'false');res.statusCode=500;return res.end();}downloads++;res.setHeader('content-type','image/png');return res.end(image);}
    res.statusCode=404;res.end();
  });
  await new Promise(resolve=>service.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>service.close(resolve)));
  const probe=createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
  const origin=`http://127.0.0.1:${port}`;
  const child=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','-p',String(port),'-H','127.0.0.1'],{stdio:'ignore',env:{...process.env,SUPABASE_URL:`https://127.0.0.1:${service.address().port}`,SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fake',APP_ORIGIN:origin,COMPOR_PRIVATE_IMAGES_ENABLED:'true',NODE_EXTRA_CA_CERTS:cert}});
  t.after(async()=>{if(child.exitCode===null&&child.signalCode===null){child.kill('SIGTERM');await once(child,'exit');}});
  const endpoint=`${origin}/api/images?projectId=${project}&pieceId=${piece}&version=1&assetId=${asset}`,deadline=Date.now()+30000;
  while(true){try{await fetch(endpoint);break;}catch{}if(Date.now()>deadline)throw Error('aplicação indisponível');await new Promise(resolve=>setTimeout(resolve,200));}
  const cookie=(id,token)=>`sb-127-auth-token=base64-${Buffer.from(JSON.stringify({access_token:token,refresh_token:'mock-refresh',token_type:'bearer',expires_at:4102444800,expires_in:3600,user:{id}})).toString('base64url')}`;
  assert.equal((await fetch(endpoint)).status,401);
  const denied=await fetch(endpoint,{headers:{cookie:cookie(other,'mock-other')}});assert.equal(denied.status,404);assert.equal(downloads,0);
  const good=await fetch(endpoint,{headers:{cookie:cookie(user,'mock-owner')}});assert.equal(good.status,200);assert.equal(good.headers.get('cache-control'),'no-store');assert.deepEqual(Buffer.from(await good.arrayBuffer()),png);
  image=Buffer.concat([png,Buffer.alloc(5*1024*1024,7)]);const query=new URL(endpoint).searchParams;
  const recovered=await fetchPrivateImage(query,{fetch:(url,options)=>fetch(new URL(url,origin),{...options,headers:{cookie:cookie(user,'mock-owner')}})});assert.deepEqual(Buffer.from(await recovered.arrayBuffer()),image);assert.equal(downloads,5);
  let requests=0;await assert.rejects(fetchPrivateImage(query,{fetch:(url,options)=>fetch(new URL(url,origin),{...options,headers:{cookie:++requests<3?cookie(user,'mock-owner'):cookie(other,'mock-other')}})}));assert.equal(downloads,7);
  const badOrigin=await fetch(endpoint,{method:'POST',headers:{cookie:cookie(user,'mock-owner'),origin:'https://evil.example','content-type':'image/png'},body:png});assert.equal(badOrigin.status,403);assert.equal(uploads,0);
  const result=await fetch(endpoint,{method:'POST',headers:{cookie:cookie(user,'mock-owner'),origin,'content-type':'image/png'},body:png});assert.equal(result.status,502);assert.deepEqual(await result.json(),{error:'result_unknown',retryAutomatically:false});assert.equal(uploads,1);
});
