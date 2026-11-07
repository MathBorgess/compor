import {lookup as dnsLookup} from 'node:dns/promises';
import {request as httpsRequest} from 'node:https';
import {BlockList,isIP} from 'node:net';

const denied4=new BlockList();
for(const [address,prefix] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.88.99.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]])denied4.addSubnet(address,prefix,'ipv4');
const global6=new BlockList();global6.addSubnet('2000::',3,'ipv6');
const denied6=new BlockList();for(const [address,prefix] of [['2001::',23],['2001:db8::',32],['2002::',16],['3fff::',20]])denied6.addSubnet(address,prefix,'ipv6');
const publicAddress=address=>isIP(address)===4?!denied4.check(address,'ipv4'):isIP(address)===6&&global6.check(address,'ipv6')&&!denied6.check(address,'ipv6');
const TIMEOUT=5000,MAX_BYTES=512*1024,MAX_TEXT=10000;
function validUrl(value){
 try{
  const url=new URL(value),host=url.hostname.toLowerCase();
  if(url.protocol!=='https:'||url.username||url.password||url.port||host.length>253||isIP(host.replace(/^\[|\]$/g,''))||!host.includes('.')||host.endsWith('.')||!/^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host)||/\.(?:localhost|local|internal|invalid|test|example)$/.test(host))return null;
  url.hash='';return url;
 }catch{return null;}
}
export function extractUserUrls(message){
 if(typeof message!=='string')return [];
 const found=message.match(/https?:\/\/[^\s<>"'`]+/gi)??[],urls=[];
 for(let value of found){
  value=value.replace(/[.,;!?\]}]+$/g,'');
  while(value.endsWith(')')&&(value.match(/\)/g)?.length??0)>(value.match(/\(/g)?.length??0))value=value.slice(0,-1);
  if(!urls.includes(value))urls.push(value);
  if(urls.length===3)break;
 }
 return urls;
}
function htmlText(input){
 const lower=input.toLowerCase(),ignored=new Set(['script','style','template','noscript','svg','iframe']);
 const parts=[];let position=0;
 while(position<input.length){
  const start=input.indexOf('<',position);
  if(start<0){parts.push(input.slice(position));break;}
  parts.push(input.slice(position,start),' ');
  if(input.startsWith('<!--',start)){const end=input.indexOf('-->',start+4);if(end<0)break;position=end+3;continue;}
  const end=input.indexOf('>',start+1);if(end<0)break;
  const tag=lower.slice(start+1,end).match(/^\s*([a-z0-9-]+)/)?.[1];
  if(tag&&ignored.has(tag)){
   const close=lower.indexOf(`</${tag}`,end+1);if(close<0)break;
   const closeEnd=input.indexOf('>',close+2+tag.length);if(closeEnd<0)break;
   position=closeEnd+1;
  }else position=end+1;
 }
 return parts.join('');
}
function textContent(input,type){
 const raw=type==='text/plain'?input:htmlText(input);
 return raw.replace(/&#(x[0-9a-f]+|\d+);/gi,(_all,value)=>{const n=value[0].toLowerCase()==='x'?parseInt(value.slice(1),16):parseInt(value,10);return n>0&&n<=0x10ffff?String.fromCodePoint(n):' ';}).replace(/&(nbsp|amp|lt|gt|quot|apos);/gi,(_all,name)=>({nbsp:' ',amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"})[name.toLowerCase()]).replace(/\s+/g,' ').replace(/sk-[A-Za-z0-9_-]{20,}/gi,'[credencial removida]').trim().slice(0,MAX_TEXT);
}
async function resolvePublic(host,lookup){
 let timeout;
 try{
  const addresses=await Promise.race([lookup(host,{all:true,verbatim:true}),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('dns timeout')),TIMEOUT);})]);
  if(!Array.isArray(addresses)||!addresses.length||addresses.length>16||addresses.some(item=>!item||!publicAddress(item.address)||item.family!==isIP(item.address)))throw Error('address unavailable');
  return addresses[0];
 }finally{clearTimeout(timeout);}
}
export function pinnedRequest(url,address,{request=httpsRequest}={}){
 return new Promise((resolve,reject)=>{
  let settled=false,deadline;
  const fail=error=>{if(!settled){settled=true;clearTimeout(deadline);reject(error);}};
  const done=value=>{if(!settled){settled=true;clearTimeout(deadline);resolve(value);}};
  const req=request(url,{method:'GET',agent:false,maxHeaderSize:16384,servername:url.hostname,family:address.family,autoSelectFamily:false,lookup:(_host,_options,callback)=>callback(null,address.address,address.family),headers:{accept:'text/html,text/plain;q=0.9','accept-encoding':'identity','user-agent':'ComporPageReader/1.0'}},res=>{
   const status=res.statusCode??0,location=res.headers.location;
   if(status>=300&&status<400){done({status,location});res.destroy();return;}
   const contentType=String(res.headers['content-type']??'').split(';')[0].trim().toLowerCase();
   if(status!==200||!['text/html','text/plain'].includes(contentType)||!['','identity'].includes(String(res.headers['content-encoding']??'').toLowerCase())||Number(res.headers['content-length']??0)>MAX_BYTES){fail(Error('unsupported response'));res.destroy();return;}
   let size=0;const chunks=[];
   res.on('data',chunk=>{size+=chunk.length;if(size>MAX_BYTES){req.destroy(Error('too large'));return;}chunks.push(chunk);});
   res.on('error',fail);res.on('end',()=>done({status,contentType,text:new TextDecoder('utf-8').decode(Buffer.concat(chunks))}));
  });
  deadline=setTimeout(()=>req.destroy(Error('timeout')),TIMEOUT);req.on('error',fail);req.end();
 });
}
/** Read only URLs explicitly supplied in the current message. No cookies, keys, or cross-origin redirects. */
export async function readUserPages(message,{lookup=dnsLookup,transport=pinnedRequest}={}){
 const urls=extractUserUrls(message),results=[];
 const optOut=/\b(?:n[aã]o|nunca|sem)\b.{0,80}\b(?:abrir|abra|abre|acessar|acesse|acessa|visitar|visite|leia|ler|consultar|consulte|buscar|busque|requisitar|requisite)\b/i.test(message);
 for(const initial of urls){
  const original=validUrl(initial);
  if(!original){results.push({url:'link informado',status:'unavailable'});continue;}
  let current=original,entry={url:original.origin+original.pathname,status:'unavailable'};
  if(optOut){results.push({...entry,status:'not_requested'});continue;}
  try{
   for(let redirect=0;redirect<=2;redirect++){
    const address=await resolvePublic(current.hostname,lookup),response=await transport(current,address);
    if(response.status>=300&&response.status<400){
     if(redirect===2||typeof response.location!=='string')throw Error('redirect unavailable');
     const next=validUrl(new URL(response.location,current).href);
     if(!next||next.origin!==original.origin)throw Error('redirect unavailable');
     current=next;continue;
    }
    if(response.status!==200||!['text/html','text/plain'].includes(response.contentType)||typeof response.text!=='string'||Buffer.byteLength(response.text)>MAX_BYTES)throw Error('content unavailable');
    const content=textContent(response.text,response.contentType);if(!content)throw Error('empty content');
    entry={url:original.origin+original.pathname,status:'available',content};break;
   }
  }catch{/* The model is told a page could not be read, never shown a guessed summary. */}
  results.push(entry);
 }
 return results;
}
