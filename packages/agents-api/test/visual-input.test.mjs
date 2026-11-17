import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {validateVisualInputManifest,validateVisualReferenceSelection,visualInputMatchesProject} from '../src/visual-input-contract.mjs';
import {parseVisualInput,parseSelectedVisualInput,visualInputDigest} from '../src/visual-input.mjs';

const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4AWJiYGBgAAAAAP//XRcpzQAAAAZJREFUAwAADwADJDd96QAAAABJRU5ErkJggg==','base64');
const sha256=value=>createHash('sha256').update(value).digest('hex');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
function fixture(count=2){
 const entries=Array.from({length:count},(_,i)=>({id:id(i+1),ordinal:i+1,role:'reference',inputOrigin:'local-upload',original:{sha256:sha256(bytes),mime:'image/png',byteLength:bytes.length},transport:{sha256:sha256(bytes),mime:'image/png',byteLength:bytes.length,width:1,height:1},transformation:'none'}));
 return {manifest:{version:1,policy:'optimized-v1',entries},images:entries.map(e=>({id:e.id,mime:'image/png',data:bytes.toString('base64')}))};
}

test('conjunto integral ordenado preserva bytes e manifesto; vazio é explícito',()=>{
 const f=fixture(),out=parseVisualInput(f.manifest,f.images);
 assert.deepEqual(out,{visualInput:f.manifest,referenceImages:f.images});
 assert.equal(validateVisualInputManifest(f.manifest),true);
 assert.deepEqual(parseVisualInput(fixture(0).manifest,[]).referenceImages,[]);
 assert.match(visualInputDigest(f.manifest),/^[a-f0-9]{64}$/);
 assert.equal(visualInputDigest({...f.manifest,entries:f.manifest.entries.map(e=>({...e,original:{...e.original}}))}),visualInputDigest(f.manifest));
 assert.throws(()=>{out.visualInput.entries[0].transport.sha256='0'.repeat(64);});
 f.manifest.entries[0].transport.sha256='0'.repeat(64);
 assert.notEqual(out.visualInput.entries[0].transport.sha256,f.manifest.entries[0].transport.sha256);
});

test('omissão, subconjunto, extras, ordem e bytes adulterados falham antes do efeito',()=>{
 const f=fixture();
 for(const images of [undefined,[],f.images.slice(0,1),[...f.images,f.images[0]],[...f.images].reverse(),f.images.map((x,i)=>i?x:{...x,data:Buffer.concat([bytes,Buffer.from('x')]).toString('base64')}),f.images.map((x,i)=>i?x:{...x,mime:'image/jpeg'})])assert.throws(()=>parseVisualInput(f.manifest,images));
 assert.throws(()=>parseVisualInput(undefined,f.images));
});

test('manifesto estrito limita origem, IDs, dimensões, bytes e transformação',()=>{
 const variants=[f=>f.version=2,f=>f.policy='silently-convert',f=>f.entries[0].inputOrigin='external',f=>f.entries[0].extra='ignored',f=>f.entries[0].ordinal=2,f=>f.entries[1].id=f.entries[0].id,f=>f.entries[0].transport.width=0,f=>f.entries[0].transport.width=16385,f=>{f.entries[0].transport.width=10000;f.entries[0].transport.height=10000;},f=>f.entries[0].original.byteLength=8*1024*1024+1,f=>f.entries[0].transport.byteLength=2*1024*1024+1,f=>f.entries[0].transport.sha256='f'.repeat(64)];
 for(const mutate of variants){const f=fixture().manifest;mutate(f);assert.equal(validateVisualInputManifest(f),false);assert.throws(()=>visualInputDigest(f));}
 assert.equal(validateVisualInputManifest(fixture(20).manifest),true);
 assert.equal(validateVisualInputManifest(fixture(21).manifest),false);
 const copy=fixture();copy.manifest.entries[0].original.sha256='f'.repeat(64);copy.manifest.entries[0].transformation='optimized-v1';assert.equal(validateVisualInputManifest(copy.manifest),true);
 assert.deepEqual(parseVisualInput(copy.manifest,copy.images).visualInput,copy.manifest);
});

test('hash correspondente não torna cabeçalho, truncamento ou dimensão falsa válidos',()=>{
 for(const changed of [bytes.subarray(0,24),Buffer.from('not a png'),Buffer.concat([bytes,Buffer.from('trailing')])]){
  const f=fixture(1),meta={sha256:sha256(changed),mime:'image/png',byteLength:changed.length};Object.assign(f.manifest.entries[0],{original:meta,transport:{...meta,width:1,height:1}});f.images[0].data=changed.toString('base64');assert.throws(()=>parseVisualInput(f.manifest,f.images));
 }
 const f=fixture(1);f.manifest.entries[0].transport.width=2;assert.throws(()=>parseVisualInput(f.manifest,f.images));
 const malformed=fixture(1);malformed.images[0].data=malformed.images[0].data.replace(/=+$/,'');assert.throws(()=>parseVisualInput(malformed.manifest,malformed.images));
});

function triage(){
 const f=fixture(3);f.manifest.version=2;f.manifest.externalConsent=true;
 f.manifest.entries[0].source=null;
 Object.assign(f.manifest.entries[1],{inputOrigin:'external',source:{originUrl:'https://www.pinterest.com/pin/synthetic/',board:'behance/advertising'}});
 Object.assign(f.manifest.entries[2],{inputOrigin:'generated',source:{projectId:id(17),imageId:id(18)}});
 return f;
}
test('v2 separa uploads obrigatórios de candidatos e valida o subset exato em ordem',()=>{
 const f=triage(),ids=[id(1),id(3)];assert.equal(validateVisualInputManifest(f.manifest),true);
 assert.equal(validateVisualReferenceSelection(f.manifest,ids),true);assert.equal(visualInputMatchesProject(f.manifest,id(17)),true);assert.equal(visualInputMatchesProject(f.manifest,id(19)),false);
 assert.deepEqual(parseSelectedVisualInput(f.manifest,[f.images[0],f.images[2]],ids).referenceImages,[f.images[0],f.images[2]]);
 assert.throws(()=>parseSelectedVisualInput(f.manifest,f.images,ids));
 for(const bad of [[],[id(2)],[id(3),id(1)],[id(1),id(1)],[id(1),id(99)]])assert.equal(validateVisualReferenceSelection(f.manifest,bad),false);
 assert.equal(validateVisualReferenceSelection(f.manifest,[id(1)]),true);
 assert.equal(parseVisualInput(f.manifest,f.images).referenceImages.length,3);
});
test('v1 não aceita origens novas e v2 não atribui consentimento/proveniência ausentes',()=>{
 const f=triage();for(const mutate of [x=>x.externalConsent=false,x=>delete x.externalConsent,x=>delete x.entries[1].source,x=>x.entries[1].source.originUrl='https://evil.test/image.png',x=>x.entries[2].source.projectId='bad',x=>x.entries[0].source={projectId:id(17),imageId:id(18)}]){const bad=structuredClone(f.manifest);mutate(bad);assert.equal(validateVisualInputManifest(bad),false);}
 const old=fixture(3).manifest;Object.assign(old.entries[1],{inputOrigin:'external',source:f.manifest.entries[1].source});assert.equal(validateVisualInputManifest(old),false);
 const changed=structuredClone(f.manifest);changed.entries[1].source.originUrl='https://www.pinterest.com/pin/another/';assert.notEqual(visualInputDigest(changed),visualInputDigest(f.manifest));
});
