import test from 'node:test';
import assert from 'node:assert/strict';
import {imageRejectedBeforeDispatch,imagePreflightRejected,recordImageNotDispatched} from '../lib/image-dispatch-state.ts';

test('somente rejeição local inequívoca é tratada como não enviada',()=>{
 assert.equal(imageRejectedBeforeDispatch(400,'invalid_request'),true);
 for(const [status,error] of [[500,'invalid_request'],[400,'other'],[502,'result_unknown'],[503,'unavailable']]) assert.equal(imageRejectedBeforeDispatch(status,error),false);
});
test('decisão é registrada antes de liberar apenas o marcador da tentativa correspondente',()=>{
 const data=new Map([['submitted','attempt']]);
 const storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};
 assert.equal(recordImageNotDispatched(storage,'submitted','rejected','other'),false);
 assert.equal(data.get('submitted'),'attempt');
 assert.equal(recordImageNotDispatched(storage,'submitted','rejected','attempt'),true);
 assert.equal(data.has('submitted'),false);assert.equal(data.get('rejected'),'attempt');
 data.set('submitted','attempt');
 assert.throws(()=>recordImageNotDispatched({...storage,setItem:()=>{throw Error('quota');}},'submitted','rejected','attempt'));
 assert.equal(data.get('submitted'),'attempt');
});

test('preflight correlaciona somente a chamada HTTP e não dispensa cerca no servidor',()=>{
 const expected={requestId:'request',attemptId:'attempt',dispatchId:'unique-dispatch'},value={error:'image_preflight_unavailable',...expected};
 assert.equal(imagePreflightRejected(503,value,expected),true);
 for(const changed of [{...value,requestId:'other'},{...value,attemptId:'other'},{...value,dispatchId:'other'},{...value,error:'unavailable'},{...value,extra:true},{error:'unavailable'},null])assert.equal(imagePreflightRejected(503,changed,expected),false);
 assert.equal(imagePreflightRejected(502,value,expected),false);
 assert.equal(imagePreflightRejected(503,value,{...expected,dispatchId:undefined}),false);
});
