import test from 'node:test';
import assert from 'node:assert/strict';
import {canStartReferenceRound} from '../lib/studio-reference-round.ts';
const fingerprint='["a"]',context='contexto';
const record={fingerprint,context,epoch:'old',status:'completed'};
const can=(record,epoch,contextValue=context)=>canStartReferenceRound({record,round:{fingerprint,epoch},fingerprint,context:contextValue,failed:false});
test('resultado desconhecido bloqueia rodada mesmo após limpar e selecionar novamente',()=>{
 assert.equal(can({...record,status:'submitted'},'new','novo briefing'),false);
});
test('recarga suprime duplicata, mas mudança de seleção ou contexto inicia nova rodada',()=>{
 assert.equal(can(record,'old'),false);assert.equal(can(record,'new'),true);assert.equal(can(record,'old','novo briefing'),true);
});
test('rodada de outra seleção e dados de storage inválidos falham fechados',()=>{
 assert.equal(canStartReferenceRound({record,round:{fingerprint:'["b"]',epoch:'new'},fingerprint,context,failed:false}),false);
 assert.equal(can(null,'new'),false);
});
