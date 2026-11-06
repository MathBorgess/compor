import test from 'node:test';
import assert from 'node:assert/strict';
import {parseArtworkInput, artworkInputDigest, imageProposalDigest, validateArtworkForProposal, compileArtworkPrompt} from '../src/artwork-input.mjs';

const baseId='11111111-1111-4111-8111-111111111111', refId='22222222-2222-4222-8222-222222222222';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB','base64');
const image=(id,role)=>({id,role,mime:'image/png',data:png.toString('base64')});
const proposal={prompt:'Uma oficina de cerâmica com título legível',operation:'edit',baseImageId:baseId,referenceIds:[refId]};
const input={literalText:{headline:'Mãos na argila',price:'R$ 129,90',date:'12/12 às 14h'},source:{pieceId:baseId,version:1},images:[image(baseId,'base'),image(refId,'reference')]};

test('instrução produz arte integral com textos literais e origem identificada',()=>{
 const prompt=compileArtworkPrompt(proposal,input);
 for(const value of Object.values(input.literalText))assert.ok(prompt.includes(value));
 assert.match(prompt,/A imagem é o post inteiro/);assert.match(prompt,/Edite a primeira imagem/);assert.match(prompt,/4:5/);assert.match(prompt,/Legenda de publicação é separada/);
 assert.doesNotMatch(prompt,/sem texto|texto será aplicado/i);
});

test('aprovação muda se qualquer texto, pixel, ordem, origem ou operação mudar',()=>{
 const digest=artworkInputDigest(input);
 const variants=[
  {...input,literalText:{...input.literalText,price:'R$ 99,90'}},
  {...input,source:{...input.source,version:2}},
  {...input,images:[input.images[0],{...input.images[1],data:Buffer.concat([png,Buffer.from([1])]).toString('base64')}]},
  {...input,images:[...input.images].reverse()},
 ];
 for(const changed of variants)assert.notEqual(artworkInputDigest(changed),digest);
 const changedProposals=[{...proposal,prompt:'Outro pedido'},{...proposal,operation:'create',baseImageId:null},{...proposal,referenceIds:[]}];
 for(const changed of changedProposals)assert.notEqual(imageProposalDigest(changed),imageProposalDigest(proposal));
 assert.equal(imageProposalDigest({referenceIds:[refId],baseImageId:baseId,operation:'edit',prompt:proposal.prompt}),imageProposalDigest(proposal));
});

test('referências ausentes, trocadas, extras ou remotas falham sem descarte silencioso',()=>{
 assert.doesNotThrow(()=>validateArtworkForProposal(proposal,input));
 for(const images of [input.images.slice(0,1),[...input.images].reverse(),[input.images[1]],[]])assert.throws(()=>validateArtworkForProposal(proposal,{...input,images}));
 assert.throws(()=>validateArtworkForProposal(proposal,{...input,source:{pieceId:refId,version:1}}));
 assert.throws(()=>parseArtworkInput({...input,images:[{id:baseId,role:'base',url:'http://localhost/internal'}]}));
 assert.throws(()=>parseArtworkInput({...input,images:[{...input.images[0],data:'https://example.com/image.png'}]}));
 assert.throws(()=>parseArtworkInput({...input,images:[{...input.images[0],mime:'image/svg+xml'}]}));
});

test('pacote rejeita dados inválidos e tamanho acima do orçamento antes da execução',()=>{
 assert.throws(()=>parseArtworkInput({...input,literalText:{...input.literalText,price:'valor\u0000'}}));
 assert.throws(()=>parseArtworkInput({...input,images:[{...input.images[0],data:Buffer.concat([png,Buffer.alloc(2*1024*1024)]).toString('base64')}]}));
 assert.throws(()=>imageProposalDigest({...proposal,operation:null}));
 assert.throws(()=>imageProposalDigest({...proposal,referenceIds:null}));
 assert.throws(()=>imageProposalDigest({...proposal,referenceIds:[refId,refId]}));
});

test('título multilinha é preservado literalmente, mantendo outros controles inválidos',()=>{
 const headline='Primeira linha\nSegunda linha';
 const multiline={...input,literalText:{...input.literalText,headline}};
 assert.equal(parseArtworkInput(multiline).literalText.headline,headline);
 assert.ok(compileArtworkPrompt(proposal,multiline).includes(JSON.stringify(headline)));
 assert.notEqual(artworkInputDigest(multiline),artworkInputDigest({...multiline,literalText:{...multiline.literalText,headline:headline.replace('\n',' ')}}));
 for(const control of ['\u0000','\t','\r'])assert.throws(()=>parseArtworkInput({...multiline,literalText:{...multiline.literalText,headline:`A${control}B`}}));
 assert.throws(()=>parseArtworkInput({...multiline,literalText:{...multiline.literalText,price:'R$ 10\n'} }));
});

test('campos dinâmicos integram o prompt e o vínculo da geração sem afetar o formato legado',()=>{
 const field={id:'33333333-3333-4333-8333-333333333333',label:'Local',value:'Ateliê central',origin:'user'};
 const next={...input,literalText:{...input.literalText,fields:[field]}};
 assert.match(compileArtworkPrompt(proposal,next),/Ateliê central/);
 assert.notEqual(artworkInputDigest(next),artworkInputDigest(input));
 assert.notEqual(artworkInputDigest(next),artworkInputDigest({...next,literalText:{...next.literalText,fields:[{...field,value:'Outro lugar'}]}}));
 assert.deepEqual(parseArtworkInput(input),input);
 assert.throws(()=>parseArtworkInput({...next,literalText:{...next.literalText,fields:[field,field]}}));
 assert.throws(()=>parseArtworkInput({...next,literalText:{...next.literalText,fields:[{...field,value:'sk-segredo'}]}}));
});
