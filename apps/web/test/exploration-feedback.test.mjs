import test from 'node:test';
import assert from 'node:assert/strict';
import {readExplorationSignals} from '../lib/exploration-feedback.ts';

const projectId='00000000-0000-4000-8000-000000000001';
const pieceId='00000000-0000-4000-8000-000000000002';
const generated='/api/studio/explorations/signals',external='/api/studio/references/signals';

test('os dois históricos usam escopo de conta e só incluem a peça quando ela foi indicada',async()=>{
  for(const piece of ['references',pieceId]){
    const calls=[],completions=[];
    const stop=new AbortController();
    const fetchApi=(path,options)=>{
      const {method,headers,body,signal}=options;
      assert.equal(method,'POST');
      assert.deepEqual(headers,{'content-type':'application/json'});
      assert.equal(signal,stop.signal);
      calls.push([path,JSON.parse(body)]);
      return new Promise(resolve=>completions.push(()=>resolve(Response.json({signals:[]}))));
    };
    const result=readExplorationSignals(projectId,piece,fetchApi,stop.signal);
    const expected=[generated,external].flatMap(path=>[
      [path,{projectId,scope:'account'}],
      ...(piece!=='references'?[[path,{projectId,scope:'project',pieceId:piece}]]:[]),
    ]);
    assert.deepEqual(calls,expected);
    for(const complete of completions.reverse())complete();
    assert.deepEqual(await result,{generatedSignals:[],referenceSignals:[]});
  }
});

test('um retorno inválido ou cancelamento interrompe a leitura inteira',async()=>{
  const fetchInvalid=async path=>Response.json(path===external?{signals:[{}]}:{signals:[]});
  await assert.rejects(readExplorationSignals(projectId,pieceId,fetchInvalid));
  const stop=new AbortController();
  const cancelled=()=>new Promise((_resolve,reject)=>stop.signal.addEventListener('abort',()=>reject(stop.signal.reason),{once:true}));
  const result=readExplorationSignals(projectId,'references',cancelled,stop.signal);
  stop.abort();
  await assert.rejects(result,{name:'AbortError'});
});
