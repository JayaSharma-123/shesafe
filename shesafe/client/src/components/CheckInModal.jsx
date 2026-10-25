import { useEffect, useRef, useState } from 'react'

// "Are you safe?" prompt. Step 1: choose Yes or No. Step 2 (after Yes): enter PIN.
// The countdown keeps running the whole time; when it ends, useJourney starts the SOS.
export default function CheckInModal({ deadline, onYes, onNo, onWrong3 }) {
  const [askPin, setAskPin] = useState(false)
  const [pin, setPin] = useState('')
  const [wrong, setWrong] = useState(0)
  const [checking, setChecking] = useState(false)
  const [left, setLeft] = useState(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)))
  const inputRef = useRef()

  useEffect(() => {
    const t = setInterval(() => setLeft(Math.max(0, Math.ceil((deadline - Date.now()) / 1000))), 250)
    return () => clearInterval(t)
  }, [deadline])

  // Focus the PIN box as soon as it appears
  useEffect(() => { if (askPin) inputRef.current?.focus() }, [askPin])

  // Checks the PIN. A correct PIN closes the prompt (inside onYes); a wrong one counts toward 3.
  const submit = async value => {
    setChecking(true)
    const ok = await onYes(value)
    setChecking(false)
    if (ok) return
    const w = wrong + 1
    setWrong(w); setPin('')
    if (w >= 3) onWrong3() // three wrong PINs start an SOS
    else inputRef.current?.focus()
  }

  const onPinChange = e => {
    const v = e.target.value.replace(/\D/g, '').slice(0, 4)
    setPin(v)
    if (v.length === 4 && !checking) submit(v) // auto-check on the 4th digit
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
      <div className="card w-full max-w-sm space-y-4 text-center">
        <div className={`mx-auto grid h-16 w-16 place-items-center rounded-full text-2xl font-bold text-white ${left <= 10 ? 'animate-pulse bg-red-600' : 'bg-brand-600'}`}>
          {left}
        </div>
        <h2 className="text-2xl font-bold">Are you safe?</h2>

        {!askPin ? (
          <>
            <p className="text-sm text-slate-500">No reply within {left} seconds starts an SOS automatically.</p>
            <div className="grid grid-cols-2 gap-3">
              <button className="btn !bg-emerald-600 hover:!bg-emerald-700" onClick={() => setAskPin(true)}>Yes, I'm safe</button>
              <button className="btn" onClick={onNo}>No, help me</button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-slate-500">Enter your 4-digit PIN to confirm it's really you.</p>
            {wrong > 0 && <p className="text-sm font-semibold text-red-600">Wrong PIN ({wrong}/3)</p>}
            <input ref={inputRef} className="input text-center text-2xl tracking-[0.6em]" type="password" inputMode="numeric"
              maxLength={4} autoComplete="off" disabled={checking} value={pin} onChange={onPinChange} />
            <div className="grid grid-cols-2 gap-3">
              <button className="btn !bg-slate-600 hover:!bg-slate-700" onClick={() => { setAskPin(false); setPin('') }}>Back</button>
              <button className="btn" onClick={onNo}>No, help me</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}