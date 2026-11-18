import assert from 'node:assert/strict';
import test from 'node:test';
import {openLedger} from './ledger.mjs';

test('unknown outcomes consume budget and cannot be sent again',()=>{
  const db=openLedger(':memory:',{plans:60,images:60});
  db.reserve('a','image',{prompt:'same'});
  db.update('a','unknown',{});
  assert.throws(()=>db.reserve('a','image',{prompt:'same'}),/existing_attempt/);
  for(let i=1;i<60;i++) db.reserve(String(i),'image',{});
  assert.throws(()=>db.reserve('over','image',{}),/allowance/);
  assert.equal(db.get('a').state,'unknown');
  db.close();
});

test('admission is exclusive and the last terminal receipt starts the cooldown even if the caller crashes',()=>{
  const db=openLedger(':memory:',{plans:60,images:60});
  assert.equal(db.admitLot('first',['a','b','c'],1000),0);
  assert.throws(()=>db.admitLot('next',['d','e','f'],2000),/active_batch/);
  for(const id of ['a','b','c'])db.reserve(id,'image',{});
  db.update('a','complete',{},1100);db.update('b','complete',{},9000);
  assert.throws(()=>db.admitLot('next',['d','e','f'],35000),/active_batch/);
  db.update('c','complete',{},40000);
  assert.equal(db.admitLot('next',['d','e','f'],40100),14900);
  assert.equal(db.admitLot('next',['d','e','f'],55000),0);
  db.close();
});
