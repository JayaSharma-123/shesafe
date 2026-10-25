import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { api } from '../lib/api'
import { connectSocket } from '../lib/socket'
import { useBeep } from '../hooks/useBeep'
import MapView from './MapView'

// Red alert cards for people who named you as a trusted contact. Always mounted for the "user" role.
export default function ContactAlerts() {
  const { user } = useAuth()
  const { toast } = useToast()
  const beep = useBeep()
  const [alerts, setAlerts] = useState({}) // incidentId -> { id, name, phone, lat, lng, trail }
  const [acked, setAcked] = useState({})   // incidentId -> true after "I've seen this"
  const [mapOpen, setMapOpen] = useState({})
  const ackRef = useRef({}); ackRef.current = acked
  const T = useRef(toast); T.current = toast

  useEffect(() => {
    if (user?.role !== 'user') return
    const unlock = () => beep.unlock().catch(() => {})
    unlock(); window.addEventListener('pointerdown', unlock, { once: true }) // browsers need one click before sound
    const add = a => setAlerts(l => ({ ...l, [a.id]: { trail: [[a.lat, a.lng]], ...l[a.id], ...a } }))
    api('/me/alerts').then(rows => rows.forEach(add)).catch(() => {})

    const s = connectSocket()
    s.on('sos:beep', d => {
      add({ id: d.incidentId, name: d.name, phone: d.phone, lat: d.lat, lng: d.lng })
      T.current.sos(`SOS from ${d.name}! Check the red alert.`)
      if (!ackRef.current[d.incidentId]) beep.start(d.incidentId)
      if ('Notification' in window && Notification.permission === 'granted')
        new Notification('SOS ALERT', { body: `${d.name} needs help`, requireInteraction: true, tag: 'contact-' + d.incidentId })
    })
    s.on('sos:location', ({ incidentId, lat, lng }) => setAlerts(l => l[incidentId]
      ? { ...l, [incidentId]: { ...l[incidentId], lat, lng, trail: [...l[incidentId].trail, [lat, lng]].slice(-200) } } : l))
    s.on('sos:status', ({ incidentId, status }) => {
      beep.stop(incidentId) // someone acknowledged, so the beep stops
      if (status === 'resolved' || status === 'user_exited') {
        setAlerts(l => { const n = { ...l }; delete n[incidentId]; return n })
        T.current.info('The emergency has ended.')
      }
    })
    return () => { window.removeEventListener('pointerdown', unlock); s.disconnect(); beep.stopAll() }
  }, [user?.id])

  const list = Object.values(alerts)
  if (user?.role !== 'user' || !list.length) return null
  const see = id => { beep.stop(id); setAcked(a => ({ ...a, [id]: true })) }

  return (
    <div className="fixed inset-x-0 bottom-0 z-[55] max-h-[80vh] space-y-2 overflow-auto p-3">
      {list.map(a => (
        <div key={a.id} className="mx-auto max-w-lg space-y-3 rounded-2xl bg-red-600 p-4 text-white shadow-2xl">
          <p className="text-lg font-extrabold">SOS from {a.name}</p>
          <p className="text-sm">She needs help. Her live location is below. Call her or go to her if you can.</p>
          <div className="grid grid-cols-2 gap-2 text-center text-sm font-bold">
            <a href={`tel:${a.phone}`} className="rounded-xl bg-white py-2 text-red-700">Call {a.name.split(' ')[0]}</a>
            <a href={`https://maps.google.com/?q=${a.lat},${a.lng}`} target="_blank" rel="noreferrer" className="rounded-xl bg-white py-2 text-red-700">Open in Google Maps</a>
            <button onClick={() => setMapOpen(m => ({ ...m, [a.id]: !m[a.id] }))} className="rounded-xl bg-red-800 py-2">{mapOpen[a.id] ? 'Hide live map' : 'Show live map'}</button>
            {!acked[a.id]
              ? <button onClick={() => see(a.id)} className="rounded-xl bg-red-800 py-2">I've seen this</button>
              : <button onClick={() => setAlerts(l => { const n = { ...l }; delete n[a.id]; return n })} className="rounded-xl bg-red-800 py-2">Hide card</button>}
          </div>
          {mapOpen[a.id] && <MapView user={{ lat: a.lat, lng: a.lng }} station={null} trail={a.trail} />}
        </div>
      ))}
    </div>
  )
}