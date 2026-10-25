// End-to-end check: login -> SOS -> nearest station -> location -> evidence chain -> status -> exit -> verify.
process.env.PORT = 4100;
const { server } = require('./server');
const B = 'http://localhost:4100/api';
const call = async (p, o = {}, t) => { const r = await fetch(B + p, { ...o, headers: { 'Content-Type': 'application/json', ...(t && { Authorization: 'Bearer ' + t }), ...o.headers } }); return { s: r.status, j: await r.json().catch(() => ({})) }; };
const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) process.exitCode = 1; };
server.listen(4100, async () => {
  const u = (await call('/auth/login', { method: 'POST', body: JSON.stringify({ phone: '9000000001', password: 'Demo@1234' }) })).j.token;
  const st = (await call('/auth/login', { method: 'POST', body: JSON.stringify({ phone: process.env.STATION_PHONE, password: process.env.STATION_PASSWORD || 'Demo@1234' }) })).j.token;
  const bad = await call('/auth/register', { method: 'POST', body: JSON.stringify({ name: 'X', phone: '123' }) }); ok(bad.s === 400, 'validation rejects bad signup');
  const sos = await call('/sos/trigger', { method: 'POST', body: JSON.stringify({ trigger: 'button', lat: 21.2385, lng: 81.634 }) }, u);
  ok(sos.s === 201 && sos.j.station.id === 1, 'nearest station = ' + sos.j.station?.name);
  const id = sos.j.incident.id;
  ok((await call(`/sos/${id}/location`, { method: 'POST', body: JSON.stringify({ lat: 21.239, lng: 81.635 }) }, u)).s === 200, 'location update');
  for (const n of ['chunk-one', 'chunk-two']) await fetch(`${B}/evidence/${id}`, { method: 'POST', headers: { Authorization: 'Bearer ' + u, 'Content-Type': 'video/webm' }, body: n });
  const list = await call(`/evidence/incident/${id}`, {}, st); ok(list.j.length === 2, 'station sees 2 evidence chunks');
  const f = await fetch(`${B}/evidence/file/${list.j[0].id}?token=${st}`); ok(f.status === 200, 'station views file (logged)');
  ok((await call(`/audit/${id}`, {}, st)).j.length === 1, 'audit log recorded the view');
  ok((await call(`/evidence/verify/${id}`, {}, u)).j.intact, 'hash chain intact');
  ok((await call(`/sos/${id}/status`, { method: 'POST', body: JSON.stringify({ status: 'on_the_way' }) }, st)).s === 200, 'station acknowledges');
  ok((await call(`/sos/${id}/exit`, { method: 'POST', body: JSON.stringify({ pin: '0000' }) }, u)).s === 401, 'wrong PIN rejected');
  ok((await call(`/sos/${id}/exit`, { method: 'POST', body: JSON.stringify({ pin: '1234', outcome: 'safe' }) }, u)).s === 200, 'exit with PIN');
  ok((await call(`/evidence/incident/${id}`, {}, u)).j.length === 2, 'evidence survives exit');
  server.close(); process.exit();
});
