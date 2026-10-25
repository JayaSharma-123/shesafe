// Rules for accepting a mobile number. The OTP proves ownership; this blocks obviously fake numbers first.
function isValidMobile(raw) {
  const p = String(raw || '');
  if (!/^[6-9]\d{9}$/.test(p)) return false;      // Indian mobile: 10 digits, starts with 6-9
  if (/(\d)\1{5,}/.test(p)) return false;         // 6+ same digit in a row (e.g. 9000000001)
  for (let i = 0; i <= 4; i++) {                   // 6 digits going straight up or down (123456, 987654)
    const w = p.slice(i, i + 6).split('').map(Number), d = w[1] - w[0];
    if (Math.abs(d) === 1 && w.every((v, k) => k === 0 || v - w[k - 1] === d)) return false;
  }
  return true;
}
module.exports = { isValidMobile };