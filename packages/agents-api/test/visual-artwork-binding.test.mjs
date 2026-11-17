import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createSessionBindings} from '../src/session-binding.mjs';
import {visualInputDigest} from '../src/visual-input.mjs';
import {validateArtworkForProposal} from '../src/artwork-input.mjs';

const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4AWJiYGBgAAAAAP//XRcpzQAAAAZJREFUAwAADwADJDd96QAAAABJRU5ErkJggg==','base64');
const sha256=createHash('sha256').update(bytes).digest('hex'),file={sha256,mime:'image/png',byteLength:bytes.length};
const manifest={version:1,policy:'optimized-v1',entries:[1,2].map((n,index)=>({id:id(n+10),ordinal:index+1,role:'reference',inputOrigin:'local-upload',original:file,transport:{...file,width:1,height:1},transformation:'none'}))};
const proposal={prompt:'Arte sintética',operation:'edit',baseImageId:id(4),referenceIds:manifest.entries.map(item=>item.id)};
const referenceImages=manifest.entries.map(item=>({id:item.id,role:'reference',mime:'image/png',data:bytes.toString('base64')}));
const artwork={literalText:{headline:'Oficina',price:'',date:''},source:{pieceId:id(4),version:1},images:[{id:id(4),role:'base',mime:'image/png',data:bytes.toString('base64')},...referenceImages],visualInput:manifest};
const scope={userId:id(1),projectId:id(2),attemptId:id(3),sessionId:'sess_visual'};

test('recuperação e aprovação vinculam todas as imagens, ordem, bytes e origem',()=>{
 const bindings=createSessionBindings({secret:Buffer.alloc(32,7)}),digest=visualInputDigest(manifest),ids=manifest.entries.map(item=>item.id);
 const recovery=bindings.issueRecovery({...scope,conversationId:id(4),visualInputDigest:digest,visualReferenceIds:ids});
 assert.deepEqual(bindings.verifyRecovery({...scope,token:recovery}).visualReferenceIds,ids);
 assert.equal(bindings.verifyRecovery({...scope,token:recovery}).visualInputDigest,digest);
 const action=bindings.issueAction({...scope,turnId:'turn_1',callId:'call_1',proposal,visualInputDigest:digest});
 const approved=bindings.issueApprovedAction({...scope,actionBinding:action,pieceId:id(4),version:2,artworkInput:artwork});
 assert.ok(bindings.verifyApprovedAction({...scope,token:approved,pieceId:id(4),version:2}));
 assert.doesNotThrow(()=>validateArtworkForProposal(proposal,artwork));
 for(const changed of [[],ids.slice(0,1),[...ids].reverse(),[...ids,id(99)]])assert.throws(()=>validateArtworkForProposal({...proposal,referenceIds:changed},artwork));
 for(const changed of [{...artwork,visualInput:undefined},{...artwork,images:[artwork.images[0],artwork.images[1]]},{...artwork,images:[artwork.images[0],artwork.images[2],artwork.images[1]]},{...artwork,images:[artwork.images[0],{...artwork.images[1],data:Buffer.concat([bytes,Buffer.from('x')]).toString('base64')},artwork.images[2]]}])assert.throws(()=>bindings.issueApprovedAction({...scope,actionBinding:action,pieceId:id(4),version:2,artworkInput:changed}));
 const legacy=bindings.issueAction({...scope,turnId:'turn_1',callId:'call_1',proposal});assert.throws(()=>bindings.issueApprovedAction({...scope,actionBinding:legacy,pieceId:id(4),version:2,artworkInput:artwork}));
});
