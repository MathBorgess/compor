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
