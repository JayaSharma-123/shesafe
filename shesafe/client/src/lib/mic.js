// Keeps the last few seconds of microphone audio (16 kHz, mono) in memory only. Nothing is stored or uploaded.
export const rms = s => Math.sqrt(s.reduce((a, v) => a + v * v, 0) / (s.length || 1))

// Loudness of the loudest quarter-second. Pauses between words no longer make speech look "too quiet".
export function peakRms(s, rate = 16000) {
  const w = rate / 4
  let best = 0
  for (let i = 0; i + w <= s.length; i += w / 2) {
    let sum = 0
    for (let j = i; j < i + w; j++) sum += s[j] * s[j]
    best = Math.max(best, Math.sqrt(sum / w))
  }
  return best
}

export function createRecorder(seconds = 4) {
  const RATE = 16000, size = RATE * seconds
  const ring = new Float32Array(size)
  let pos = 0, ctx, stream, node, src
  return {
    async start() {
      // Raw-ish audio with automatic gain: echo and noise filters can erase a soft voice, and voice matching needs the real sound.
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true } })
      ctx = new AudioContext({ sampleRate: RATE }) // the browser resamples to 16 kHz, which the model expects
      await ctx.resume()                           // an AudioContext can start "suspended" and record silence
      src = ctx.createMediaStreamSource(stream)
      node = ctx.createScriptProcessor(4096, 1, 1)
      node.onaudioprocess = e => { const d = e.inputBuffer.getChannelData(0); for (let i = 0; i < d.length; i++) ring[pos++ % size] = d[i] }
      src.connect(node); node.connect(ctx.destination) // the output stays silent
    },
    // The most recent `sec` seconds, oldest first
    snapshot(sec = 3) {
      const n = Math.min(pos, size, RATE * sec), out = new Float32Array(n)
      for (let i = 0; i < n; i++) out[i] = ring[(pos - n + i) % size]
      return out
    },
    // Loudness right now (last 0.2 s), used for the live level bar
    level() {
      const n = Math.min(pos, size, 3200)
      let sum = 0
      for (let i = 0; i < n; i++) { const v = ring[(pos - n + i) % size]; sum += v * v }
      return Math.sqrt(sum / (n || 1))
    },
    stop() {
      try { node?.disconnect(); src?.disconnect(); ctx?.close() } catch {}
      stream?.getTracks().forEach(t => t.stop())
    },
  }
}

// One microphone recorder shared by the whole app, so changing pages never reopens the mic
let sharedP = null, sharedR = null
export function sharedMic() {
  if (!sharedP) {
    const r = createRecorder(4)
    sharedP = r.start().then(() => { sharedR = r; return r }).catch(e => { sharedP = null; throw e })
  }
  return sharedP
}
export function stopSharedMic() { sharedR?.stop(); sharedR = null; sharedP = null }

// Cuts silence from both ends. Voice matching works much better on the spoken part only.
export function trimSpeech(s, rate = 16000) {
  const f = rate / 50 // 20 ms frames
  const e = []
  for (let i = 0; i + f <= s.length; i += f) { let sum = 0; for (let j = i; j < i + f; j++) sum += s[j] * s[j]; e.push(Math.sqrt(sum / f)) }
  const max = e.reduce((a, b) => Math.max(a, b), 0)
  if (max < 0.005) return s
  const th = max * 0.15
  let a = e.findIndex(v => v >= th), b = e.length - 1
  while (b > a && e[b] < th) b--
  a = Math.max(0, a - 10); b = Math.min(e.length - 1, b + 10) // 0.2 s padding
  const out = s.slice(a * f, (b + 1) * f)
  return out.length >= rate ? out : s // need at least 1 second
}