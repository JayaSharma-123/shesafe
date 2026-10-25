import { useEffect, useRef, useState } from 'react'

// PIN prompt with a countdown. Correct PIN = fine. Time runs out, 3 wrong PINs or the "No" button = SOS.
export default function SafePinModal({ onVerify, onTimeout, onWrong3, onNo, seconds = 15, title = 'Enter your PIN', message, noLabel = 'No, I need help' }) {
  const [pin, setPin] = useState('')
  const [wrong, setWrong] = useState(0)
  const [checking, setChecking] = useState(false)
  const [left, setLeft] = useState(seconds)
  const deadline = useRef(Date.now() + seconds * 1000)
  const done = useRef(false)
  const inputRef = useRef()
  const cb = useRef({}); cb.current = { onTimeout, onWrong3 }

  useEffect(() => {
    inputRef.current?.focus()
    const t = setInterval(() => {
      const s = Math.max(0, Math.ceil((deadline.current - Date.now()) / 1000))
      setLeft(s)
      if (s === 0 && !done.current) { done.current = true; clearInterval(t); cb.current.onTimeout() }
    }, 250)
    return () => clearInterval(t)
  }, [])

  const submit = async value => {
    setChecking(true)
    const ok = await onVerify(value)
    setChecking(false)
    if (ok) { done.current = true; return }
    const w = wrong + 1
    setWrong(w); setPin('')
    if (w >= 3 && !done.current) { done.current = true; cb.current.onWrong3() } else inputRef.current?.focus()
  }
  const change = e => {
    const v = e.target.value.replace(/\D/g, '').slice(0, 4)
    setPin(v)
    if (v.length === 4 && !checking) submit(v)
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
      <div className="card w-full max-w-sm space-y-4 text-center">
        <div className={`mx-auto grid h-16 w-16 place-items-center rounded-full text-2xl font-bold text-white ${left <= 5 ? 'animate-pulse bg-red-600' : 'bg-brand-600'}`}>{left}</div>
        <h2 className="text-2xl font-bold">{title}</h2>
        <p className="text-sm text-slate-500">{message || `Confirm it's really you. If the PIN isn't entered in ${left} seconds, an SOS starts automatically.`}</p>
        {wrong > 0 && <p className="text-sm font-semibold text-red-600">Wrong PIN ({wrong}/3)</p>}
        <input ref={inputRef} className="input text-center text-2xl tracking-[0.6em]" type="password" inputMode="numeric"
          maxLength={4} autoComplete="off" disabled={checking} value={pin} onChange={change} />
        <button className="btn w-full" onClick={onNo}>{noLabel}</button>
      </div>
    </div>
  )
}