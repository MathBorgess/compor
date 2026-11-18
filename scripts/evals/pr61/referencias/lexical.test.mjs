import test from 'node:test';
import assert from 'node:assert/strict';
import {searchReferences} from '../../../../apps/web/lib/reference-exploration.ts';

test('uma palavra de assunto completa vence falso positivo por substring e preposições',async()=>{
  const xml='<rss><channel>'+['Descarte para coleta com protocolo','Arte: textura e relevo'].map((title,index)=>'<item><title>'+title+'</title><link>https://www.pinterest.com/pin/'+(901+index)+'/</link><description><![CDATA[<img src="https://i.pinimg.com/test.jpg">]]></description></item>').join('')+'</channel></rss>';
  const result=await searchReferences({projectId:'00000000-0000-4000-8000-000000000001',query:'Arte para presente com embalagem',signals:[],fetchApi:async()=>new Response(xml)});
  assert.equal(result.references[0].title,'Arte: textura e relevo');
});

test('descoberta preserva histórico legado, não repete a recusa e depende de consentimento e propriedade',async()=>{
  const {createReferenceSearchRoute}=await import('../../../../apps/web/lib/reference-exploration-route.ts');
  const projectId=crypto.randomUUID();
  const previous=Array.from({length:12},(_,index)=>({id:String(100+index),title:'Arquivo da pessoa',board:'behance/typography',originUrl:'https://www.pinterest.com/pin/'+(100+index)+'/',previewUrl:'https://i.pinimg.com/old.jpg',approvedVersions:1,selectedAt:'2026-11-01T12:00:00Z'}));
  const origin='http://localhost:3000', pin=id=>'https://www.pinterest.com/pin/'+id+'/';
  let reads=0;
  const route=createReferenceSearchRoute({appOrigin:origin,resolveActor:async()=>({userId:projectId,token:'test'}),ownsProject:async(_,id)=>id===projectId,store:()=>({
    list:async()=>[{id:crypto.randomUUID(),projectId,createdAt:'2026-11-01T12:00:00Z',board:'behance/typography',action:'rejected',supersedes:null,originUrl:pin(200),comment:''}],history:async()=>previous,
  }),search:options=>searchReferences({...options,fetchApi:async()=>{reads++;return new Response('<rss>'+[100,200,201].map(id=>'<item><title>Oficina nova</title><link>'+pin(id)+'</link><description>https://i.pinimg.com/valid.jpg</description></item>').join('')+'</rss>');}})});
  const call=patch=>route(new Request(origin+'/api/studio/references/search',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({projectId,query:'Oficina',consentExternalSearch:true,...patch})}));
  assert.equal((await call({consentExternalSearch:false,discoveryOnly:true})).status,400);
  assert.equal((await call({projectId:crypto.randomUUID(),discoveryOnly:true})).status,404);
  assert.equal(reads,0);
  const legacy=await(await call({})).json(),discovery=await(await call({discoveryOnly:true})).json();
  assert.deepEqual(legacy.references.map(row=>row.id),previous.map(row=>row.id));
  assert.deepEqual(discovery.references.map(row=>row.id),['201']);
});

test('a descoberta mantém a opção de uma técnica pertinente sem correspondência lexical',async()=>{
  const titles=['Cerâmica: como organizar a oficina','Da roda à queima da argila','Campanha de moda praia'];
  const rss='<rss>'+titles.map((title,i)=>'<item><title>'+title+'</title><link>https://www.pinterest.com/pin/'+(310+i)+'/</link><description>https://i.pinimg.com/test.jpg</description></item>').join('')+'</rss>';
  const search=query=>searchReferences({projectId:crypto.randomUUID(),query,signals:[],discoveryOnly:true,fetchApi:async()=>new Response(rss)});
  const lexical=await search('Cerâmica');assert.equal(lexical.references[0].title,titles[0]);assert.ok(lexical.references.some(item=>item.title===titles[1]));
  const board=await search('Aquarela');assert.equal(board.references.length,3);
});
