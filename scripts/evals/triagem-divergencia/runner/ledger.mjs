import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';

export const digest = value => createHash('sha256').update(value).digest('hex');
export const fingerprint = value => digest(JSON.stringify(value));

/** Reserve before POST. Even a lost response consumes the scoped allowance. */
export function openLedger(file, protocol) {
  const db = new DatabaseSync(file);
  db.exec(`PRAGMA busy_timeout=5000; PRAGMA synchronous=FULL;
    CREATE TABLE IF NOT EXISTS protocol (id INTEGER PRIMARY KEY CHECK(id=1), binding TEXT NOT NULL);
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
  function update(id, state, result) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const row = get(id);
      if (!row || !['submitted','bound'].includes(row.state)) throw Error('receipt_closed');
      if (!['bound','complete','invalid','rejected','unknown'].includes(state)) throw Error('invalid_state');
      db.prepare('UPDATE calls SET state=?, result=? WHERE id=?').run(state, JSON.stringify({...row.result,...result}),id);
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  return {get,reserve,update,close:()=>db.close()};
}
