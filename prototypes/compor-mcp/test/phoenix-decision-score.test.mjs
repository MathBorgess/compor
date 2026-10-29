import test from 'node:test';
import assert from 'node:assert/strict';
import { DECISION_SCORE_LEVELS, scoreCandidatesWithDecisions } from '../dist/phoenix_engine/services/decision_score_ranker.js';
import { decisionScoreBatchSchema } from '../dist/phoenix_engine/domain/models.js';
const candidate = (id, extra={}) => ({candidate_id:id,board:'test/board',metadata_sid:['editorial','grid'],visual_description:`Metadado ${id}`, ...extra});
const common = {briefing:'Curso fictício',profileContext:'Não há preferências confirmadas.',consentModel:true,consentImages:true};
const probabilities = [0.1,0.2,0.3,0.4].map((p,i)=>({label:DECISION_SCORE_LEVELS[i].label,probability:p,value:i}));
const score = name => ({name,type:'score',confidence:.8,score:2,probabilities});
const mkClient = callback => ({decisions:{create:async request => callback(request)}});
const usage = {input_tokens:123,output_tokens:0,input_tokens_details:{cached_tokens:23,cache_write_tokens:0},output_tokens_details:{reasoning_tokens:0},total_tokens:123};

test('scores every supplied candidate with independent questions and preserves probabilities, visual scope and metrics', async () => {
  const png = Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(10)]).toString('base64');
  const calls=[];
  const client=mkClient(request=>{calls.push(request);return {model:'gpt-6-luna',answers:request.questions.map(q=>score(q.name)),usage}});
  const result=await scoreCandidatesWithDecisions({...common,client,batchSize:2,candidates:[candidate('a',{thumbnail_base64:png,thumbnail_mime_type:'image/png'}),candidate('b'),candidate('c')]});
  assert.equal(calls.length,2); assert.equal(result.requested,3); assert.equal(result.scored,3);
  assert.equal(result.probability_semantics,'decision_level_probabilities_not_token_logprobs');
  assert.deepEqual(result.candidates.map(c=>c.candidate_id),['a','b','c']);
  assert.equal(result.candidates[0].evidence,'image_and_metadata');
  assert.equal(result.candidates[1].evidence,'metadata_only');
  assert.equal(calls[0].questions[0].instructions[1].type,'input_image');
  assert.equal(calls[0].questions[1].instructions.length,1);
  assert.match(calls[0].questions[0].instructions[0].text,/board é solicitado.*SID são etiquetas inferidas/);
  assert.match(calls[0].questions[0].instructions[0].text,/Não atribua características visuais à imagem apenas por esses textos/);
  assert.ok(Math.abs(result.candidates[0].score-9)<1e-10);
  assert.ok(Math.abs(result.candidates[0].level_probabilities[0].log_probability-Math.log(.1))<1e-10);
  assert.equal(result.requests[0].cached_input_tokens,23);
  assert.notEqual(calls[0].questions[0].name,calls[0].questions[1].name);
});

test('preserves model identity for each batch and never reports only the last of mixed models', async () => {
  let n=0;
  const client=mkClient(request=>({model:['gpt-6-luna-snapshot-a','gpt-6-luna-snapshot-b'][n++],answers:request.questions.map(q=>score(q.name)),usage}));
  const result=await scoreCandidatesWithDecisions({...common,client,batchSize:2,candidates:['a','b','c'].map(candidate)});
  assert.equal(result.model,null);
  assert.deepEqual(result.effective_models,['gpt-6-luna-snapshot-a','gpt-6-luna-snapshot-b']);
  assert.deepEqual(result.requests.map(r=>[r.start_index,r.count,r.model]),[[0,2,'gpt-6-luna-snapshot-a'],[2,1,'gpt-6-luna-snapshot-b']]);
  assert.deepEqual(result.candidates.map(c=>c.candidate_id),['a','b','c']);
  assert.equal(decisionScoreBatchSchema.safeParse(result).success,true);
  const legacy={...result};delete legacy.effective_models;legacy.requests=legacy.requests.map(({start_index,model,...rest})=>rest);
  assert.equal(decisionScoreBatchSchema.safeParse(legacy).success,true,'existing saved payloads remain readable');
});

