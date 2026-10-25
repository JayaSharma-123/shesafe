import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { api } from '../lib/api'

// Logout button. Users must enter their safety PIN first; station accounts log out directly.
// The PIN box is rendered with a portal so it covers the whole screen, not just the navbar.
export default function LogoutButton({ className = '', children = 'Logout' }) {
  const { user, logout } = useAuth()
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [pin, setPin] = useState('')
  const [wrong, setWrong] = useState(0)
  const [checking, setChecking] = useState(false)
  const inputRef = useRef()

  useEffect(() => { if (open) inputRef.current?.focus() }, [open])

  const close = () => { setOpen(false); setPin(''); setWrong(0) }

  const submit = async v => {
    setChecking(true)
    try {
      await api('/auth/verify-pin', { method: 'POST', body: { pin: v } })
      close(); logout(); toast.info('Logged out')
    } catch {
      const w = wrong + 1
      setPin('')
      if (w >= 3) { close(); toast.error('Too many wrong PINs. You are still logged in.') }
      else { setWrong(w); setChecking(false); inputRef.current?.focus() }
      return
    }
    setChecking(false)
  }
  const change = e => {
    const v = e.target.value.replace(/\D/g, '').slice(0, 4)
    setPin(v)
    if (v.length === 4 && !checking) submit(v) // checks on the 4th digit
  }

  return (
    <>
      <button className={className} onClick={() => (user.role === 'user' ? setOpen(true) : logout())}>{children}</button>
      {open && createPortal(
        <div className="fixed inset-0 z-[70] grid place-items-center bg-black/60 p-4">
          <div className="card w-full max-w-sm space-y-4 text-center">
            <h2 className="text-xl font-bold">Log out</h2>
            <p className="text-sm text-slate-500">Enter your 4-digit PIN to log out.</p>
            {wrong > 0 && <p className="text-sm font-semibold text-red-600">Wrong PIN ({wrong}/3)</p>}
            <input ref={inputRef} className="input text-center text-2xl tracking-[0.6em]" type="password" inputMode="numeric"
              maxLength={4} autoComplete="off" disabled={checking} value={pin} onChange={change} />
            <button onClick={close} className="w-full text-sm text-slate-500">Cancel, stay logged in</button>
          </div>
        </div>, document.body)}
    </>
  )
}