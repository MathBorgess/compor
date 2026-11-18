import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer,request as httpRequest} from 'node:http';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import {pagesRoute} from '../lib/pages-route-adapter.ts';
import {cookies} from '../lib/pages-request-cookies.ts';

async function listen(t,route,methods) {
  const dispatch=pagesRoute(route,methods);
  const server=createServer((request,response)=>{dispatch(request,response).catch(error=>{if(!response.destroyed&&!response.writableEnded){response.statusCode=500;response.end(error.name);}});});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
  return 'http://127.0.0.1:'+server.address().port;
}

test('cookies de contas concorrentes continuam isolados e vários Set-Cookie preservam atributos',async t=>{
  let join; const both=new Promise(resolve=>join=resolve);let entered=0;
  const origin=await listen(t,'/auth/callback',{GET:async()=>{
    const jar=await cookies();const user=jar.get('account')?.value;
    if(++entered===2)join();await both;
    assert.equal((await cookies()).get('account')?.value,user);
    jar.set('access',user,{path:'/',httpOnly:true,sameSite:'lax'});jar.set('refresh',user+'-next',{path:'/',secure:true,maxAge:180});jar.delete('pending');jar.set('handler','from-jar',{path:'/'});
    const headers=new Headers();headers.append('Set-Cookie','handler=explicit; Path=/');
    return new Response(user,{headers});
  }});
  const replies=await Promise.all(['alice','bruno'].map(account=>fetch(origin+'/auth/callback',{headers:{cookie:'account='+account+'; pending=previous'}})));
  for(const [i,res] of replies.entries()){
    const user=['alice','bruno'][i];assert.equal(await res.text(),user);
    const values=res.headers.getSetCookie();assert.equal(values.length,4);
    assert.ok(values.some(value=>value.startsWith('access='+user+';')&&value.includes('HttpOnly')&&value.includes('SameSite=lax')));
    assert.ok(values.some(value=>value.startsWith('refresh='+user+'-next;')&&value.includes('Secure')&&value.includes('Max-Age=180')));
    assert.ok(values.some(value=>value.startsWith('pending=;')&&value.includes('Expires=')));
    assert.ok(values.some(value=>value.startsWith('handler=explicit;')));assert.ok(values.every(value=>!value.includes('from-jar')));
  }
});

test('métodos automáticos, parâmetros de rota e query de vários valores têm o contrato Fetch',async t=>{
  const calls=[];
  const origin=await listen(t,'/api/studio/reference-authority/[operation]',{GET:async(req,{params})=>{
    const url=new URL(req.url);const input={verb:req.method,op:(await params).operation,args:url.searchParams.getAll('tag'),other:url.searchParams.get('operation')};calls.push(input);
    return Response.json(input,{headers:{'x-route':'original-handler'}});
  }});
  const url=origin+'/api/studio/reference-authority/selection?tag=one&tag=two&operation=forged';
  assert.deepEqual(await(await fetch(url)).json(),{verb:'GET',op:'selection',args:['one','two'],other:'forged'});
  const head=await fetch(url,{method:'HEAD'});assert.equal(head.status,200);assert.equal(head.headers.get('x-route'),'original-handler');assert.equal(await head.text(),'');assert.equal(calls[1].verb,'HEAD');
  const options=await fetch(url,{method:'OPTIONS'});assert.equal(options.status,204);assert.equal(options.headers.get('allow'),'GET, HEAD, OPTIONS');
  assert.equal((await fetch(url,{method:'DELETE'})).status,405);assert.equal(calls.length,2);
});

test('o corpo binário chega intacto além do limite padrão do parser Pages, e o handler pode interromper leitura',async t=>{
  const payload=Buffer.alloc(1024*1024+97,97);
  const origin=await listen(t,'/api/images',{POST:async req=>{
    if(new URL(req.url).searchParams.has('limited')){const reader=req.body.getReader();await reader.read();await reader.cancel();return Response.json({error:'too_large'},{status:413});}
    const digest=createHash('sha256');let size=0;
    for await (const piece of req.body){size+=piece.length;digest.update(piece);}
    return Response.json({size,digest:digest.digest('hex')});
  }});
  const res=await fetch(origin+'/api/images',{method:'POST',body:payload});assert.deepEqual(await res.json(),{size:payload.length,digest:createHash('sha256').update(payload).digest('hex')});
  assert.equal((await fetch(origin+'/api/images?limited=1',{method:'POST',body:payload})).status,413);
});

test('MCP pode emitir o primeiro evento enquanto o fluxo continua e observa desconexão',async t=>{
  let resolveCancelled,resolveSignal;
  const cancelled=new Promise(resolve=>resolveCancelled=resolve),signal=new Promise(resolve=>resolveSignal=resolve);
  const origin=await listen(t,'/api/mcp',{GET:req=>{
    req.signal.addEventListener('abort',()=>resolveSignal());
    const body=new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('data: pronto\n\n'));},cancel(){resolveCancelled();}});
    return new Response(body,{headers:{'Content-Type':'text/event-stream'}});
  }});
  const client=httpRequest(origin+'/api/mcp');client.end();
  const [res]=await once(client,'response');assert.equal(res.headers['content-type'],'text/event-stream');
  const [chunk]=await once(res,'data');assert.equal(chunk.toString(),'data: pronto\n\n');res.destroy();
  await Promise.all([signal,cancelled]);
});
