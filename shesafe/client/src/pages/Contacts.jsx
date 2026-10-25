import { useState } from 'react'
import Navbar from '../components/Navbar'
import Field from '../components/Field'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { api } from '../lib/api'

// Manage trusted contacts. They get an SMS with your live location link when an SOS starts.
export default function Contacts() {
  const { user, setUser } = useAuth()
  const { toast } = useToast()
  const [f, setF] = useState({ name: '', phone: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const save = async contacts => {
    setBusy(true)
    try { setUser(await api('/me/contacts', { method: 'PUT', body: { contacts } })); return true }
    catch (e) { toast.error(e.message); return false }
    finally { setBusy(false) }
  }
  const add = async e => {
    e.preventDefault()
    if (!/^[6-9]\d{9}$/.test(f.phone)) return setError('Enter a valid 10-digit mobile number')
    if (user.contacts.length >= 5) return setError('You can add up to 5 contacts')
    setError('')
    if (await save([...user.contacts, { name: f.name || 'Trusted contact', phone: f.phone }])) {
      setF({ name: '', phone: '' }); toast.success('Trusted contact added')
    }
  }
  const remove = async phone => {
    if (window.confirm('Remove this contact?') && await save(user.contacts.filter(c => c.phone !== phone))) toast.info('Contact removed')
  }

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-2xl space-y-5 px-4 py-6">
        <div className="card space-y-1">
          <h1 className="text-2xl font-bold">Trusted contacts</h1>
          <p className="text-sm text-slate-500">When an SOS starts, these people get an SMS with a link to your live location. Only add people who agreed to receive emergency alerts. Up to 5.</p>
        </div>

        <form onSubmit={add} className="card space-y-3">
          <h2 className="font-bold">Add a contact</h2>
          <Field label="Name" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} />
          <Field label="Mobile number" inputMode="numeric" maxLength={10} value={f.phone} error={error}
            onChange={e => setF({ ...f, phone: e.target.value.replace(/\D/g, '') })} />
          <button className="btn w-full" disabled={busy}>{busy ? 'Saving...' : 'Add contact'}</button>
        </form>

        <section className="card">
          <h2 className="mb-2 font-bold">Your contacts ({user.contacts.length}/5)</h2>
          {user.contacts.length === 0 && <p className="py-6 text-center text-sm text-slate-500">No contacts yet. Add someone you trust above.</p>}
          {user.contacts.map(c => (
            <div key={c.phone} className="flex items-center justify-between border-t border-slate-200 py-3 first:border-0 dark:border-slate-800">
              <div><p className="font-semibold">{c.name}</p><p className="text-sm text-slate-500">+91 {c.phone}</p></div>
              <button onClick={() => remove(c.phone)} disabled={busy} className="text-sm font-semibold text-red-600">Remove</button>
            </div>
          ))}
        </section>
      </main>
    </>
  )
}