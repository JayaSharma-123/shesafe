import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Field from '../components/Field'
import Navbar from '../components/Navbar'
import { api } from '../lib/api'
import { isValidMobile } from '../lib/phone'
import { useToast } from '../context/ToastContext'

// Forgot password: phone -> OTP -> new password.
export default function ForgotPassword() {
  const { toast } = useToast()
  const nav = useNavigate()
  const [f, setF] = useState({ phone: '', otp: '', password: '', confirm: '' })
  const [errors, setErrors] = useState({})
  const [otpSent, setOtpSent] = useState(false)
  const [sending, setSending] = useState(false)
  const [busy, setBusy] = useState(false)
  const [cooldown, setCooldown] = useState(0)

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  const digits = (k, n) => e => setF({ ...f, [k]: e.target.value.replace(/\D/g, '').slice(0, n) })
  const changePhone = e => { setF({ ...f, phone: e.target.value.replace(/\D/g, '').slice(0, 10), otp: '' }); setOtpSent(false) }

  const sendOtp = async () => {
    if (!isValidMobile(f.phone)) return setErrors({ phone: 'Enter a valid 10-digit mobile number' })
    setErrors({}); setSending(true)
    try {
      const r = await api('/auth/forgot/send-otp', { method: 'POST', body: { phone: f.phone } })
      setOtpSent(true); setCooldown(30)
      r.devOtp ? toast.info(`Demo mode: your OTP is ${r.devOtp}`) : toast.success('If this number is registered, an OTP has been sent.')
    } catch (err) { toast.error(err.message) } finally { setSending(false) }
  }

  const submit = async e => {
    e.preventDefault()
    const er = {}
    if (!isValidMobile(f.phone)) er.phone = 'Enter a valid 10-digit mobile number'
    else if (!otpSent) er.phone = 'Tap Send OTP first'
    if (f.otp.length !== 6) er.otp = 'Enter the 6-digit OTP'
    if (f.password.length < 8) er.password = 'At least 8 characters'
    if (f.confirm !== f.password) er.confirm = 'Passwords do not match'
    setErrors(er)
    if (Object.keys(er).length) return
    setBusy(true)
    try {
      await api('/auth/forgot/reset', { method: 'POST', body: { phone: f.phone, otp: f.otp, password: f.password } })
      toast.success('Password changed. Please sign in.')
      nav('/login')
    } catch (err) { toast.error(err.message) } finally { setBusy(false) }
  }

  return (
    <>
      <Navbar />
      <main className="mx-auto mt-10 max-w-md px-4">
        <form onSubmit={submit} className="card space-y-4">
          <h1 className="text-2xl font-bold">Forgot password</h1>
          <p className="text-sm text-slate-500">Enter your registered mobile number. We will send a 6-digit code to reset your password. Your safety PIN does not change.</p>

          <div className="flex items-start gap-2">
            <div className="flex-1"><Field label="Mobile number" inputMode="numeric" maxLength={10} value={f.phone} error={errors.phone} onChange={changePhone} /></div>
            <button type="button" onClick={sendOtp} disabled={sending || cooldown > 0} className="btn mt-6 whitespace-nowrap !px-3 !py-3 text-sm">
              {sending ? '...' : cooldown > 0 ? `Resend ${cooldown}s` : otpSent ? 'Resend OTP' : 'Send OTP'}
            </button>
          </div>

          {otpSent && (
            <>
              <Field label="6-digit OTP" inputMode="numeric" maxLength={6} autoComplete="one-time-code" value={f.otp} error={errors.otp} onChange={digits('otp', 6)} />
              <Field label="New password (8+ characters)" type="password" value={f.password} error={errors.password} onChange={e => setF({ ...f, password: e.target.value })} />
              <Field label="Confirm new password" type="password" value={f.confirm} error={errors.confirm} onChange={e => setF({ ...f, confirm: e.target.value })} />
              <button className="btn w-full" disabled={busy}>{busy ? 'Saving...' : 'Reset password'}</button>
            </>
          )}
          <p className="text-center text-sm"><Link to="/login" className="font-semibold text-brand-600">Back to sign in</Link></p>
        </form>
      </main>
    </>
  )
}