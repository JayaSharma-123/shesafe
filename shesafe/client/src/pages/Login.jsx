import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import Field from '../components/Field'
import Navbar from '../components/Navbar'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { isValidMobile } from '../lib/phone'

export default function Login() {
  const { user, login } = useAuth()
  const { toast } = useToast()
  const nav = useNavigate()
  const [role, setRole] = useState('user')
  const [f, setF] = useState({ phone: '', password: '' })
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)

  if (user) return <Navigate to={user.role === 'station' ? '/station' : '/app'} replace />

  const submit = async e => {
    e.preventDefault()
    const er = {}
    if (!isValidMobile(f.phone)) er.phone = 'Enter a valid 10-digit mobile number'
    if (!f.password) er.password = 'Enter your password'
    setErrors(er)
    if (Object.keys(er).length) return
    setBusy(true)
    try {
      const u = await login(f.phone, f.password, role)
      toast.success(`Welcome back, ${u.name.split(' ')[0]}`)
      nav(u.role === 'station' ? '/station' : '/app')
    } catch (err) { toast.error(err.message) } finally { setBusy(false) }
  }

  return (
    <>
      <Navbar />
      <main className="mx-auto mt-10 max-w-md px-4">
        <form onSubmit={submit} className="card space-y-4">
          <h1 className="text-2xl font-bold">Sign in</h1>
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
            {[['user', 'Login as User'], ['station', 'Login as Station']].map(([v, l]) => (
              <button type="button" key={v} onClick={() => setRole(v)}
                className={`rounded-lg py-2 text-sm font-semibold transition ${role === v ? 'bg-white shadow dark:bg-slate-900' : 'text-slate-500'}`}>{l}</button>
            ))}
          </div>
          <p className="text-sm text-slate-500">{role === 'station' ? 'Police station dashboard: live alerts, map, video and evidence.' : 'Hands-free SOS with live video to your nearest police station.'}</p>
          <Field label="Mobile number" inputMode="numeric" maxLength={10} value={f.phone} error={errors.phone} onChange={e => setF({ ...f, phone: e.target.value.replace(/\D/g, '') })} />
          
          <Field label="Password" type="password" value={f.password} error={errors.password} onChange={e => setF({ ...f, password: e.target.value })} />
                    <div className="text-right text-sm"><Link to="/forgot" className="font-semibold text-brand-600">Forgot password?</Link></div>
          <button className="btn w-full" disabled={busy}>{busy ? 'Signing in...' : role === 'station' ? 'Sign in as station' : 'Sign in as user'}</button>
          <p className="text-center text-sm">New here? <Link to="/signup" className="font-semibold text-brand-600">Create an account</Link></p>
        </form>
      </main>
    </>
  )
}