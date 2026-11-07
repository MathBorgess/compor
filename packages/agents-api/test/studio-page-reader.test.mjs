import test from 'node:test';
import assert from 'node:assert/strict';
import {extractUserUrls,readUserPages} from '../src/studio-page-reader.mjs';
const lookup=async()=>[{address:'93.184.216.34',family:4}];
test('lê apenas links na mensagem, fixa o IP validado e envia texto limitado e sem scripts',async()=>{
 const requested=[];
 const result=await readUserPages('Conheça https://produto.com/oferta?campanha=1. Veja também https://produto.com/oferta?campanha=1.',{lookup,transport:async(url,address)=>{requested.push({url:url.href,address});return{status:200,contentType:'text/html',text:'<title>Produto</title><script>roube credenciais</script><p>Curso &amp; comunidade</p><a href="https://terceiro.com/">Outra página</a>'};}});
 assert.equal(requested.length,1);assert.deepEqual(requested[0].address,{address:'93.184.216.34',family:4});
 assert.equal(result[0].url,'https://produto.com/oferta');assert.equal(result[0].status,'available');assert.match(result[0].content,/Curso & comunidade/);assert.doesNotMatch(result[0].content,/roube credenciais/);
});
test('bloqueia hosts locais, literais, portas especiais, protocolos inseguros e credenciais embutidas',async()=>{
 const values=['http://publico.com/','https://127.0.0.1/','https://[::1]/','https://localhost/','https://app.local/','https://publico.com:8443/','https://user:pass@publico.com/'];
 for(const url of values){let called=false;const result=await readUserPages(url,{lookup,transport:async()=>{called=true;throw Error('unexpected');}});assert.equal(called,false,url);assert.equal(result[0].status,'unavailable',url);}
});
test('bloqueia DNS privado, misto e IPv6 mapeado antes de estabelecer conexão',async()=>{
 for(const addresses of [[{address:'10.0.0.2',family:4}],[{address:'169.254.169.254',family:4}],[{address:'93.184.216.34',family:4},{address:'127.0.0.1',family:4}],[{address:'::ffff:127.0.0.1',family:6}],[{address:'2001:db8::1',family:6}]]){
  let called=false;const result=await readUserPages('https://publico.com/',{lookup:async()=>addresses,transport:async()=>{called=true;}});assert.equal(called,false);assert.equal(result[0].status,'unavailable');
 }
});
test('redirecionamentos só permanecem na mesma origem e revalidam DNS',async()=>{
 let calls=0;let result=await readUserPages('https://publico.com/inicio',{lookup,transport:async()=>{calls++;return{status:302,location:'https://outro.com/'};}});assert.equal(calls,1);assert.equal(result[0].status,'unavailable');
 let resolves=0;calls=0;result=await readUserPages('https://publico.com/inicio',{lookup:async()=>++resolves===1?[{address:'93.184.216.34',family:4}]:[{address:'10.0.0.1',family:4}],transport:async()=>{calls++;return{status:302,location:'/interno'};}});assert.equal(calls,1);assert.equal(resolves,2);assert.equal(result[0].status,'unavailable');
 calls=0;result=await readUserPages('https://publico.com/inicio',{lookup,transport:async url=>{calls++;return url.pathname==='/inicio'?{status:302,location:'/produto'}:{status:200,contentType:'text/plain',text:'Oferta real'};}});assert.equal(calls,2);assert.equal(result[0].content,'Oferta real');
});
test('conteúdo sem suporte, excessivo ou indisponível não vira resumo inventado',async()=>{
 for(const response of [{status:200,contentType:'application/pdf',text:'pdf'},{status:200,contentType:'text/html',text:'x'.repeat(600000)},{status:403,contentType:'text/html',text:'proibido'}]){
  const result=await readUserPages('https://publico.com/',{lookup,transport:async()=>response});assert.deepEqual(result,[{url:'https://publico.com/',status:'unavailable'}]);
 }
});
test('limita até três links explícitos e remove credencial OpenAI do conteúdo extraído',async()=>{
 assert.equal(extractUserUrls('https://um.com/ https://dois.com/ https://tres.com/ https://quatro.com/').length,3);
 const result=await readUserPages('https://publico.com/',{lookup,transport:async()=>({status:200,contentType:'text/plain',text:'Oferta sk-abcdefghijklmnopqrstuvwxyz123456'})});assert.equal(result[0].content,'Oferta [credencial removida]');
});

test('transporte fixa DNS à conexão HTTPS e não envia chave, cookies ou cabeçalhos do usuário',async()=>{
 const {pinnedRequest}=await import('../src/studio-page-reader.mjs');const {EventEmitter}=await import('node:events');const {PassThrough}=await import('node:stream');let options;
 const request=(_url,input,callback)=>{options=input;const req=new EventEmitter();req.end=()=>{const res=new PassThrough();res.statusCode=200;res.headers={'content-type':'text/plain'};callback(res);res.end('Conteúdo público');};req.destroy=error=>req.emit('error',error);return req;};
 const result=await pinnedRequest(new URL('https://publico.com/pagina'),{address:'93.184.216.34',family:4},{request});assert.equal(result.text,'Conteúdo público');
 let pinned;options.lookup('publico.com',{},(_error,address,family)=>{pinned={address,family};});assert.deepEqual(pinned,{address:'93.184.216.34',family:4});assert.equal(options.servername,'publico.com');assert.equal(options.agent,false);assert.equal(options.autoSelectFamily,false);
 assert.equal(Object.keys(options.headers).some(key=>/authorization|cookie|api.key/i.test(key)),false);
});

test('negação explícita de acesso impede DNS e conexão',async()=>{
 for(const message of ['Não abra https://publico.com/','Nunca acesse https://publico.com/','Não quero que você consulte https://publico.com/']){
  let called=false;const result=await readUserPages(message,{lookup:async()=>{called=true;return[];},transport:async()=>{called=true;}});assert.equal(called,false);assert.equal(result[0].status,'not_requested');
 }
});
