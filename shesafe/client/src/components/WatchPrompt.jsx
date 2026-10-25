import { useEffect, useRef, useState } from 'react'

const SECONDS = 30 // no reply in 30 seconds starts the SOS

// Shown right after the user taps "No". Safe (needs PIN) ends tracking. Unsafe, 3 wrong PINs or silence start the SOS.
export default function WatchPrompt({ onSafe, onUnsafe }) {
  const [askPin, setAskPin] = useState(false)
  const [pin, setPin] = useState('')
  const [wrong, setWrong] = useState(0)
  const [checking, setChecking] = useState(false)
  const [left, setLeft] = useState(SECONDS)
  const deadline = useRef(Date.now() + SECONDS * 1000)
  const done = useRef(false)   // only one outcome may fire
  const busy = useRef(false)   // don't time out while a PIN is being checked
  const inputRef = useRef()
  const cb = useRef({}); cb.current = { onUnsafe }

  useEffect(() => {
    // Notify the user: sound, vibration and a system notification (if allowed)
    try {
      const c = new (window.AudioContext || window.webkitAudioContext)(), o = c.createOscillator()
      o.frequency.value = 880; o.connect(c.destination); o.start(); setTimeout(() => { o.stop(); c.close() }, 600)
    } catch {}
    navigator.vibrate?.([300, 150, 300])
    if ('Notification' in window && Notification.permission === 'granted')
      new Notification('SheSafe: are you safe?', { body: 'Reply within 30 seconds or an SOS starts automatically.', tag: 'shesafe-watch', requireInteraction: true })

    const t = setInterval(() => {
      const s = Math.max(0, Math.ceil((deadline.current - Date.now()) / 1000))
      setLeft(s)
      if (s === 0 && !done.current && !busy.current) { done.current = true; clearInterval(t); cb.current.onUnsafe() }
    }, 250)
    return () => clearInterval(t)
  }, [])

  useEffect(() => { if (askPin) inputRef.current?.focus() }, [askPin])

  const unsafe = () => { if (done.current) return; done.current = true; onUnsafe() }

  const submit = async v => {
    busy.current = true; setChecking(true)
    const ok = await onSafe(v)
    busy.current = false; setChecking(false)
    if (ok) { done.current = true; return }
    const w = wrong + 1
    setWrong(w); setPin('')
    if (w >= 3) unsafe()
    else inputRef.current?.focus()
  }
  const change = e => {
    const v = e.target.value.replace(/\D/g, '').slice(0, 4)
    setPin(v)
    if (v.length === 4 && !checking) submit(v)
  }

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/80 p-4">
      <div className="card w-full max-w-sm space-y-4 text-center">
        <div className={`mx-auto grid h-20 w-20 place-items-center rounded-full text-3xl font-bold text-white ${left <= 10 ? 'animate-pulse bg-red-600' : 'bg-brand-600'}`}>{left}</div>
        <h2 className="text-2xl font-bold">Are you safe or unsafe?</h2>
        <p className="text-sm text-slate-500">Your location is being shared with the police station. If you don't reply in {left} seconds, an SOS with live video starts automatically.</p>
        {!askPin ? (
          <div className="grid grid-cols-2 gap-3">
            <button className="btn !bg-emerald-600 hover:!bg-emerald-700" onClick={() => setAskPin(true)}>I'm safe</button>
            <button className="btn" onClick={unsafe}>I'm unsafe</button>
          </div>
        ) : (
          <>
            <p className="text-sm text-slate-500">Enter your PIN to confirm you're safe.</p>
            {wrong > 0 && <p className="text-sm font-semibold text-red-600">Wrong PIN ({wrong}/3)</p>}
            <input ref={inputRef} className="input text-center text-2xl tracking-[0.6em]" type="password" inputMode="numeric"
              maxLength={4} autoComplete="off" disabled={checking} value={pin} onChange={change} />
            <div className="grid grid-cols-2 gap-3">
              <button className="btn !bg-slate-600 hover:!bg-slate-700" onClick={() => { setAskPin(false); setPin('') }}>Back</button>
              <button className="btn" onClick={unsafe}>I'm unsafe</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}