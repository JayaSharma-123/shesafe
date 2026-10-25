import { createContext, useCallback, useContext, useState } from 'react'
const Ctx = createContext()
export const useToast = () => useContext(Ctx)

const COLORS = { success: 'bg-emerald-600', error: 'bg-red-600', info: 'bg-slate-800', sos: 'bg-brand-600' }

// Shows pop-up messages and also keeps a history (used by the notification centre in a later step).
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const [history, setHistory] = useState([])

  const push = useCallback((type, message) => {
    const id = Date.now() + Math.random()
    setToasts(t => [...t, { id, type, message }])
    setHistory(h => [{ id, type, message, at: new Date().toISOString() }, ...h].slice(0, 50))
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4500)
  }, [])

  const toast = {
    success: m => push('success', m),
    error: m => push('error', m),
    info: m => push('info', m),
    sos: m => push('sos', m),
  }

  return (
    <Ctx.Provider value={{ toast, history }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex flex-col items-center gap-2 px-4">
        {toasts.map(t => (
          <div key={t.id} className={`toast-in pointer-events-auto w-full max-w-sm rounded-xl px-4 py-3 text-sm font-medium text-white shadow-lg ${COLORS[t.type]}`}>
            {t.message}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}