// JWT auth + OTP phone verification. Passwords, PINs and OTPs are stored only as bcrypt hashes.
const jwt = require('jsonwebtoken'), bcrypt = require('bcryptjs'), crypto = require('crypto'), db = require('./db');
const { sendSms } = require('./sms'), { isValidMobile } = require('./phone');
const SECRET = process.env.JWT_SECRET || 'dev-secret';
const sign = u => jwt.sign({ id: u.id }, SECRET, { expiresIn: '7d' });
const verify = t => db.prepare('SELECT * FROM users WHERE id=?').get(jwt.verify(t, SECRET).id);

// Express middleware; pass roles to restrict (e.g. auth(['station'])).
const auth = roles => (req, res, next) => {
  try {
    const u = verify((req.headers.authorization || '').slice(7));
    if (!u) throw 0;
    if (roles && !roles.includes(u.role)) return res.status(403).json({ error: 'Forbidden' });
    req.user = u; next();
  } catch { res.status(401).json({ error: 'Unauthorized' }); }
};
const pub = u => ({ id: u.id, name: u.name, phone: u.phone, role: u.role, stationId: u.station_id, contacts: JSON.parse(u.contacts) });

// ---- OTP ----
// 6 digits, valid 5 minutes, 30 s between sends, max 5 sends per hour, max 5 wrong tries.
// Shared by signup and password reset: rate-limit, create the OTP, store only its hash, send the SMS.
async function issueOtp(phone, res, smsText) {
  const row = db.prepare('SELECT * FROM otps WHERE phone=?').get(phone), t = Date.now();
  if (row && t - row.last_sent < 30000) return res.status(429).json({ error: `Wait ${Math.ceil((30000 - (t - row.last_sent)) / 1000)} seconds before asking for another OTP` });
  const inWindow = row && t - row.window_start < 3600000, count = inWindow ? row.sent_count : 0;
  if (count >= 5) return res.status(429).json({ error: 'Too many OTP requests. Try again in an hour.' });
  const code = String(crypto.randomInt(100000, 1000000));
  db.prepare('INSERT OR REPLACE INTO otps(phone,code_hash,expires_at,attempts,last_sent,sent_count,window_start) VALUES(?,?,?,?,?,?,?)')
    .run(phone, bcrypt.hashSync(code, 8), t + 300000, 0, t, count + 1, inWindow ? row.window_start : t);
  const sms = await sendSms(phone, smsText(code));
  const dev = process.env.OTP_DEV_ECHO === 'true'; // demo only: returns the code so you can test without SMS credit
  if (!sms.ok && !dev) return res.status(502).json({ error: 'Could not send the OTP SMS. Please try again later.' });
  res.json({ sent: true, ...(dev && { devOtp: code }) });
}
function sendOtp(req, res) { // signup
  const phone = String(req.body.phone || '');
  if (!isValidMobile(phone)) return res.status(400).json({ error: 'Enter a real 10-digit Indian mobile number' });
  if (db.prepare('SELECT id FROM users WHERE phone=?').get(phone)) return res.status(409).json({ error: 'This number is already registered. Please sign in.' });
  return issueOtp(phone, res, c => `Your SheSafe verification code is ${c}. It is valid for 5 minutes. Do not share it with anyone.`);
}
function sendResetOtp(req, res) { // forgot password
  const phone = String(req.body.phone || '');
  if (!isValidMobile(phone)) return res.status(400).json({ error: 'Enter a valid 10-digit mobile number' });
  // Same reply whether or not the number is registered, so nobody can use this to find out who has an account.
  if (!db.prepare('SELECT id FROM users WHERE phone=?').get(phone)) return res.json({ sent: true });
  return issueOtp(phone, res, c => `Your SheSafe password reset code is ${c}. It is valid for 5 minutes. If you did not ask for it, ignore this message.`);
}
function checkOtp(phone, otp) { // returns an error message, or null when the OTP is correct
  const row = db.prepare('SELECT * FROM otps WHERE phone=?').get(phone);
  if (!row) return 'Request an OTP first';
  if (Date.now() > row.expires_at) return 'OTP expired. Request a new one';
  if (row.attempts >= 5) return 'Too many wrong attempts. Request a new OTP';
  if (!bcrypt.compareSync(String(otp || ''), row.code_hash)) {
    db.prepare('UPDATE otps SET attempts=attempts+1 WHERE phone=?').run(phone);
    return 'Wrong OTP';
  }
  return null;
}

