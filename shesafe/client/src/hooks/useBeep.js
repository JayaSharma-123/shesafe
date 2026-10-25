import { useRef } from 'react'

// Emergency siren: a 4-second two-tone beep, max 3 times, 10 seconds apart (PRD 6.4).
// Browsers block sound until the page has been clicked once, so unlock() is called from a button.
export function useBeep() {
  const api = useRef(null)
  if (!api.current) {
    let ctx = null
    const timers = {}, oscs = {}

    const unlock = async () => {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)()
      await ctx.resume()
      return ctx.state === 'running'
    }
    const tone = id => {
      if (!ctx || ctx.state !== 'running') return
      const t0 = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain()
      o.type = 'square'; g.gain.value = 0.25
      o.connect(g); g.connect(ctx.destination)
      for (let k = 0; k < 8; k++) o.frequency.setValueAtTime(k % 2 ? 660 : 880, t0 + k * 0.5) // siren
      o.start(t0); o.stop(t0 + 4)
      oscs[id] = o
      navigator.vibrate?.([500, 200, 500])
    }
    const stop = id => {
      clearTimeout(timers[id]); delete timers[id]
      try { oscs[id]?.stop() } catch {}
      delete oscs[id]
    }
    const start = id => {
      stop(id)
      let n = 0
      const fire = () => { tone(id); if (++n < 3) timers[id] = setTimeout(fire, 10000) }
      fire()
    }
    const stopAll = () => Object.keys({ ...timers, ...oscs }).forEach(stop)
    api.current = { unlock, start, stop, stopAll, test: () => tone('test') }
  }
  return api.current
}