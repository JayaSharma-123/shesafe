import { useState } from 'react'
import Navbar from '../components/Navbar'
import Field from '../components/Field'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { useToast } from '../context/ToastContext'
import { api } from '../lib/api'
import LogoutButton from '../components/LogoutButton'
import VoiceKeywordCard from '../components/VoiceKeywordCard'

// Profile, PIN, password and notification settings.
export default function Profile() {
  const { user, setUser } = useAuth()
  const { theme, toggle } = useTheme()
  const { toast } = useToast()
  const [name, setName] = useState(user.name)
  const [pin, setPin] = useState({ current: '', next: '' })
  const [pw, setPw] = useState({ current: '', next: '' })
  const [perm, setPerm] = useState('Notification' in window ? Notification.permission : 'unsupported')
  const digits = k => e => setPin({ ...pin, [k]: e.target.value.replace(/\D/g, '').slice(0, 4) })

  const run = async (fn, ok) => { try { await fn(); toast.success(ok) } catch (e) { toast.error(e.message) } }
  const saveName = e => { e.preventDefault(); run(async () => setUser(await api('/me/profile', { method: 'PUT', body: { name } })), 'Name updated') }
  const savePin = e => {
    e.preventDefault()
    if (pin.next.length !== 4) return toast.error('New PIN must be 4 digits')
    run(async () => { await api('/me/pin', { method: 'POST', body: pin }); setPin({ current: '', next: '' }) }, 'PIN changed')
  }
  const savePw = e => {
    e.preventDefault()
    if (pw.next.length < 8) return toast.error('New password needs 8+ characters')
    run(async () => { await api('/me/password', { method: 'POST', body: pw }); setPw({ current: '', next: '' }) }, 'Password changed')
  }
  const askNotify = async () => { setPerm(await Notification.requestPermission()) }

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-2xl space-y-5 px-4 py-6">
        <div className="card flex items-center gap-4">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-brand-600 text-2xl font-bold text-white">{user.name[0]}</span>
          <div><h1 className="text-xl font-bold">{user.name}</h1><p className="text-sm text-slate-500">+91 {user.phone} · {user.role === 'station' ? 'Police station account' : 'Protected user'}</p></div>
        </div>

        <form onSubmit={saveName} className="card space-y-3">
          <h2 className="font-bold">Your name</h2>
          <Field label="Full name" value={name} onChange={e => setName(e.target.value)} />
          <button className="btn">Save name</button>
        </form>

        {user.role === 'user' && (
          <form onSubmit={savePin} className="card space-y-3">
            <h2 className="font-bold">Change safety PIN</h2>
            <Field label="Current PIN" type="password" inputMode="numeric" value={pin.current} onChange={digits('current')} />
            <Field label="New 4-digit PIN" type="password" inputMode="numeric" value={pin.next} onChange={digits('next')} />
            <button className="btn">Change PIN</button>
          </form>
        )}

        <form onSubmit={savePw} className="card space-y-3">
          <h2 className="font-bold">Change password</h2>
          <Field label="Current password" type="password" value={pw.current} onChange={e => setPw({ ...pw, current: e.target.value })} />
          <Field label="New password (8+ characters)" type="password" value={pw.next} onChange={e => setPw({ ...pw, next: e.target.value })} />
          <button className="btn">Change password</button>
        </form>
                {user.role === 'user' && <VoiceKeywordCard />}
        <section className="card space-y-3">
          <h2 className="font-bold">Settings</h2>
          <div className="flex items-center justify-between text-sm">
            <span>Theme: {theme}</span><button onClick={toggle} className="font-semibold text-brand-600">Switch to {theme === 'dark' ? 'light' : 'dark'}</button>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span>Browser notifications: {perm}</span>
            {perm === 'default' && <button onClick={askNotify} className="font-semibold text-brand-600">Allow</button>}
            {perm === 'denied' && <span className="text-slate-500">Unblock in the browser's site settings</span>}
          </div>
                    <LogoutButton className="btn w-full !bg-slate-700 hover:!bg-slate-800">Log out</LogoutButton>
        </section>
      </main>
    </>
  )
}