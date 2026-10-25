require('dotenv').config();
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const express = require('express'), cors = require('cors'), bcrypt = require('bcryptjs');
const http = require('http'), { Server } = require('socket.io');
const db = require('./db'), { auth, register, login, sendOtp, sendResetOtp, resetPassword, verify, pub } = require('./auth'), { rankStations } = require('./geo');
const { sendSms } = require('./sms');

const app = express(), server = http.createServer(app);
const io = new Server(server, { cors: { origin: process.env.CLIENT_ORIGIN || '*' } });
app.use(cors({ origin: process.env.CLIENT_ORIGIN || '*' }), express.json());
const UP = path.join(__dirname, 'vault'); fs.mkdirSync(UP, { recursive: true });
const ESC_MS = (+process.env.ESCALATE_AFTER_SECONDS || 45) * 1000;
const now = () => new Date().toISOString();
const timers = new Map(), wrongPins = new Map(), tried = new Map(); // incidentId -> state
const OPEN_STATES = ['active', 'received', 'on_the_way'];
// ---------- Auth & public data ----------
app.post('/api/auth/send-otp', sendOtp);
app.post('/api/auth/forgot/send-otp', sendResetOtp);
app.post('/api/auth/forgot/reset', resetPassword);
app.post('/api/auth/register', register);
app.post('/api/auth/login', login);
app.get('/api/auth/me', auth(), (req, res) => res.json(pub(req.user)));
// Checks the PIN without ending anything; used by Safety Journey check-ins.
app.post('/api/auth/verify-pin', auth(['user']), (req, res) =>
  bcrypt.compareSync(String(req.body.pin || ''), req.user.pin_hash) ? res.json({ ok: true }) : res.status(401).json({ error: 'Wrong PIN' }));
// Urgent SOS alerts for people who listed ME as a trusted contact (so a refresh does not lose them)
app.get('/api/me/alerts', auth(['user']), (req, res) => {
  const owners = db.prepare("SELECT id,contacts FROM users WHERE role='user'").all()
    .filter(o => JSON.parse(o.contacts).some(c => c.phone === req.user.phone)).map(o => o.id);
  if (!owners.length) return res.json([]);
  const rows = db.prepare(`SELECT i.id,i.lat,i.lng,u.name,u.phone FROM incidents i JOIN users u ON u.id=i.user_id
    WHERE i.level='urgent' AND i.status IN ('active','received','on_the_way') AND i.user_id IN (${owners.map(() => '?').join(',')})`).all(...owners);
  rows.forEach(r => { const l = db.prepare('SELECT lat,lng FROM locations WHERE incident_id=? ORDER BY id DESC').get(r.id); if (l) { r.lat = l.lat; r.lng = l.lng; } });
  res.json(rows);
});
// ---------- Profile & trusted contacts ----------
const phone10 = n => String(n || '').replace(/\D/g, '').slice(-10);
const fresh = id => pub(db.prepare('SELECT * FROM users WHERE id=?').get(id));

