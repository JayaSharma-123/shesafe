import { useState } from 'react'

// PIN pop-up to end an emergency. The user also says whether she is safe or it was a false alarm.
export default function ExitModal({ onSubmit, onClose }) {
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)

  const go = async outcome => {
    if (pin.length !== 4) return
    setBusy(true)
    await onSubmit(pin, outcome)
    setBusy(false); setPin('')
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
      <div className="card w-full max-w-sm space-y-4">
        <h2 className="text-xl font-bold">End emergency</h2>
        <p className="text-sm text-slate-500">Enter your 4-digit PIN. Recordings stay saved either way.</p>
        <input className="input text-center text-2xl tracking-[0.6em]" type="password" inputMode="numeric" maxLength={4}
          autoFocus value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ''))} />
        <div className="grid grid-cols-2 gap-2">
          <button className="btn" disabled={busy || pin.length !== 4} onClick={() => go('safe')}>I'm safe</button>
          <button className="btn !bg-slate-600 hover:!bg-slate-700" disabled={busy || pin.length !== 4} onClick={() => go('false_alarm')}>False alarm</button>
        </div>
        <button onClick={onClose} className="w-full text-sm text-slate-500">Cancel, I still need help</button>
      </div>
    </div>
  )
}