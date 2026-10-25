// Same rules as the server (server/phone.js), so users get instant feedback.
export function isValidMobile(p) {
  p = String(p || '')
  if (!/^[6-9]\d{9}$/.test(p)) return false
  if (/(\d)\1{5,}/.test(p)) return false
  for (let i = 0; i <= 4; i++) {
    const w = p.slice(i, i + 6).split('').map(Number), d = w[1] - w[0]
    if (Math.abs(d) === 1 && w.every((v, k) => k === 0 || v - w[k - 1] === d)) return false
  }
  return true
}