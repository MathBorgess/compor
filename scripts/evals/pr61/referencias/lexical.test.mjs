import test from 'node:test';
import assert from 'node:assert/strict';
import {searchReferences} from '../../../../apps/web/lib/reference-exploration.ts';

test('uma palavra de assunto completa vence falso positivo por substring e preposições',async()=>{
  const xml='<rss><channel>'+['Descarte para coleta com protocolo','Arte: textura e relevo'].map((title,index)=>'<item><title>'+title+'</title><link>https://www.pinterest.com/pin/'+(901+index)+'/</link><description><![CDATA[<img src="https://i.pinimg.com/test.jpg">]]></description></item>').join('')+'</channel></rss>';
  const result=await searchReferences({projectId:'00000000-0000-4000-8000-000000000001',query:'Arte para presente com embalagem',signals:[],fetchApi:async()=>new Response(xml)});
  assert.equal(result.references[0].title,'Arte: textura e relevo');
});
