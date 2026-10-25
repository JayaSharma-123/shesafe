import { useState } from 'react'
import { useToast } from '../context/ToastContext'

const DOT = { success: 'bg-emerald-500', error: 'bg-red-500', info: 'bg-slate-400', sos: 'bg-brand-600' }

// Bell with a dropdown of every notification shown this session (history comes from ToastContext).
export default function NotificationCenter() {
  const { history } = useToast()
  const [open, setOpen] = useState(false)
  const [seenAt, setSeenAt] = useState(0)
  const unread = history.filter(h => new Date(h.at).getTime() > seenAt).length

  const toggle = () => { setOpen(o => !o); setSeenAt(Date.now()) }

  return (
    <div className="relative">
      <button onClick={toggle} aria-label="Notifications" className="relative rounded-lg border border-slate-300 px-3 py-1.5 dark:border-slate-700">
        Alerts
        {unread > 0 && <span className="absolute -right-2 -top-2 grid h-5 min-w-5 place-items-center rounded-full bg-brand-600 px-1 text-xs font-bold text-white">{unread}</span>}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 max-h-96 w-80 max-w-[85vw] overflow-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <p className="px-2 py-1 text-sm font-bold">Notifications</p>
            {history.length === 0 && <p className="px-2 py-6 text-center text-sm text-slate-500">Nothing yet.</p>}
            {history.map(h => (
              <div key={h.id} className="flex gap-2 rounded-lg px-2 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800">
                <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${DOT[h.type]}`} />
                <div><p>{h.message}</p><p className="text-xs text-slate-500">{new Date(h.at).toLocaleTimeString()}</p></div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}