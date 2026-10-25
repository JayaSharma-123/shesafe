import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import Field from '../components/Field'
import Navbar from '../components/Navbar'
import { api } from '../lib/api'
import { isValidMobile } from '../lib/phone'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'

export default function Signup() {
  const { user, signup } = useAuth()
  const { toast } = useToast()
  const nav = useNavigate()
  const [role, setRole] = useState('user')
  const [stations, setStations] = useState([])
  const [f, setF] = useState({ name: '', phone: '', password: '', pin: '', stationId: '', invite: '', cName: '', cPhone: '', otp: '' })
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const [otpSent, setOtpSent] = useState(false)
  const [sending, setSending] = useState(false)
  const [cooldown, setCooldown] = useState(0)

  useEffect(() => { api('/stations').then(setStations).catch(() => {}) }, [])
  useEffect(() => { // resend countdown
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])
  if (user) return <Navigate to={user.role === 'station' ? '/station' : '/app'} replace />
  const set = k => e => setF({ ...f, [k]: e.target.value })
  const digits = (k, n) => e => setF({ ...f, [k]: e.target.value.replace(/\D/g, '').slice(0, n) })

  const changePhone = e => { setF({ ...f, phone: e.target.value.replace(/\D/g, '').slice(0, 10), otp: '' }); setOtpSent(false) }

  const sendOtp = async () => {
    if (!isValidMobile(f.phone)) return setErrors({ ...errors, phone: 'Enter a real 10-digit Indian mobile number' })
    setErrors({ ...errors, phone: '' }); setSending(true)
    try {
      const r = await api('/auth/send-otp', { method: 'POST', body: { phone: f.phone } })
      setOtpSent(true); setCooldown(30)
      r.devOtp ? toast.info(`Demo mode: your OTP is ${r.devOtp}`) : toast.success('OTP sent by SMS. It is valid for 5 minutes.')
    } catch (err) { toast.error(err.message) } finally { setSending(false) }
  }

  const submit = async e => {
    e.preventDefault()
    const er = {}
    if (f.name.trim().length < 2) er.name = 'Enter your name'
    if (!isValidMobile(f.phone)) er.phone = 'Enter a real 10-digit Indian mobile number'
    if (!otpSent) er.phone = er.phone || 'Verify your number: tap Send OTP'
    if (f.otp.length !== 6) er.otp = 'Enter the 6-digit OTP'
    if (f.password.length < 8) er.password = 'At least 8 characters'
    if (!/^\d{4}$/.test(f.pin)) er.pin = 'PIN must be exactly 4 digits'
    if (role === 'station' && !f.stationId) er.stationId = 'Choose your station'
    if (role === 'station' && !f.invite) er.invite = 'Enter the station invite code'
    if (role === 'user' && f.cPhone && !isValidMobile(f.cPhone)) er.cPhone = 'Enter a real 10-digit number'
    setErrors(er)
    if (Object.keys(er).length) return
    setBusy(true)
    try {
      const contacts = role === 'user' && f.cPhone ? [{ name: f.cName || 'Trusted contact', phone: f.cPhone }] : []
      const u = await signup({ name: f.name, phone: f.phone, password: f.password, pin: f.pin, role, otp: f.otp,
        stationId: +f.stationId || undefined, inviteCode: f.invite || undefined, contacts })
      toast.success('Account created and phone verified')
      nav(u.role === 'station' ? '/station' : '/app')
    } catch (err) { toast.error(err.message) } finally { setBusy(false) }
  }

  return (
    <>
      <Navbar />
      <main className="mx-auto my-8 max-w-md px-4">
        <form onSubmit={submit} className="card space-y-4">
          <h1 className="text-2xl font-bold">Create account</h1>
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
            {[['user', 'I need protection'], ['station', 'Police station']].map(([v, l]) => (
              <button type="button" key={v} onClick={() => setRole(v)}
                className={`rounded-lg py-2 text-sm font-semibold transition ${role === v ? 'bg-white shadow dark:bg-slate-900' : 'text-slate-500'}`}>{l}</button>
            ))}
          </div>
          <Field label="Full name" value={f.name} error={errors.name} onChange={set('name')} />

          <div className="flex items-start gap-2">
            <div className="flex-1"><Field label="Mobile number" inputMode="numeric" maxLength={10} value={f.phone} error={errors.phone} onChange={changePhone} /></div>
            <button type="button" onClick={sendOtp} disabled={sending || cooldown > 0} className="btn mt-6 whitespace-nowrap !px-3 !py-3 text-sm">
              {sending ? '...' : cooldown > 0 ? `Resend ${cooldown}s` : otpSent ? 'Resend OTP' : 'Send OTP'}
            </button>
          </div>
          {otpSent && <Field label="6-digit OTP sent to your phone" inputMode="numeric" maxLength={6} autoComplete="one-time-code" value={f.otp} error={errors.otp} onChange={digits('otp', 6)} />}

          <Field label="Password (8+ characters)" type="password" value={f.password} error={errors.password} onChange={set('password')} />
          <Field label="4-digit safety PIN (used to exit an emergency)" type="password" inputMode="numeric" maxLength={4} value={f.pin} error={errors.pin} onChange={digits('pin', 4)} />

          {role === 'station' && (
            <>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">Your station</span>
                <select className="input" value={f.stationId} onChange={set('stationId')}>
                  <option value="">Select...</option>
                  {stations.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                {errors.stationId && <span className="mt-1 block text-sm text-red-600">{errors.stationId}</span>}
              </label>
              <Field label="Station invite code (given by your department)" type="password" value={f.invite} error={errors.invite} onChange={set('invite')} />
            </>
          )}
          {role === 'user' && (
            <>
              <p className="pt-2 text-sm font-semibold">Trusted contact (optional, can add later)</p>
              <Field label="Contact name" value={f.cName} onChange={set('cName')} />
              <Field label="Contact mobile" inputMode="numeric" maxLength={10} value={f.cPhone} error={errors.cPhone} onChange={digits('cPhone', 10)} />
            </>
          )}
          <button className="btn w-full" disabled={busy}>{busy ? 'Creating...' : 'Verify and create account'}</button>
          <p className="text-center text-sm">Already registered? <Link to="/login" className="font-semibold text-brand-600">Sign in</Link></p>
        </form>
      </main>
    </>
  )
}