function register(req, res) {
  const { name, phone, password, pin, role, stationId, otp, inviteCode, contacts = [] } = req.body;
  if (!name || name.trim().length < 2) return res.status(400).json({ error: 'Enter your name' });
  if (!isValidMobile(phone)) return res.status(400).json({ error: 'Enter a real 10-digit Indian mobile number' });
  if (!password || password.length < 8) return res.status(400).json({ error: 'Password needs 8+ characters' });
  if (!/^\d{4}$/.test(pin || '')) return res.status(400).json({ error: 'PIN must be 4 digits' });
  if (!['user', 'station'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
  if (role === 'station') {
    if (!db.prepare('SELECT id FROM stations WHERE id=?').get(stationId)) return res.status(400).json({ error: 'Choose a station' });
    if (!process.env.STATION_INVITE_CODE || inviteCode !== process.env.STATION_INVITE_CODE) return res.status(403).json({ error: 'Wrong station invite code' });
  }
  const cleanContacts = [];
  for (const c of Array.isArray(contacts) ? contacts.slice(0, 5) : []) {
    if (!isValidMobile(c.phone) || c.phone === phone) return res.status(400).json({ error: 'Contact number is not valid' });
    cleanContacts.push({ name: String(c.name || 'Trusted contact').slice(0, 40), phone: c.phone });
  }
  if (db.prepare('SELECT id FROM users WHERE phone=?').get(phone)) return res.status(409).json({ error: 'Phone already registered' });
  const otpError = checkOtp(phone, otp); // checked last so a typo elsewhere never burns an OTP attempt
  if (otpError) return res.status(400).json({ error: otpError });
  const r = db.prepare('INSERT INTO users(name,phone,role,pass_hash,pin_hash,contacts,station_id) VALUES(?,?,?,?,?,?,?)')
    .run(name.trim(), phone, role, bcrypt.hashSync(password, 10), bcrypt.hashSync(pin, 10), JSON.stringify(cleanContacts), role === 'station' ? stationId : null);
  db.prepare('DELETE FROM otps WHERE phone=?').run(phone);
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(r.lastInsertRowid);
  res.status(201).json({ token: sign(u), user: pub(u) });
}
function resetPassword(req, res) {
  const { phone, otp, password } = req.body;
  if (!isValidMobile(phone)) return res.status(400).json({ error: 'Enter a valid 10-digit mobile number' });
  if (!password || password.length < 8) return res.status(400).json({ error: 'Password needs 8+ characters' });
  const u = db.prepare('SELECT * FROM users WHERE phone=?').get(phone);
  const err = u ? checkOtp(phone, otp) : 'Wrong OTP'; // unknown numbers get the same message as a wrong code
  if (err) return res.status(400).json({ error: err });
  db.prepare('UPDATE users SET pass_hash=? WHERE id=?').run(bcrypt.hashSync(password, 10), u.id);
  db.prepare('DELETE FROM otps WHERE phone=?').run(phone);
  res.json({ ok: true });
}
function login(req, res) {
  const u = db.prepare('SELECT * FROM users WHERE phone=?').get(req.body.phone || '');
  if (!u || !bcrypt.compareSync(req.body.password || '', u.pass_hash)) return res.status(401).json({ error: 'Wrong phone or password' });
  // The login page lets you choose User or Station; refuse if the account is the other kind.
  if (req.body.role && req.body.role !== u.role)
    return res.status(403).json({ error: u.role === 'station' ? 'This is a police station account. Choose "Station" to sign in.' : 'This is a user account. Choose "User" to sign in.' });
  res.json({ token: sign(u), user: pub(u) });
}
module.exports = { auth, register, login, sendOtp, sendResetOtp, resetPassword, verify, pub };