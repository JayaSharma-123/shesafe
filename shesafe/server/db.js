// SQLite: one file, no install, runs on CPU. Seeds YOUR station from .env.
require('dotenv').config();
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const db = new Database(__dirname + '/shesafe.db');
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS stations(id INTEGER PRIMARY KEY, name TEXT, phone TEXT, lat REAL, lng REAL, on_duty INTEGER DEFAULT 1, verified INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, name TEXT, phone TEXT UNIQUE, role TEXT, pass_hash TEXT, pin_hash TEXT, contacts TEXT DEFAULT '[]', station_id INTEGER);
CREATE TABLE IF NOT EXISTS incidents(id INTEGER PRIMARY KEY, user_id INTEGER, trigger TEXT, lat REAL, lng REAL, status TEXT DEFAULT 'active', station_id INTEGER, flag TEXT, started_at TEXT, closed_at TEXT, closed_reason TEXT);
CREATE TABLE IF NOT EXISTS locations(id INTEGER PRIMARY KEY, incident_id INTEGER, ts TEXT, lat REAL, lng REAL);
CREATE TABLE IF NOT EXISTS evidence(id INTEGER PRIMARY KEY, incident_id INTEGER, file TEXT, sha256 TEXT, size INTEGER, ts TEXT);
CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY, evidence_id INTEGER, viewer_id INTEGER, ts TEXT);
-- One pending OTP per phone: only a hash is stored, never the code itself
CREATE TABLE IF NOT EXISTS otps(phone TEXT PRIMARY KEY, code_hash TEXT, expires_at INTEGER, attempts INTEGER DEFAULT 0, last_sent INTEGER, sent_count INTEGER DEFAULT 0, window_start INTEGER);
`);
// 'watch' = location only, 'urgent' = full SOS. Old rows default to urgent.
try { db.exec("ALTER TABLE incidents ADD COLUMN level TEXT DEFAULT 'urgent'") } catch { /* column already exists */ }

const e = process.env, pin = bcrypt.hashSync('1234', 10);

if (!db.prepare('SELECT COUNT(*) c FROM stations').get().c) {
  const addStation = db.prepare('INSERT INTO stations(name,phone,lat,lng) VALUES(?,?,?,?)');
  // Station id 1 = YOU (the real police-station account for the demo)
  addStation.run(e.STATION_NAME || 'My Police Station', e.STATION_PHONE, +e.STATION_LAT || 21.2514, +e.STATION_LNG || 81.6296);
  // Extra stations (approximate sample data) so escalation to a "next station" can be demonstrated
  [['Civil Lines Police Station (sample)', '0771-2535002', 21.2400, 81.6500],
   ['Pandri Police Station (sample)', '0771-2535003', 21.2430, 81.6430]].forEach(r => addStation.run(...r));
  db.prepare('INSERT INTO users(name,phone,role,pass_hash,pin_hash,contacts,station_id) VALUES(?,?,?,?,?,?,?)')
    .run('Station In-charge', e.STATION_PHONE, 'station', bcrypt.hashSync(e.STATION_PASSWORD || 'Demo@1234', 10), pin, '[]', 1);
}

// The fake demo user only exists when SEED_DEMO=true (used by `npm test`). Otherwise remove it if it has no incidents.
if (e.SEED_DEMO === 'true') {
  if (!db.prepare("SELECT id FROM users WHERE phone='9000000001'").get())
    db.prepare('INSERT INTO users(name,phone,role,pass_hash,pin_hash,contacts) VALUES(?,?,?,?,?,?)')
      .run('Anjali Agrawal', '9000000001', 'user', bcrypt.hashSync('Demo@1234', 10), pin,
        JSON.stringify([{ name: 'Trusted Contact', phone: e.CONTACT_PHONE || e.STATION_PHONE }]));
} else {
  db.prepare("DELETE FROM users WHERE phone='9000000001' AND id NOT IN (SELECT user_id FROM incidents)").run();
}
module.exports = db;