test('does not attribute a missing model to another successful batch or a failed call', async () => {
  let n=0;
  const client=mkClient(request=>{n++;if(n===3)throw new Error('private');return {model:n===1?'gpt-6-luna-snapshot-a':undefined,answers:request.questions.map(q=>score(q.name)),usage};});
  const result=await scoreCandidatesWithDecisions({...common,client,batchSize:1,candidates:['a','b','c'].map(candidate)});
  assert.equal(result.model,null);
  assert.deepEqual(result.effective_models,['gpt-6-luna-snapshot-a']);
  assert.deepEqual(result.requests.map(r=>r.model),['gpt-6-luna-snapshot-a',null,null]);
  assert.equal(result.requests[2].status,'provider_error');
  assert.deepEqual(result.candidates.map(c=>c.status),['scored','scored','unscored']);
});

test('refusal, absent, duplicated, inconsistent and out-of-range answers never receive scores', async () => {
  const client=mkClient(request=>({model:'gpt-6-luna',usage,answers:[
    {name:request.questions[0].name,type:'refusal'},
    score(request.questions[2].name),score(request.questions[2].name),
    {...score(request.questions[3].name),score:0},
    {...score(request.questions[4].name),probabilities:[...probabilities.slice(0,3),{...probabilities[3],probability:1.1}]},
    score('unknown'),
  ]}));
  const result=await scoreCandidatesWithDecisions({...common,client,candidates:['a','b','c','d','e'].map(id=>candidate(id))});
  assert.equal(result.scored,0);
  assert.deepEqual(result.candidates.map(c=>c.reason),['refused','missing_answer','invalid_answer','invalid_answer','invalid_answer']);
  assert.ok(result.candidates.every(c=>c.score===null));
  assert.equal(result.requests[0].unknown_answer_count,1);
});

test('consent is mandatory and absent images or network failure remain explicitly unscored', async () => {
  let called=0; const client=mkClient(()=>{called++;throw new Error('private details')});
  await assert.rejects(scoreCandidatesWithDecisions({...common,consentModel:false,client,candidates:[candidate('a')]}),/consent/i);
  assert.equal(called,0);
  const result=await scoreCandidatesWithDecisions({...common,consentImages:false,client,candidates:[candidate('a',{thumbnail_base64:'aGVsbG8=',thumbnail_mime_type:'image/png'})]});
  assert.equal(result.candidates[0].reason,'provider_error'); assert.equal(result.candidates[0].image_note,'not_authorized');
  assert.doesNotMatch(JSON.stringify(result),/private details/);
  assert.equal((await scoreCandidatesWithDecisions({...common,client:null,candidates:[candidate('a')]})).candidates[0].reason,'missing_client');
  await assert.rejects(scoreCandidatesWithDecisions({...common,client,candidates:[candidate('a'),candidate('a')]}),/duplicate/i);
});

test('a malformed answer after a valid one does not duplicate or erase either candidate', async () => {
  const client=mkClient(request=>({model:'gpt-6-luna',usage,answers:[score(request.questions[0].name),{...score(request.questions[1].name),probabilities:undefined}]}));
  const result=await scoreCandidatesWithDecisions({...common,client,candidates:[candidate('a'),candidate('b')]});
  assert.deepEqual(result.candidates.map(c=>c.candidate_id),['a','b']);
  assert.deepEqual(result.candidates.map(c=>c.reason),['ok','invalid_answer']);
});

test('an image is not claimed sent or evaluated after a missing client or an uncertain provider failure', async () => {
  const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(10)]).toString('base64');
  const candidates=[candidate('a',{thumbnail_base64:png,thumbnail_mime_type:'image/png'})];
  const missing=await scoreCandidatesWithDecisions({...common,client:null,candidates});
  assert.equal(missing.candidates[0].image_note,'not_sent');
  assert.equal(missing.candidates[0].evidence,'not_evaluated');
  const failed=await scoreCandidatesWithDecisions({...common,client:mkClient(()=>{throw new Error('timeout')}),candidates});
  assert.equal(failed.candidates[0].image_note,'delivery_unknown');
  assert.equal(failed.candidates[0].evidence,'not_evaluated');
});
