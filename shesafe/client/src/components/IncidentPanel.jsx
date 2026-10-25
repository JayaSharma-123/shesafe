import { useCallback, useEffect, useRef, useState } from 'react'
import MapView from './MapView'
import LiveVideo from './LiveVideo'
import { api, getToken } from '../lib/api'
import { useToast } from '../context/ToastContext'

const OPEN = ['active', 'received', 'on_the_way']

// Everything about one incident: map, live video, status buttons, evidence clips, audit log.
export default function IncidentPanel({ incident: i, live, urgent, socket, stationPos, onStatus, onClose }) {
  const { toast } = useToast()
  const [evidence, setEvidence] = useState(null)
  const [audit, setAudit] = useState([])
  const [clip, setClip] = useState(null)
  const urlRef = useRef(null)
  const isOpen = OPEN.includes(i.status)

  const loadEv = useCallback(() => api('/evidence/incident/' + i.id).then(setEvidence).catch(() => setEvidence([])), [i.id])
  const loadAudit = useCallback(() => api('/audit/' + i.id).then(setAudit).catch(() => {}), [i.id])

  useEffect(() => {
    loadEv(); loadAudit()
    if (!isOpen) return
    const t = setInterval(loadEv, 6000) // new clips appear while the emergency is live
    return () => clearInterval(t)
  }, [loadEv, loadAudit, isOpen])
  useEffect(() => () => { urlRef.current && URL.revokeObjectURL(urlRef.current) }, [])

  // Fetch the clip with the login token, then play it. One fetch = one audit-log line.
  const play = async index => {
    try {
      const r = await fetch(`/api/evidence/file/${evidence[index].id}`, { headers: { Authorization: 'Bearer ' + getToken() } })
      if (!r.ok) throw new Error('Could not open clip')
      const url = URL.createObjectURL(await r.blob())
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
      urlRef.current = url
      setClip({ index, url })
      loadAudit()
    } catch (e) { toast.error(e.message) }
  }
  const verify = async () => {
    const r = await api('/evidence/verify/' + i.id)
    r.intact ? toast.success('Evidence chain is intact') : toast.error('Evidence has been altered!')
  }

  const pos = live ? { lat: live.lat, lng: live.lng } : { lat: i.lat, lng: i.lng }
  const trail = live?.trail?.length ? live.trail : [[i.lat, i.lng]]

  return (
    <div className="card space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold">{i.user_name} <span className="text-sm font-normal text-slate-500">#{i.id}</span></h2>
          <a href={`tel:${i.user_phone}`} className="text-sm font-semibold text-brand-600">Call {i.user_phone}</a>
          <span className="text-sm text-slate-500"> · trigger: {i.trigger.replace(/_/g, ' ')} · {new Date(i.started_at).toLocaleString()}</span>
        </div>
        <button onClick={onClose} className="text-sm text-slate-500 lg:hidden">Back to list</button>
      </div>

      {(urgent || i.flag) && (
        <div className="rounded-xl bg-red-600 p-3 text-sm font-semibold text-white">
          URGENT: {urgent || 'Three wrong PINs - the person may not be the real user'}
        </div>
      )}

      {isOpen ? (
        <div className="grid grid-cols-3 gap-2">
          <button className="btn !py-2" onClick={() => onStatus(i.id, 'received')}>Received</button>
          <button className="btn !bg-blue-600 !py-2 hover:!bg-blue-700" onClick={() => onStatus(i.id, 'on_the_way')}>On the way</button>
          <button className="btn !bg-emerald-600 !py-2 hover:!bg-emerald-700" onClick={() => window.confirm('Close this case as resolved?') && onStatus(i.id, 'resolved')}>Resolved</button>
        </div>
      ) : i.status === 'user_exited' ? (
        <div className="space-y-2 rounded-xl bg-emerald-50 p-3 text-sm dark:bg-emerald-950">
          The user ended this emergency ({i.closed_reason === 'false_alarm' ? 'false alarm' : 'says she is safe'}). Confirm to close the case.
          <button className="btn mt-2 w-full !bg-emerald-600 !py-2 hover:!bg-emerald-700" onClick={() => onStatus(i.id, 'resolved')}>Confirm and close case</button>
        </div>
      ) : (
        <p className="rounded-xl bg-slate-100 p-3 text-sm dark:bg-slate-800">This case is closed.</p>
      )}

            {isOpen && i.level === 'urgent' && <LiveVideo socket={socket} incidentId={i.id} />}
      {isOpen && i.level === 'watch' && (
        <div className="rounded-xl bg-blue-50 p-3 text-sm text-blue-900 dark:bg-blue-950 dark:text-blue-100">
          Normal mode: location tracking only. Live video, recording and the siren start automatically if the person says she is unsafe or doesn't reply within 30 seconds.
        </div>
      )}
      <MapView user={pos} station={stationPos} trail={trail} />
      <a className="block text-sm font-semibold text-brand-600" target="_blank" rel="noreferrer"
        href={`https://maps.google.com/?q=${pos.lat},${pos.lng}`}>Open in Google Maps (get directions)</a>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-bold">Evidence vault</h3>
          <button onClick={verify} className="text-sm font-semibold text-brand-600">Verify chain</button>
        </div>
        {evidence === null && <div className="h-10 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />}
        {evidence?.length === 0 && <p className="text-sm text-slate-500">No clips yet.</p>}
        <div className="flex flex-wrap gap-2">
          {evidence?.map((e, k) => (
            <button key={e.id} onClick={() => play(k)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${clip?.index === k ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-slate-300 dark:border-slate-700'}`}>
              Clip {k + 1}
            </button>
          ))}
        </div>
        {clip && <video key={clip.url} src={clip.url} controls autoPlay playsInline className="mt-3 w-full rounded-xl bg-black"
          onEnded={() => clip.index + 1 < evidence.length && play(clip.index + 1)} />}
      </section>

      <section>
        <h3 className="mb-2 font-bold">Who viewed the evidence</h3>
        {audit.length === 0 ? <p className="text-sm text-slate-500">No views recorded yet.</p> : (
          <ul className="max-h-40 space-y-1 overflow-auto text-sm">
            {audit.map((a, k) => <li key={k} className="text-slate-600 dark:text-slate-300">{a.viewer} opened clip #{a.evidence_id} · {new Date(a.ts).toLocaleTimeString()}</li>)}
          </ul>
        )}
      </section>
    </div>
  )
}