app.put('/api/me/contacts', auth(['user']), (req, res) => {
  const list = Array.isArray(req.body.contacts) ? req.body.contacts : [];
  if (list.length > 5) return res.status(400).json({ error: 'Maximum 5 trusted contacts' });
  const clean = [];
  for (const c of list) {
    const phone = phone10(c.phone);
    if (!/^[6-9]\d{9}$/.test(phone)) return res.status(400).json({ error: 'Enter a valid 10-digit mobile number' });
    if (phone === req.user.phone) return res.status(400).json({ error: 'You cannot add your own number' });
    if (clean.some(x => x.phone === phone)) continue; // ignore duplicates
    clean.push({ name: String(c.name || '').trim().slice(0, 40) || 'Trusted contact', phone });
  }
  db.prepare('UPDATE users SET contacts=? WHERE id=?').run(JSON.stringify(clean), req.user.id);
  res.json(fresh(req.user.id));
});
app.put('/api/me/profile', auth(), (req, res) => {
  const name = String(req.body.name || '').trim();
  if (name.length < 2 || name.length > 60) return res.status(400).json({ error: 'Enter a valid name' });
  db.prepare('UPDATE users SET name=? WHERE id=?').run(name, req.user.id);
  res.json(fresh(req.user.id));
});
app.post('/api/me/pin', auth(['user']), (req, res) => {
  if (!bcrypt.compareSync(String(req.body.current || ''), req.user.pin_hash)) return res.status(401).json({ error: 'Current PIN is wrong' });
  if (!/^\d{4}$/.test(req.body.next || '')) return res.status(400).json({ error: 'New PIN must be 4 digits' });
  db.prepare('UPDATE users SET pin_hash=? WHERE id=?').run(bcrypt.hashSync(req.body.next, 10), req.user.id);
  res.json({ ok: true });
});
app.post('/api/me/password', auth(), (req, res) => {
  if (!bcrypt.compareSync(String(req.body.current || ''), req.user.pass_hash)) return res.status(401).json({ error: 'Current password is wrong' });
  if (String(req.body.next || '').length < 8) return res.status(400).json({ error: 'New password needs 8+ characters' });
  db.prepare('UPDATE users SET pass_hash=? WHERE id=?').run(bcrypt.hashSync(req.body.next, 10), req.user.id);
  res.json({ ok: true });
});
app.get('/api/stations', (_q, res) => res.json(db.prepare('SELECT id,name,phone,lat,lng,on_duty FROM stations').all()));

// ---------- SOS ----------
function notifyStation(inc, stationId, first = false) {
  const u = db.prepare('SELECT name,phone,contacts FROM users WHERE id=?').get(inc.user_id);
  const st = db.prepare('SELECT phone FROM stations WHERE id=?').get(stationId);
  io.to('station:' + stationId).emit('sos:new', { incident: inc, user: { name: u.name, phone: u.phone } });
  if (inc.level === 'watch') return; // Normal mode: dashboard only, so no SMS and no contact beeps
  const link = `https://maps.google.com/?q=${inc.lat},${inc.lng}`;
  const text = `SheSafe SOS: ${u.name} needs help. Location: ${link}`;
  const targets = [st?.phone, ...(first ? JSON.parse(u.contacts).map(c => c.phone) : [])];
  sendSms(targets, text); // not awaited, so a slow SMS provider never delays the live alert
    io.to('contacts:' + inc.user_id).emit('sos:beep', { incidentId: inc.id, name: u.name, phone: u.phone, lat: inc.lat, lng: inc.lng }); // client plays max 3 beeps
}

