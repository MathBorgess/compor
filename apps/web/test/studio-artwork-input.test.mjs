import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareArtworkInput} from '../lib/studio-artwork-input.mjs';

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
