import { useEffect, useRef, useState } from 'react'

// The separate "Exit with PIN" box for ending a Safety Journey.
// A correct PIN ends the trip. Three wrong PINs start an SOS (someone may be forcing the user).
export default function EndTripModal({ onVerify, onWrong3, onClose }) {
  const [pin, setPin] = useState('')
  const [wrong, setWrong] = useState(0)
  const [checking, setChecking] = useState(false)
  const inputRef = useRef()
  useEffect(() => { inputRef.current?.focus() }, [])

  const submit = async v => {
    setChecking(true)
    const ok = await onVerify(v)
    setChecking(false)
    if (ok) return
    const w = wrong + 1
    setWrong(w); setPin('')
    if (w >= 3) onWrong3()
    else inputRef.current?.focus()
  }
  const change = e => {
    const v = e.target.value.replace(/\D/g, '').slice(0, 4)
    setPin(v)
    if (v.length === 4 && !checking) submit(v) // checks on the 4th digit
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
      <div className="card w-full max-w-sm space-y-4 text-center">
        <h2 className="text-xl font-bold">End your trip</h2>
        <p className="text-sm text-slate-500">Enter your PIN to stop check-ins. Answering "Yes" at a check-in does not end the trip.</p>
        {wrong > 0 && <p className="text-sm font-semibold text-red-600">Wrong PIN ({wrong}/3)</p>}
        <input ref={inputRef} className="input text-center text-2xl tracking-[0.6em]" type="password" inputMode="numeric"
          maxLength={4} autoComplete="off" disabled={checking} value={pin} onChange={change} />
        <button onClick={onClose} className="w-full text-sm text-slate-500">Cancel, keep my trip going</button>
      </div>
    </div>
  )
}