function armEscalation(id) {
  clearTimeout(timers.get(id));
  timers.set(id, setTimeout(() => {
    const inc = db.prepare('SELECT * FROM incidents WHERE id=?').get(id);
    if (!inc || inc.status !== 'active') return;               // acknowledged or closed
    const done = tried.get(id) || [inc.station_id];
    const next = rankStations(db, inc.lat, inc.lng).find(s => !done.includes(s.id));
    if (!next) return io.emit('sos:urgent', { incidentId: id, reason: 'No more stations' });
    done.push(next.id); tried.set(id, done);
    db.prepare('UPDATE incidents SET station_id=? WHERE id=?').run(next.id, id);
    notifyStation({ ...inc, station_id: next.id }, next.id);
    io.to('incident:' + id).emit('sos:escalated', { station: next.name });
    armEscalation(id);
  }, ESC_MS));
}
app.post('/api/sos/trigger', auth(['user']), (req, res) => {
  const { trigger = 'button', lat, lng } = req.body;
  const level = req.body.level === 'watch' ? 'watch' : 'urgent'; // watch = location only
  if (typeof lat !== 'number' || typeof lng !== 'number') return res.status(400).json({ error: 'Location required' });
  const near = rankStations(db, lat, lng)[0];
  if (!near) return res.status(503).json({ error: 'No on-duty station available' });
  const r = db.prepare('INSERT INTO incidents(user_id,trigger,lat,lng,station_id,started_at,level) VALUES(?,?,?,?,?,?,?)')
    .run(req.user.id, trigger, lat, lng, near.id, now(), level);
  const inc = db.prepare('SELECT * FROM incidents WHERE id=?').get(r.lastInsertRowid);
  tried.set(inc.id, [near.id]); notifyStation(inc, near.id, true);
  if (level === 'urgent') armEscalation(inc.id); // escalation only applies to real SOS
  res.status(201).json({ incident: inc, station: near });
});
// Watch -> Urgent. Called when the user says "unsafe", or the 30 s reply window runs out.
app.post('/api/sos/:id/upgrade', auth(['user']), (req, res) => {
  const id = +req.params.id;
  const inc = db.prepare('SELECT * FROM incidents WHERE id=? AND user_id=?').get(id, req.user.id);
  if (!inc || !OPEN_STATES.includes(inc.status)) return res.status(404).json({ error: 'No open incident' });
  if (inc.level === 'urgent') return res.json({ ok: true });
  db.prepare("UPDATE incidents SET level='urgent' WHERE id=?").run(id);
  notifyStation({ ...inc, level: 'urgent' }, inc.station_id, true); // siren + SMS + contacts, same as a normal SOS
  armEscalation(id);
  res.json({ ok: true });
});

app.post('/api/sos/:id/location', auth(['user']), (req, res) => {
  const { lat, lng } = req.body, id = +req.params.id;
  const inc = db.prepare('SELECT * FROM incidents WHERE id=? AND user_id=?').get(id, req.user.id);
  if (!inc || inc.status === 'closed') return res.status(404).json({ error: 'No active incident' });
  db.prepare('INSERT INTO locations(incident_id,ts,lat,lng) VALUES(?,?,?,?)').run(id, now(), lat, lng);
    io.to('incident:' + id).to('contacts:' + req.user.id).emit('sos:location', { incidentId: id, lat, lng, ts: now() });
  res.json({ ok: true });
});
// Station acknowledges / updates status: received | on_the_way | resolved
app.post('/api/sos/:id/status', auth(['station']), (req, res) => {
  const id = +req.params.id, s = req.body.status;
  const inc = db.prepare('SELECT * FROM incidents WHERE id=?').get(id);
  if (!inc || !(tried.get(id) || [inc.station_id]).includes(req.user.station_id)) return res.status(403).json({ error: 'Not your incident' });
  if (!['received', 'on_the_way', 'resolved'].includes(s)) return res.status(400).json({ error: 'Bad status' });
  if (s === 'resolved') db.prepare("UPDATE incidents SET status='closed',closed_at=?,closed_reason=COALESCE(closed_reason,'resolved') WHERE id=?").run(now(), id);
  else db.prepare('UPDATE incidents SET status=?,station_id=? WHERE id=?').run(s, req.user.station_id, id);
  clearTimeout(timers.get(id)); // acknowledging stops escalation and the beeps
  io.to('incident:' + id).to('contacts:' + inc.user_id).emit('sos:status', { incidentId: id, status: s });
  res.json({ ok: true });
});
// User exit needs PIN; 3 wrong PINs keep the alert running and flag the station.
app.post('/api/sos/:id/exit', auth(['user']), (req, res) => {
  const id = +req.params.id, inc = db.prepare('SELECT * FROM incidents WHERE id=? AND user_id=?').get(id, req.user.id);
  if (!inc) return res.status(404).json({ error: 'Not found' });
  if (!bcrypt.compareSync(String(req.body.pin || ''), req.user.pin_hash)) {
    const n = (wrongPins.get(id) || 0) + 1; wrongPins.set(id, n);
    if (n >= 3) { db.prepare("UPDATE incidents SET flag='possible_wrong_user' WHERE id=?").run(id);
      io.to('station:' + inc.station_id).emit('sos:urgent', { incidentId: id, reason: 'Three wrong PINs - user may not be the real user' }); }
    return res.status(401).json({ error: 'Wrong PIN', attempts: n });
  }
  const outcome = req.body.outcome === 'false_alarm' ? 'false_alarm' : 'safe';
  db.prepare("UPDATE incidents SET status='user_exited',closed_reason=? WHERE id=?").run(outcome, id);
  clearTimeout(timers.get(id)); // evidence is NEVER deleted on exit
    io.to('incident:' + id).to('contacts:' + inc.user_id).emit('sos:status', { incidentId: id, status: 'user_exited', outcome });
  res.json({ ok: true, outcome });
});
app.get('/api/incidents', auth(), (req, res) => {
  const rows = req.user.role === 'station'
    ? db.prepare('SELECT i.*,u.name user_name,u.phone user_phone FROM incidents i JOIN users u ON u.id=i.user_id WHERE i.station_id=? ORDER BY i.id DESC').all(req.user.station_id)
    : db.prepare('SELECT * FROM incidents WHERE user_id=? ORDER BY id DESC').all(req.user.id);
  res.json(rows);
});

