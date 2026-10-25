import { useEffect, useState } from 'react'

const OPTIONS = [[60, '1 min (demo)'], [300, '5 min'], [600, '10 min'], [900, '15 min']]
const mmss = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

// Start a Safety Journey, see the next check-in, or open the "End trip" box.
export default function JourneyCard({ journey, onStart, onStop }) {
  const [sec, setSec] = useState(600)
  const [left, setLeft] = useState(0)

  useEffect(() => {
    if (!journey.active) return
    const t = setInterval(() => setLeft(Math.max(0, Math.round((journey.journey.nextAt - Date.now()) / 1000))), 500)
    return () => clearInterval(t)
  }, [journey.active, journey.journey])

  return (
    <div className="rounded-xl border border-slate-200 p-4 text-left dark:border-slate-800">
      <p className="font-semibold">Safety Journey</p>
      {!journey.active ? (
        <>
          <p className="mb-3 text-sm text-slate-500">Get an "Are you safe?" check-in on a schedule while you travel.</p>
          <div className="flex gap-2">
            <select className="input !py-2" value={sec} onChange={e => setSec(+e.target.value)}>
              {OPTIONS.map(([v, l]) => <option key={v} value={v}>Every {l}</option>)}
            </select>
            <button className="btn whitespace-nowrap" onClick={() => onStart(sec)}>Start trip</button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-slate-500">Trip active. Next check-in in <b className="text-slate-900 dark:text-slate-100">{mmss(left)}</b></p>
          <p className="mb-3 text-sm text-slate-500">
            {journey.journey.lastSafeAt
              ? <>Last confirmed safe at <b className="text-emerald-600">{new Date(journey.journey.lastSafeAt).toLocaleTimeString()}</b></>
              : 'No check-in answered yet.'}
          </p>
          <button className="btn !bg-slate-700 hover:!bg-slate-800" onClick={onStop}>End trip (PIN)</button>
        </>
      )}
    </div>
  )
}