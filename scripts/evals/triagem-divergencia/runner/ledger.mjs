import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';

export const digest = value => createHash('sha256').update(value).digest('hex');
export const fingerprint = value => digest(JSON.stringify(value));

/** Reserve before POST. Even a lost response consumes the scoped allowance. */
export function openLedger(file, protocol) {
  const db = new DatabaseSync(file);
  db.exec(`PRAGMA busy_timeout=5000; PRAGMA synchronous=FULL;
    CREATE TABLE IF NOT EXISTS protocol (id INTEGER PRIMARY KEY CHECK(id=1), binding TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS lots (id TEXT PRIMARY KEY, started_ms INTEGER NOT NULL, ended_ms INTEGER);
    CREATE UNIQUE INDEX IF NOT EXISTS single_active_lot ON lots((1)) WHERE ended_ms IS NULL;
    CREATE TABLE IF NOT EXISTS lot_slots (call_id TEXT PRIMARY KEY, lot_id TEXT NOT NULL REFERENCES lots(id));
    CREATE TABLE IF NOT EXISTS calls (
      id TEXT PRIMARY KEY, kind TEXT NOT NULL, binding TEXT NOT NULL,
      started TEXT NOT NULL, state TEXT NOT NULL, result TEXT NOT NULL
    )`);
  if (![0,60].includes(protocol.plans) || ![0,60,180].includes(protocol.images)) throw Error('invalid_allowance');
  const binding = fingerprint(protocol);
  db.prepare('INSERT OR IGNORE INTO protocol VALUES (1,?)').run(binding);
  if (db.prepare('SELECT binding FROM protocol').get().binding !== binding) throw Error('protocol_changed');
  const select = db.prepare('SELECT * FROM calls WHERE id=?');
  const get = id => {
    const row = select.get(id);
    return row ? {...row, result: JSON.parse(row.result)} : null;
  };
  function admitLot(id, ids, now=Date.now()) {
    if(ids.length!==3||new Set(ids).size!==3)throw Error('invalid_batch');
    db.exec('BEGIN IMMEDIATE');
    try {
      if(db.prepare('SELECT id FROM lots WHERE ended_ms IS NULL').get())throw Error('unresolved_or_active_batch');
      const {last}=db.prepare('SELECT MAX(ended_ms) AS last FROM lots').get();
      if(last!==null&&now<last+15000){
        db.exec('ROLLBACK');
        return last+15000-now;
      }
      db.prepare('INSERT INTO lots (id,started_ms) VALUES (?,?)').run(id,now);
      const add=db.prepare('INSERT INTO lot_slots (call_id,lot_id) VALUES (?,?)');
      for(const slot of ids)add.run(slot,id);
      db.exec('COMMIT');
      return 0;
    }catch(error){db.exec('ROLLBACK');throw error;}
  }
  function reserve(id, kind, request) {
    if (!['plan','image'].includes(kind)) throw Error('invalid_operation');
    db.exec('BEGIN IMMEDIATE');
    try {
      if (get(id)) throw Error('existing_attempt');
      const count = db.prepare('SELECT COUNT(*) AS count FROM calls WHERE kind=?').get(kind).count;
      if (count >= (kind === 'plan' ? protocol.plans : protocol.images)) throw Error('allowance_exhausted');
      db.prepare('INSERT INTO calls VALUES (?,?,?,?,?,?)').run(id,kind,fingerprint(request),new Date().toISOString(),'submitted','{}');
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  function update(id, state, result, now=Date.now()) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const row = get(id);
      if (!row || !['submitted','bound'].includes(row.state)) throw Error('receipt_closed');
      if (!['bound','complete','invalid','rejected','unknown'].includes(state)) throw Error('invalid_state');
      db.prepare('UPDATE calls SET state=?, result=? WHERE id=?').run(state, JSON.stringify({...row.result,...result}),id);
      if(row.kind==='image'&&state==='complete'){
        db.prepare(`UPDATE lots SET ended_ms=? WHERE ended_ms IS NULL AND id=(SELECT lot_id FROM lot_slots WHERE call_id=?)
          AND 3=(SELECT COUNT(*) FROM lot_slots s JOIN calls c ON c.id=s.call_id WHERE s.lot_id=lots.id AND c.state='complete')`).run(now,id);
      }
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  return {get,reserve,update,admitLot,close:()=>db.close()};
}
