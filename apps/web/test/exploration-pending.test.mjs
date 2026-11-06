import test from 'node:test';
import assert from 'node:assert/strict';
import { markBeforeDispatch } from '../lib/exploration-pending.ts';

test('desconexão antes do envio não deixa marcador de geração inexistente',()=>{
  const values=new Map();let connected=false;
  const storage={setItem:(k,v)=>values.set(k,v),getItem:k=>values.get(k)??null,removeItem:k=>values.delete(k)};
  assert.equal(markBeforeDispatch(storage,'pending','id',()=>connected),false);
  assert.equal(values.has('pending'),false);
  connected=true;
  const disconnecting={...storage,setItem(k,v){storage.setItem(k,v);connected=false;}};
  assert.equal(markBeforeDispatch(disconnecting,'pending','id',()=>connected),false);
  assert.equal(values.has('pending'),false);
  connected=true;
  assert.equal(markBeforeDispatch(storage,'pending','id',()=>connected),true);
  assert.equal(values.get('pending'),'id');
});