// ---------- Evidence vault ----------
// Each chunk is write-once (flag 'wx' + read-only) and hash-chained: sha256(prevHash + bytes).
// Changing any old file breaks every later hash, which /verify detects.
app.post('/api/evidence/:incidentId', auth(['user']), express.raw({ type: '*/*', limit: '25mb' }), (req, res) => {
  const iid = +req.params.incidentId;
  if (!db.prepare('SELECT id FROM incidents WHERE id=? AND user_id=?').get(iid, req.user.id)) return res.status(404).json({ error: 'Not found' });
  const prev = db.prepare('SELECT sha256 FROM evidence WHERE incident_id=? ORDER BY id DESC').get(iid)?.sha256 || '';
  const sha = crypto.createHash('sha256').update(prev).update(req.body).digest('hex');
  const dir = path.join(UP, String(iid)); fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${Date.now()}.webm`);
  fs.writeFileSync(file, req.body, { flag: 'wx' }); fs.chmodSync(file, 0o444);
  const r = db.prepare('INSERT INTO evidence(incident_id,file,sha256,size,ts) VALUES(?,?,?,?,?)').run(iid, file, sha, req.body.length, now());
  res.status(201).json({ id: r.lastInsertRowid, sha256: sha });
});
const canView = (u, inc) => inc && (u.id === inc.user_id || (u.role === 'station' && (tried.get(inc.id) || [inc.station_id]).includes(u.station_id)) || (u.role === 'station' && u.station_id === inc.station_id));
app.get('/api/evidence/incident/:iid', auth(), (req, res) => {
  const inc = db.prepare('SELECT * FROM incidents WHERE id=?').get(+req.params.iid);
  if (!canView(req.user, inc)) return res.status(403).json({ error: 'Forbidden' });
  res.json(db.prepare('SELECT id,sha256,size,ts FROM evidence WHERE incident_id=? ORDER BY id').all(inc.id));
});
app.get('/api/evidence/file/:id', (req, res) => {           // token via ?token= so <video src> works
  let u; try { u = verify(req.query.token || (req.headers.authorization || '').slice(7)); } catch { return res.status(401).end(); }
  const ev = db.prepare('SELECT * FROM evidence WHERE id=?').get(+req.params.id);
  const inc = ev && db.prepare('SELECT * FROM incidents WHERE id=?').get(ev.incident_id);
  if (!u || !canView(u, inc)) return res.status(403).end();
  db.prepare('INSERT INTO audit(evidence_id,viewer_id,ts) VALUES(?,?,?)').run(ev.id, u.id, now()); // every view is logged
  res.type('video/webm').sendFile(ev.file);
});
app.get('/api/evidence/verify/:iid', auth(), (req, res) => {
  const inc = db.prepare('SELECT * FROM incidents WHERE id=?').get(+req.params.iid);
  if (!canView(req.user, inc)) return res.status(403).json({ error: 'Forbidden' });
  let prev = '', ok = true;
  for (const e of db.prepare('SELECT * FROM evidence WHERE incident_id=? ORDER BY id').all(inc.id)) {
    try { prev = crypto.createHash('sha256').update(prev).update(fs.readFileSync(e.file)).digest('hex'); } catch { ok = false; break; }
    if (prev !== e.sha256) { ok = false; break; }
  }
  res.json({ intact: ok });
});
app.get('/api/audit/:iid', auth(['station']), (req, res) => res.json(db.prepare(
  'SELECT a.ts,a.evidence_id,u.name viewer FROM audit a JOIN users u ON u.id=a.viewer_id JOIN evidence e ON e.id=a.evidence_id WHERE e.incident_id=? ORDER BY a.id DESC').all(+req.params.iid)));

// ---------- Realtime: sockets + WebRTC signalling (peer-to-peer, no GPU/media server needed) ----------
io.use((s, next) => { try { s.user = verify(s.handshake.auth.token); next(); } catch { next(new Error('auth')); } });
io.on('connection', s => {
  const u = s.user;
  if (u.role === 'station') s.join('station:' + u.station_id);
    // Anyone who is a trusted contact of other users automatically listens for their SOS
  if (u.role === 'user') db.prepare("SELECT id,contacts FROM users WHERE role='user'").all()
    .filter(o => JSON.parse(o.contacts).some(c => c.phone === u.phone)).forEach(o => s.join('contacts:' + o.id));
  // trusted contacts listening for a user's SOS: client emits 'watch' with the user id
  s.on('watch', uid => { const owner = db.prepare('SELECT contacts FROM users WHERE id=?').get(uid);
    if (owner && JSON.parse(owner.contacts).some(c => c.phone === u.phone)) s.join('contacts:' + uid); });
    s.on('join', id => {
    const inc = db.prepare('SELECT * FROM incidents WHERE id=?').get(+id);
    if (!canView(u, inc)) return;
    s.join('incident:' + id);
    if (u.id === inc.user_id) s.data.sosIncident = inc.id; // remember: THIS socket is the victim's SOS stream
  });
  s.on('rtc', ({ incidentId, data }) => s.to('incident:' + incidentId).emit('rtc', { from: s.id, data }));
    // Flag only when the victim's own SOS stream drops and does not come back within 5 seconds.
  s.on('disconnect', () => {
    const id = s.data.sosIncident;
    if (!id) return; // other sockets (contact alerts, dashboards) never trigger this
    setTimeout(() => {
      const inc = db.prepare("SELECT * FROM incidents WHERE id=? AND level='urgent' AND status IN ('active','received','on_the_way')").get(id);
      if (!inc) return;
      const back = [...(io.sockets.adapter.rooms.get('incident:' + id) || [])].some(sid => io.sockets.sockets.get(sid)?.data.sosIncident === id);
      if (!back) io.to('station:' + inc.station_id).emit('sos:urgent', { incidentId: id, reason: 'Live stream stopped suddenly' });
    }, 5000);
  });
});

// Close incidents left open by old tests (tab closed mid-SOS) so they cannot keep alarming the station.
db.prepare("UPDATE incidents SET status='closed', closed_at=?, closed_reason='stale' WHERE status IN ('active','received','on_the_way') AND started_at < ?")
  .run(now(), new Date(Date.now() - 30 * 60000).toISOString());
const PORT = process.env.PORT || 4000;
if (require.main === module) server.listen(PORT, () => console.log('SheSafe API on http://localhost:' + PORT));
module.exports = { app, server };
