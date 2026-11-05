import test from 'node:test';
import assert from 'node:assert/strict';
import {parseStudioAction, AGENT_STUDIO_TOOLS} from '../src/studio-chat-tools.mjs';

const proposal={projectId:'11111111-1111-4111-8111-111111111111',requestId:'22222222-2222-4222-8222-222222222222',revision:3,viewpoint:'recipient',dimension:'message',statement:'Convidativo, sem pressão',example:'Conheça a oficina e veja se combina com você.',counterexample:'Compre agora ou fique para trás.',exampleReferenceId:'',counterexampleReferenceId:'',provenance:'hypothesis',source:'',tension:'O criador prefere um CTA mais urgente.'};

test('critério conserva perspectivas, contraste e incerteza sem conceder decisão ao agente',()=>{
  assert.deepEqual(parseStudioAction('compor_propor_criterio',proposal),proposal);
  for(const field of ['accepted','creatorDecision','decision'])assert.throws(()=>parseStudioAction('compor_propor_criterio',{...proposal,[field]:'accept'}));
  assert.equal(AGENT_STUDIO_TOOLS.some(tool=>/decidir_criterio|aceitar_criterio/.test(tool.name)),false);
});
test('critério exige contraste concreto, referência válida e fonte pública HTTPS',()=>{
  for(const patch of [{example:' '},{counterexample:''},{exampleReferenceId:'https://example.com/image.png'},{provenance:'observed'},{viewpoint:'everyone'},{source:'sk-private-key'},{provenance:'public_source',source:''},{provenance:'public_source',source:'http://example.com'}])assert.throws(()=>parseStudioAction('compor_propor_criterio',{...proposal,...patch}));
  assert.equal(parseStudioAction('compor_propor_criterio',{...proposal,provenance:'public_source',source:'https://example.com/study'}).source,'https://example.com/study');
});
