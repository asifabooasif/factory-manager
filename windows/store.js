/* Local database on this PC (SQLite). Firebase stays the primary; this keeps a complete, queryable copy on disk.
   Uses only prepare/run/get/all/exec so it runs on better-sqlite3 (the app) and node:sqlite (tests). */
const fs = require('fs'), path = require('path');
function openDb(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let db;
  try { const B = require('better-sqlite3'); db = new B(file); }
  catch (e) { const { DatabaseSync } = require('node:sqlite'); db = new DatabaseSync(file); }
  db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;');
  db.exec(`
CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS runs(run_id INTEGER PRIMARY KEY AUTOINCREMENT, factory_id TEXT, factory_name TEXT, at TEXT, by_user TEXT,
  sent INTEGER, added INTEGER, changed INTEGER, unchanged INTEGER, removed INTEGER, restored INTEGER, balanced INTEGER, ok INTEGER, note TEXT);
CREATE TABLE IF NOT EXISTS records(factory_id TEXT NOT NULL, col TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL,
  first_seen TEXT, last_seen TEXT, changed_at TEXT, deleted_at TEXT, PRIMARY KEY(factory_id, col, id));
CREATE INDEX IF NOT EXISTS records_live ON records(factory_id, col) WHERE deleted_at IS NULL;
CREATE TABLE IF NOT EXISTS record_history(hid INTEGER PRIMARY KEY AUTOINCREMENT, factory_id TEXT, col TEXT, id TEXT, data TEXT, replaced_at TEXT, run_id INTEGER);
CREATE INDEX IF NOT EXISTS hist_idx ON record_history(factory_id, col, id);
CREATE TABLE IF NOT EXISTS gl_lines(factory_id TEXT, entry_id TEXT, line_no INTEGER, entry_no TEXT, date TEXT, acc TEXT, dr INTEGER, cr INTEGER, job TEXT, cat TEXT, art TEXT,
  PRIMARY KEY(factory_id, entry_id, line_no));
CREATE INDEX IF NOT EXISTS gl_acc ON gl_lines(factory_id, acc, date);
CREATE VIEW IF NOT EXISTS v_trial_balance AS SELECT factory_id, acc, SUM(dr) AS dr, SUM(cr) AS cr, SUM(dr)-SUM(cr) AS balance FROM gl_lines GROUP BY factory_id, acc;
CREATE VIEW IF NOT EXISTS v_counts AS SELECT factory_id, col, SUM(deleted_at IS NULL) AS live, SUM(deleted_at IS NOT NULL) AS removed FROM records GROUP BY factory_id, col;
`);
  return db;
}
const stable = o => JSON.stringify(o);
function glFor(db, f, entryId, d) {
  db.prepare('DELETE FROM gl_lines WHERE factory_id=? AND entry_id=?').run(f, entryId);
  if (!d || !Array.isArray(d.lines)) return;
  const ins = db.prepare('INSERT INTO gl_lines VALUES(?,?,?,?,?,?,?,?,?,?,?)');
  d.lines.forEach((l, i) => ins.run(f, entryId, i, d.no || '', String(d.date || '').slice(0, 10), l.acc, l.dr || 0, l.cr || 0, l.job || '', l.cat || '', l.art || ''));
}
/* payload: { factoryId, factoryName, user, records:[{col,id,data}] }  -> full mirror of the app's current data */
function send(db, p) {
  if (!p || !p.factoryId || !Array.isArray(p.records)) throw new Error('Bad data');
  const f = p.factoryId, now = new Date().toISOString();
  let added = 0, changed = 0, unchanged = 0, removed = 0, restored = 0;
  db.exec('BEGIN');
  try {
    const run = db.prepare('INSERT INTO runs(factory_id,factory_name,at,by_user,sent) VALUES(?,?,?,?,?)').run(f, p.factoryName || '', now, p.user || '', p.records.length);
    const runId = Number(run.lastInsertRowid);
    const get = db.prepare('SELECT data, deleted_at FROM records WHERE factory_id=? AND col=? AND id=?');
    const insR = db.prepare('INSERT INTO records(factory_id,col,id,data,first_seen,last_seen,changed_at) VALUES(?,?,?,?,?,?,?)');
    const updR = db.prepare('UPDATE records SET data=?, last_seen=?, changed_at=?, deleted_at=NULL WHERE factory_id=? AND col=? AND id=?');
    const seenR = db.prepare('UPDATE records SET last_seen=? WHERE factory_id=? AND col=? AND id=?');
    const hist = db.prepare('INSERT INTO record_history(factory_id,col,id,data,replaced_at,run_id) VALUES(?,?,?,?,?,?)');
    db.exec('CREATE TEMP TABLE IF NOT EXISTS sent_ids(col TEXT, id TEXT, PRIMARY KEY(col,id)) WITHOUT ROWID'); db.exec('DELETE FROM sent_ids');
    const mark = db.prepare('INSERT OR IGNORE INTO sent_ids VALUES(?,?)');
    for (const r of p.records) {
      if (!r.col || r.id == null) continue;
      const id = String(r.id), js = stable(r.data); mark.run(r.col, id);
      const cur = get.get(f, r.col, id);
      if (!cur) { insR.run(f, r.col, id, js, now, now, now); added++; if (r.col === 'journalEntries') glFor(db, f, id, r.data); }
      else if (cur.data !== js || cur.deleted_at) {
        hist.run(f, r.col, id, cur.data, now, runId); updR.run(js, now, now, f, r.col, id);
        if (cur.deleted_at) restored++; else changed++;
        if (r.col === 'journalEntries') glFor(db, f, id, r.data);
      } else { seenR.run(now, f, r.col, id); unchanged++; }
    }
    const gone = db.prepare(`SELECT col, id FROM records WHERE factory_id=? AND deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM sent_ids s WHERE s.col=records.col AND s.id=records.id)`).all(f);
    const del = db.prepare('UPDATE records SET deleted_at=? WHERE factory_id=? AND col=? AND id=?');
    for (const g of gone) { del.run(now, f, g.col, g.id); removed++; if (g.col === 'journalEntries') glFor(db, f, g.id, null); }
    const tb = db.prepare('SELECT COALESCE(SUM(dr),0) dr, COALESCE(SUM(cr),0) cr FROM gl_lines WHERE factory_id=?').get(f);
    const balanced = Number(tb.dr) === Number(tb.cr) ? 1 : 0;
    const live = Number(db.prepare('SELECT COUNT(*) n FROM records WHERE factory_id=? AND deleted_at IS NULL').get(f).n);
    const ok = live === p.records.filter(r => r.col && r.id != null).length && balanced ? 1 : 0;
    db.prepare('UPDATE runs SET added=?,changed=?,unchanged=?,removed=?,restored=?,balanced=?,ok=? WHERE run_id=?').run(added, changed, unchanged, removed, restored, balanced, ok, runId);
    db.prepare("INSERT INTO meta VALUES('last_run',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(String(runId));
    db.exec('COMMIT');
    return { runId, at: now, sent: p.records.length, added, changed, unchanged, removed, restored, balanced: !!balanced, ok: !!ok, stored: counts(db, f), totalDr: Number(tb.dr), totalCr: Number(tb.cr) };
  } catch (e) { try { db.exec('ROLLBACK'); } catch (x) {} throw e; }
}
function counts(db, f) { const o = {}; db.prepare('SELECT col, live, removed FROM v_counts WHERE factory_id=?').all(f).forEach(r => o[r.col] = { live: Number(r.live), removed: Number(r.removed) }); return o; }
function info(db, f) {
  const last = db.prepare('SELECT * FROM runs ORDER BY run_id DESC LIMIT 1').get();
  const tot = Number(db.prepare('SELECT COUNT(*) n FROM records WHERE deleted_at IS NULL' + (f ? ' AND factory_id=?' : '')).get(...(f ? [f] : [])).n);
  return { last: last || null, records: tot, integrity: db.prepare('PRAGMA integrity_check').get().integrity_check, counts: f ? counts(db, f) : {} };
}
function backup(db, dir) {
  fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, 'erp-local-' + new Date().toISOString().slice(0, 10) + '.db');
  if (!fs.existsSync(f)) db.exec(`VACUUM INTO '${f.replace(/'/g, "''")}'`);
  fs.readdirSync(dir).filter(n => /^erp-local-.*\.db$/.test(n)).sort().slice(0, -30).forEach(n => fs.unlinkSync(path.join(dir, n)));
  return f;
}
module.exports = { openDb, send, info, backup, counts };
