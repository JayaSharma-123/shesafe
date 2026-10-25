import { useEffect, useRef } from 'react'

const KW = 'shesafe_kw', LANG = 'shesafe_kw_lang', ON = 'shesafe_kw_on'
const SR = window.SpeechRecognition || window.webkitSpeechRecognition
export const voiceSupported = !!SR
export const hasKeyword = () => !!localStorage.getItem(KW)
export const kwEnabled = () => localStorage.getItem(ON) !== 'no'

const COMMON = ['hello', 'help', 'hi', 'hey', 'yes', 'no', 'ok', 'okay', 'stop', 'please', 'mom', 'dad', 'namaste', 'bachao', 'madad', 'sos', 'emergency', 'police']
const words = t => t.toLowerCase().replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean)
const sha = async s => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map(b => b.toString(16).padStart(2, '0')).join('')

// Live status for the UI ("Listening", "Heard: ...", errors) so you can see what the browser hears
const subs = new Set()
const emit = d => subs.forEach(f => f(d))
export const subscribeKeyword = f => { subs.add(f); return () => subs.delete(f) }

// ONE speech session for the whole app. Moving between pages never restarts it.
let session = null, handler = null, last = 0

export function stopKeyword() {
  if (session) { const s = session; session = null; try { s.rec.abort() } catch {} }
}
function startSession() {
  if (session || !SR || !hasKeyword() || !kwEnabled()) return
  const rec = new SR()
  session = { rec }
  let startedAt = Date.now()
  rec.continuous = true; rec.interimResults = true; rec.maxAlternatives = 3
  rec.lang = localStorage.getItem(LANG) || 'en-IN'
  rec.onstart = () => emit({ listening: true })
  rec.onresult = async e => {
    // Last two results, all alternatives: a phrase can be split across results or heard slightly differently
    const heard = Array.from(e.results).slice(Math.max(0, e.results.length - 2))
      .map(r => Array.from(r).map(a => a.transcript))
    const text = heard.map(a => a[0]).join(' ')
    emit({ text })
    const h = handler
    if (!h || h.paused() || Date.now() - last < 8000) return
    const target = localStorage.getItem(KW)
    for (let k = 0; k < 3; k++) {
      const w = words(heard.map(a => a[k] || a[0]).join(' '))
      for (let n = 1; n <= 5; n++) for (let i = 0; i + n <= w.length; i++)
        if (await sha(w.slice(i, i + n).join('')) === target) { last = Date.now(); h.cb(); return } // joined with no spaces
    }
  }
  rec.onend = () => { // Chrome ends sessions after silence; restart (slower if it ended instantly, to avoid a loop)
    if (session?.rec !== rec) return
    const quick = Date.now() - startedAt < 2000
    setTimeout(() => { try { startedAt = Date.now(); rec.start() } catch {} }, quick ? 5000 : 400)
  }
  rec.onerror = ev => {
    if (ev.error === 'no-speech' || ev.error === 'aborted') return
    emit({ error: ev.error === 'network' ? 'network (speech needs internet; Brave blocks it)' : ev.error })
    if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') stopKeyword()
  }
  try { rec.start() } catch (err) { emit({ error: err.message }) }
}

export const clearKeyword = () => { localStorage.removeItem(KW); stopKeyword() }
export const setKwEnabled = on => { localStorage.setItem(ON, on ? 'yes' : 'no'); if (!on) stopKeyword() }
export function validateKeyword(text) {
  const w = words(text)
  if (w.length < 1 || w.length > 3) return 'Use 1 to 3 words'
  if (w.join('').length < 5) return 'Too short. Use at least 5 letters'
  if (w.every(x => COMMON.includes(x))) return 'Too common. Pick an unusual word or phrase'
  return ''
}
export async function saveKeyword(text, lang) {
  localStorage.setItem(KW, await sha(words(text).join(''))) // no spaces, so "she safe" and "shesafe" match
  localStorage.setItem(LANG, lang)
  stopKeyword()
}

// A page calls this to receive the keyword. Unmounting only removes the page's handler.
export function useKeyword({ enabled, paused = false, onHeard }) {
  const cb = useRef(onHeard); cb.current = onHeard
  const p = useRef(paused); p.current = paused
  useEffect(() => {
    if (!enabled || !SR || !hasKeyword() || !kwEnabled()) return
    const mine = { cb: () => cb.current(), paused: () => p.current }
    handler = mine
    startSession()
    return () => { if (handler === mine) handler = null }
  }, [enabled])
}