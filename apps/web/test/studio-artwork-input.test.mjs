import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareArtworkInput, prepareArtworkTransport, artworkSourceFingerprint, ArtworkTransportRequiredError} from '../lib/studio-artwork-input.ts';
import {artworkImageBudgets, ARTWORK_TRANSPORT_BYTES} from '../lib/studio-artwork-transport.ts';

const pieceId='11111111-1111-4111-8111-111111111111',referenceId='22222222-2222-4222-8222-222222222222';
const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4AWJiYGBgAAAAAP//XRcpzQAAAAZJREFUAwAADwADJDd96QAAAABJRU5ErkJggg==','base64');
const draft={pieceId,baseVersion:3,content:{headline:'Oferta real',price:'R$ 12,90',date:'Amanhã'}};
const proposal={prompt:'Preserve a foto e ajuste o título',operation:'edit',baseImageId:pieceId,referenceIds:[referenceId]};
const stored={file:new Blob([bytes],{type:'image/png'})};
const options={proposal,draft,referenceIds:[referenceId],loadBase:async()=>stored,loadReference:async()=>stored};

test('confirmação congela textos, versão e bytes originais das imagens selecionadas',async()=>{
 const input=await prepareArtworkInput(options);
 assert.deepEqual(input.source,{pieceId,version:3});assert.deepEqual(input.literalText,draft.content);
 assert.deepEqual(input.images.map(image=>[image.id,image.role]),[[pieceId,'base'],[referenceId,'reference']]);
 for(const image of input.images)assert.deepEqual(Buffer.from(image.data,'base64'),bytes);
 assert.throws(()=>{input.literalText.price='R$ 0';});assert.throws(()=>input.images.pop());
 assert.throws(()=>{input.images[0].data='changed';});
});

test('imagem base ou referência indisponível bloqueia a proposta sem remover entradas',async()=>{
 await assert.rejects(()=>prepareArtworkInput({...options,loadBase:async()=>null}),/não está disponível/);
 await assert.rejects(()=>prepareArtworkInput({...options,loadReference:async()=>null}),/não está disponível/);
 await assert.rejects(()=>prepareArtworkInput({...options,referenceIds:[]}),/não pertence/);
 await assert.rejects(()=>prepareArtworkInput({...options,draft:{...draft,baseVersion:0}}),/versão salva/);
});

test('novas artes sem referência não carregam imagens; excesso tem erro explícito',async()=>{
 const result=await prepareArtworkInput({...options,proposal:{prompt:'Nova arte',operation:'create',baseImageId:null,referenceIds:[]},loadBase:async()=>{throw Error('unexpected');},loadReference:async()=>{throw Error('unexpected');}});
 assert.equal(result.source,null);assert.deepEqual(result.images,[]);
 await assert.rejects(()=>prepareArtworkInput({...options,loadBase:async()=>({file:new Blob([bytes,Buffer.alloc(2*1024*1024)],{type:'image/png'})})}),/excedem 2 MB/);
});

test('originais que cabem no envio não são convertidos nem exigem decoder',async()=>{
 const result=await prepareArtworkTransport(options,{allowConversion:true});
 assert.deepEqual(result.conversions,[]);
 for(const image of result.artworkInput.images)assert.deepEqual(Buffer.from(image.data,'base64'),bytes);
 assert.equal(result.sourceFingerprint,await artworkSourceFingerprint(options));
 const cloned=await artworkSourceFingerprint({...options,loadBase:async()=>({file:new Blob([bytes],{type:'image/png'})})});
 assert.equal(cloned,result.sourceFingerprint);
 const changed=await artworkSourceFingerprint({...options,loadBase:async()=>({file:new Blob([bytes,Uint8Array.of(1)],{type:'image/png'})})});
 assert.notEqual(changed,result.sourceFingerprint,'substituir imagem na mesma versão invalida a cópia');
});

test('orçamento mantém referências pequenas e divide o restante sem exceder o limite',()=>{
 assert.deepEqual(artworkImageBudgets([100,200]),[100,200]);
 assert.deepEqual(artworkImageBudgets([3*1024*1024,100]),[ARTWORK_TRANSPORT_BYTES-100,100]);
 const budgets=artworkImageBudgets([100,...Array(20).fill(8*1024*1024)]);
 assert.equal(budgets[0],100);assert.ok(budgets.reduce((sum,size)=>sum+size,0)<=ARTWORK_TRANSPORT_BYTES);
 assert.equal(budgets.length,21);assert.ok(budgets.every(size=>size>0));
});

test('excesso exige autorização local explícita antes de qualquer conversão',async()=>{
 const large={...options,loadBase:async()=>({file:new Blob([bytes,Buffer.alloc(2*1024*1024)],{type:'image/png'})})};
 await assert.rejects(()=>prepareArtworkTransport(large),ArtworkTransportRequiredError);
 await assert.rejects(()=>prepareArtworkTransport({...large,loadBase:async()=>({file:new Blob([bytes,Buffer.alloc(8*1024*1024)],{type:'image/png'})})},{allowConversion:true}),/Imagem inválida/);
});
