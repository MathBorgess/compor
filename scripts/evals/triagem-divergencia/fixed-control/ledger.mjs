import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {fingerprint} from '../runner/ledger.mjs';

const origin='fixed-control/0/';
const numberOfMain="(SELECT count(*) FROM calls WHERE kind='image')";
const numberOfFixed='(SELECT count(*) FROM fixed_control_calls)';
const combined=numberOfMain+'+'+numberOfFixed;
const setup = `
  CREATE TABLE IF NOT EXISTS fixed_control_calls (
    id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind='image'), binding TEXT NOT NULL,
    started TEXT NOT NULL, state TEXT NOT NULL, result TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS fixed_control_lots (
    id TEXT PRIMARY KEY REFERENCES lots(id), binding TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS fixed_control_slots (
    call_id TEXT PRIMARY KEY, lot_id TEXT NOT NULL REFERENCES fixed_control_lots(id));

  CREATE TRIGGER IF NOT EXISTS fixed_control_guard_main BEFORE INSERT ON calls WHEN NEW.kind='image' BEGIN
    SELECT CASE WHEN ${combined} >= 60 THEN RAISE(ABORT,'combined_image_allowance_exhausted') END;
    SELECT CASE WHEN EXISTS(SELECT 1 FROM lots JOIN fixed_control_lots USING(id) WHERE ended_ms IS NULL)
      THEN RAISE(ABORT,'fixed_control_pair_active') END;
  END;
  CREATE TRIGGER IF NOT EXISTS fixed_control_guard_fixed BEFORE INSERT ON fixed_control_calls BEGIN
    SELECT CASE WHEN EXISTS(SELECT 1 FROM fixed_control_calls WHERE state IN ('unknown','invalid','rejected'))
      THEN RAISE(ABORT,'uncertain_fixed_attempt_no_dispatch') END;
    SELECT CASE WHEN ${combined} >= 60 OR ${numberOfFixed} >= 10 THEN RAISE(ABORT,'fixed_control_allowance_exhausted') END;
    SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM fixed_control_slots s JOIN lots ON lots.id=s.lot_id
      WHERE s.call_id=NEW.id AND lots.ended_ms IS NULL) THEN RAISE(ABORT,'fixed_control_slot_not_admitted') END;
  END;
  CREATE TRIGGER IF NOT EXISTS fixed_control_guard_lot BEFORE INSERT ON lots BEGIN
    SELECT CASE WHEN ${combined} + CASE WHEN NEW.id GLOB 'fixed-control/0/*' THEN 2 ELSE 3 END > 60
      THEN RAISE(ABORT,'insufficient_allowance_for_complete_lot') END;
    SELECT CASE WHEN NEW.id GLOB 'fixed-control/0/*' AND ${numberOfFixed}+2 > 10
      THEN RAISE(ABORT,'insufficient_fixed_control_allowance') END;
  END;
`;

export function openFixedLedger(file, protocol, {readOnly=false}={}) {
  const db=new DatabaseSync(file,{readOnly});
  function transaction(fn) {
    db.exec('BEGIN IMMEDIATE');
    try {const result=fn();db.exec('COMMIT');return result;}
    catch(error){db.exec('ROLLBACK');throw error;}
  }
  function count() {
    const main=db.prepare("SELECT count(*) AS n FROM calls WHERE kind='image'").get().n;
    const fixed=hasFixed?db.prepare('SELECT count(*) AS n FROM fixed_control_calls').get().n:0;
    assert.ok(main+fixed<=60&&fixed<=10,'image allowance already exceeded');
    return {main,fixed,total:main+fixed};
  }
  let hasFixed;
  try {
    db.exec('PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;');
    assert.equal(db.prepare('SELECT binding FROM protocol WHERE id=1').get()?.binding,fingerprint(protocol),'different original SQLite');
    assert.equal(protocol.images,60);assert.equal(protocol.plans,60);
    if(!readOnly) {db.exec('PRAGMA synchronous=FULL;');transaction(()=>db.exec(setup));}
    hasFixed=Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='fixed_control_calls'").get());
    count();
  } catch(error){db.close();throw error;}
  function get(id) {
    const r=hasFixed && db.prepare('SELECT * FROM fixed_control_calls WHERE id=?').get(id);
    return r?{...r,result:JSON.parse(r.result)}:null;
  }
  function getLot(caseId) {
    if(!hasFixed)return null;
    const lot=db.prepare('SELECT lots.id, binding, started_ms, ended_ms FROM lots JOIN fixed_control_lots USING(id) WHERE lots.id=?').get(origin+caseId);
    return lot??null;
  }
  function requireIdle() {
    if(db.prepare('SELECT 1 FROM lots WHERE ended_ms IS NULL').get()||
       db.prepare("SELECT 1 FROM calls WHERE kind='image' AND state<>'complete' LIMIT 1").get()||
       (hasFixed&&db.prepare("SELECT 1 FROM fixed_control_calls WHERE state<>'complete' LIMIT 1").get())) {
      throw Error('active_or_uncertain_image_lot_no_resubmit');
    }
  }
  function admitPair(caseId,binding,now=Date.now()) {
    assert.ok(protocol.caseIds.includes(caseId));
    const id=origin+caseId;
    return transaction(()=>{
      requireIdle();
      assert.ok(!getLot(caseId),'fixed_control_pair_already_admitted');
      const last=db.prepare('SELECT MAX(ended_ms) AS end FROM lots').get().end;
      if(last!==null&&now<last+15000) return last+15000-now;
      db.prepare('INSERT INTO lots(id,started_ms) VALUES(?,?)').run(id,now);
      db.prepare('INSERT INTO fixed_control_lots VALUES(?,?)').run(id,binding);
      for(const arm of ['with','without']) db.prepare('INSERT INTO fixed_control_slots VALUES(?,?)').run('0/'+caseId+'/'+arm+'/1',id);
      return 0;
    });
  }
  function reserve(id,kind,body) {
    assert.equal(kind,'image');
    transaction(()=>{
      assert.ok(!get(id),'existing_fixed_control_attempt');
      db.prepare('INSERT INTO fixed_control_calls VALUES(?,?,?,?,?,?)').run(id,kind,fingerprint(body),new Date().toISOString(),'submitted','{}');
    });
  }
  function update(id,state,details,now=Date.now()) {
    transaction(()=>{
      const row=get(id);
      assert.ok(row && ['submitted','bound'].includes(row.state),'fixed_control_receipt_closed');
      assert.ok(['bound','complete','unknown'].includes(state),'invalid fixed image state');
      db.prepare('UPDATE fixed_control_calls SET state=?,result=? WHERE id=?').run(state,JSON.stringify({...row.result,...details}),id);
      if(state==='complete') {
        db.prepare(`UPDATE lots SET ended_ms=? WHERE ended_ms IS NULL AND id=(SELECT lot_id FROM fixed_control_slots WHERE call_id=?)
          AND 2=(SELECT count(*) FROM fixed_control_slots s JOIN fixed_control_calls c ON c.id=s.call_id
            WHERE s.lot_id=lots.id AND c.state='complete')`).run(now,id);
      }
    });
  }
  return {get,getLot,count,requireIdle,admitPair,reserve,update,close:()=>db.close()};
}
