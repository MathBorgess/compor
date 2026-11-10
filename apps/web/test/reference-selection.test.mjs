import test from 'node:test';
import assert from 'node:assert/strict';
import {recordReferenceSelection} from '../lib/reference-selection.ts';
const userId='00000000-0000-4000-8000-000000000001',projectId='00000000-0000-4000-8000-000000000002';
const reference={id:'pin',title:'Tipografia',board:'behance/typography',originUrl:'https://www.pinterest.com/pin/pin/',previewUrl:'https://i.pinimg.com/236x/pin.jpg'};
const storage=()=>{const data=new Map();return {getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};};
test('resultado incerto conserva UUID; escolha confirmada libera nova seleção depois de remover ou rejeitar',async()=>{
  const session=storage(),requests=[],events=[];let fail=true,commits=0;
  const send=async(_url,options)=>{
    const body=JSON.parse(options.body);requests.push(body);
    if(fail){fail=false;throw Error('resposta perdida');}
    if(!events.some(event=>event.id===body.id))events.push(body);
    return Response.json({signal:{...body,createdAt:'2026-11-09T12:00:00.000Z'}});
  };
  const choose=()=>recordReferenceSelection({userId,projectId,reference,commit:async()=>{commits++;}},session,send);
  await assert.rejects(choose(),/resposta perdida/);assert.equal(commits,0);
  await choose();assert.equal(requests[0].id,requests[1].id);assert.equal(commits,1);
  events.push({id:crypto.randomUUID(),action:'rejected',originUrl:reference.originUrl});
  await choose();assert.notEqual(requests[2].id,requests[1].id,'remover e escolher novamente cria uma nova decisão');
  assert.deepEqual(events.map(event=>event.action),['selected','rejected','selected']);assert.equal(commits,2);
});
test('persistência local incerta mantém o sinal para retry e metadados divergentes não são reenviados',async()=>{
  const session=storage(),requests=[];let unavailable=true;
  const send=async(_url,options)=>{const body=JSON.parse(options.body);requests.push(body);return Response.json({signal:{...body,createdAt:'2026-11-09T12:00:00.000Z'}});};
  const commit=async()=>{if(unavailable)throw Error('storage indisponível');};
  await assert.rejects(recordReferenceSelection({userId,projectId,reference,commit},session,send),/storage indisponível/);
  await assert.rejects(recordReferenceSelection({userId,projectId,reference:{...reference,title:'Outra descrição'},commit},session,send),/selection_snapshot_changed/);
  assert.equal(requests.length,1);
  unavailable=false;await recordReferenceSelection({userId,projectId,reference,commit},session,send);
  assert.equal(requests[0].id,requests[1].id);
});
