import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {ParallelExplorationProgress} from '../app/parallel-exploration-progress.tsx';

test('três posições preservam sua ordem e mostram estados sem alegar atividade do fornecedor',()=>{
 const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
 const progress={children:[{requestId:id(3),position:3,status:'completed',revision:1,confirmedAt:300},{requestId:id(1),position:1,status:'unknown',revision:1,confirmedAt:null},{requestId:id(2),position:2,status:'rejected',revision:1,confirmedAt:null}],wait:{mode:'none'}};
 const rendered=[];
 const html=renderToStaticMarkup(React.createElement(ParallelExplorationProgress,{progress,renderConfirmedImage:requestId=>{rendered.push(requestId);return React.createElement('span',null,'Imagem local');}}));
 assert.match(html,/1 de 3 imagens confirmadas/);assert.ok(html.indexOf('Proposta 1')<html.indexOf('Proposta 2'));assert.ok(html.indexOf('Proposta 2')<html.indexOf('Proposta 3'));
 assert.match(html,/Resultado desconhecido/);assert.match(html,/Envio recusado/);assert.match(html,/não será repetida automaticamente/);assert.deepEqual(rendered,[id(3)]);
 assert.doesNotMatch(html,/processando|gerando|em andamento/i);
});
