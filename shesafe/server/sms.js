// Sends SMS through Fast2SMS or Twilio. Falls back to console so the app never crashes if SMS fails.
// Uses Node's built-in fetch (Node 18+), so no extra package is needed.
const clean = n => String(n || '').replace(/\D/g, '').slice(-10); // keep last 10 digits

async function sendSms(numbers, message) {
  const list = [...new Set([].concat(numbers).map(clean).filter(n => n.length === 10))];
  if (!list.length) return { ok: false, reason: 'no valid numbers' };
  const provider = (process.env.SMS_PROVIDER || 'console').toLowerCase();

  try {
    if (provider === 'fast2sms') {
      const r = await fetch('https://www.fast2sms.com/dev/bulkV2', {
        method: 'POST',
        headers: { authorization: process.env.FAST2SMS_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ route: process.env.FAST2SMS_ROUTE || 'q', message, numbers: list.join(','), flash: 0 }),
      });
      const j = await r.json();
      console.log('[Fast2SMS]', JSON.stringify(j));
      return { ok: j.return === true, response: j };
    }
    if (provider === 'twilio') {
      const { TWILIO_SID: sid, TWILIO_TOKEN: tok, TWILIO_FROM: from } = process.env;
      const results = [];
      for (const n of list) { // Twilio sends one message per number
        const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
          method: 'POST',
          headers: { Authorization: 'Basic ' + Buffer.from(`${sid}:${tok}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ To: '+91' + n, From: from, Body: message }),
        });
        results.push(await r.json());
      }
      console.log('[Twilio]', results.map(x => x.status || x.message));
      return { ok: results.every(x => x.sid), response: results };
    }
  } catch (e) {
    console.error('[SMS error]', e.message);
  }
  console.log('[SMS console]', list.join(','), '->', message);
  return { ok: false, reason: 'console fallback' };
}
module.exports = { sendSms };