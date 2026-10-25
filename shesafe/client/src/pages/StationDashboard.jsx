import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Navbar from '../components/Navbar'
import IncidentPanel from '../components/IncidentPanel'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { api } from '../lib/api'
import { connectSocket } from '../lib/socket'
import { useBeep } from '../hooks/useBeep'

const OPEN = ['active', 'received', 'on_the_way']
const LABEL = { active: 'Active', received: 'Received', on_the_way: 'On the way', user_exited: 'User exited', closed: 'Resolved' }
const badge = i => i.status === 'active'
  ? (i.level === 'watch' ? ['Tracking', 'bg-blue-600 text-white'] : ['NEW ALERT', 'bg-red-600 text-white animate-pulse'])
  : ({ received: ['Received', 'bg-amber-500 text-white'], on_the_way: ['On the way', 'bg-blue-600 text-white'],
       user_exited: ['User exited', 'bg-emerald-600 text-white'], closed: ['Resolved', 'bg-slate-500 text-white'] }[i.status] || ['', ''])

export default function StationDashboard() {
  const { user } = useAuth()
  const { toast } = useToast()
  const beep = useBeep()
  const [incidents, setIncidents] = useState(null) // null = loading skeleton
  const [error, setError] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [live, setLive] = useState({})     // incidentId -> { lat, lng, trail }
  const [urgent, setUrgent] = useState({}) // incidentId -> flag reason
  const [stationPos, setStationPos] = useState(null)
  const [soundOn, setSoundOn] = useState(false)
  const [q, setQ] = useState(''); const [fStatus, setFStatus] = useState('all'); const [sort, setSort] = useState('new')
  const [socket, setSocket] = useState(null)
  const incRef = useRef([]); const T = useRef(toast); T.current = toast
  const socketRef = useRef(null)
  useEffect(() => { incRef.current = incidents || [] }, [incidents])

  const load = useCallback(() => {
    setError('')
    api('/incidents').then(rows => { setIncidents(rows); rows.filter(r => OPEN.includes(r.status)).forEach(r => socketRef.current?.emit('join', r.id)) })
      .catch(e => setError(e.message))
  }, [])

  useEffect(() => {
    api('/stations').then(l => setStationPos(l.find(s => s.id === user.stationId) || null)).catch(() => {})
    const s = connectSocket()
    socketRef.current = s; setSocket(s)
    s.on('connect', () => incRef.current.filter(r => OPEN.includes(r.status)).forEach(r => s.emit('join', r.id)))

    // New alert OR an upgrade (same incident id, level changed from watch to urgent)
    s.on('sos:new', ({ incident, user: u }) => {
      const row = { ...incident, user_name: u.name, user_phone: u.phone }
      setIncidents(l => [row, ...(l || []).filter(x => x.id !== row.id)])
      s.emit('join', incident.id)
      if (incident.level === 'watch') {
        T.current.info(`${u.name} replied "No" - tracking her location (Normal)`)
      } else {
        T.current.sos(`SOS from ${u.name}!`)
        beep.start(incident.id)
        setSelectedId(id => id ?? incident.id)
        if ('Notification' in window && Notification.permission === 'granted')
          new Notification('SOS ALERT', { body: `${u.name} needs help`, requireInteraction: true, tag: 'sos-' + incident.id })
      }
    })
    s.on('sos:status', ({ incidentId, status, outcome }) => {
      setIncidents(l => l && l.map(x => x.id === incidentId ? { ...x, status, closed_reason: outcome || x.closed_reason } : x))
      beep.stop(incidentId)
      if (status === 'user_exited') T.current.info('The user ended the emergency. Confirm and close the case.')
    })
    s.on('sos:urgent', ({ incidentId, reason }) => {
      setUrgent(u => ({ ...u, [incidentId]: reason }))
      T.current.error('URGENT: ' + reason)
      beep.start(incidentId)
    })
    s.on('sos:location', ({ incidentId, lat, lng }) =>
      setLive(l => ({ ...l, [incidentId]: { lat, lng, trail: [...(l[incidentId]?.trail || []), [lat, lng]].slice(-200) } })))

    load()
    return () => { s.disconnect(); beep.stopAll() }
  }, [])

  const setStatus = async (id, status) => {
    try {
      await api(`/sos/${id}/status`, { method: 'POST', body: { status } })
      setIncidents(l => l.map(x => x.id === id ? { ...x, status: status === 'resolved' ? 'closed' : status } : x))
      beep.stop(id)
      toast.success(status === 'received' ? 'Marked as received' : status === 'on_the_way' ? 'Marked as on the way' : 'Case closed')
    } catch (e) { toast.error(e.message) }
  }
  const enableSound = async () => {
    const ok = await beep.unlock()
    if ('Notification' in window && Notification.permission === 'default') await Notification.requestPermission()
    setSoundOn(ok); ok ? beep.test() : toast.error('Click the page and try again')
  }

  // Filter, search, sort, then split into the three sections
  const { urgentList, normalList, pastList } = useMemo(() => {
    const l = (incidents || []).filter(i => (fStatus === 'all' || (fStatus === 'open' ? OPEN.includes(i.status) : i.status === fStatus)) &&
      (!q || (i.user_name + i.user_phone + i.trigger).toLowerCase().includes(q.toLowerCase())))
      .sort((a, b) => sort === 'old' ? a.id - b.id : b.id - a.id)
    const open = i => OPEN.includes(i.status)
    return { urgentList: l.filter(i => open(i) && i.level === 'urgent'), normalList: l.filter(i => open(i) && i.level === 'watch'), pastList: l.filter(i => !open(i)) }
  }, [incidents, q, fStatus, sort])

  const stats = useMemo(() => {
    const l = incidents || [], open = i => OPEN.includes(i.status)
    return { urgent: l.filter(i => open(i) && i.level === 'urgent').length, normal: l.filter(i => open(i) && i.level === 'watch').length,
      total: l.length, falseAlarms: l.filter(i => i.closed_reason === 'false_alarm').length }
  }, [incidents])

  const selected = incidents?.find(i => i.id === selectedId)

  const card = i => {
    const [text, cls] = badge(i)
    return (
      <button key={i.id} onClick={() => setSelectedId(i.id)}
        className={`card w-full !p-4 text-left transition hover:border-brand-500 ${selectedId === i.id ? 'border-brand-500 ring-2 ring-brand-500/30' : ''}`}>
        <div className="flex items-center justify-between gap-2">
          <p className="font-bold">{i.user_name} <span className="text-xs font-normal text-slate-500">#{i.id}</span></p>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${cls}`}>{text}</span>
        </div>
        <p className="text-sm text-slate-500">{i.trigger.replace(/_/g, ' ')} · {new Date(i.started_at).toLocaleString()}</p>
        {(urgent[i.id] || i.flag) && <p className="mt-1 text-xs font-bold text-red-600">URGENT: {urgent[i.id] || 'possible wrong user'}</p>}
      </button>
    )
  }
  const Section = ({ title, color, items, empty }) => (
    <div className="space-y-2">
      <h2 className={`flex items-center gap-2 text-sm font-extrabold uppercase tracking-wide ${color}`}>{title}
        <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-700 dark:bg-slate-700 dark:text-slate-100">{items.length}</span></h2>
      {items.length ? items.map(card) : <p className="rounded-xl border border-dashed border-slate-300 p-3 text-center text-sm text-slate-500 dark:border-slate-700">{empty}</p>}
    </div>
  )

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-7xl space-y-5 px-4 py-6">
        {!soundOn ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-amber-100 p-3 text-sm text-amber-900">
            <span>Turn on the alert siren so you hear urgent emergencies. Browsers need one click first.</span>
            <button className="btn !py-2" onClick={enableSound}>Enable alert sound</button>
          </div>
        ) : (
          <div className="text-right text-sm"><button className="font-semibold text-brand-600" onClick={() => beep.test()}>Test siren</button></div>
        )}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[['Urgent (SOS)', stats.urgent, 'text-red-600'], ['Normal (tracking)', stats.normal, 'text-blue-600'], ['Total incidents', stats.total, ''], ['False alarms', stats.falseAlarms, 'text-amber-600']].map(([l, v, c]) => (
            <div key={l} className="card !p-4"><p className="text-sm text-slate-500">{l}</p>
              {incidents === null ? <div className="mt-1 h-8 w-12 animate-pulse rounded bg-slate-200 dark:bg-slate-800" /> : <p className={`text-3xl font-extrabold ${c}`}>{v}</p>}</div>
          ))}
        </div>

        <div className="grid gap-5 lg:grid-cols-5">
          <section className={`space-y-4 lg:col-span-2 ${selected ? 'hidden lg:block' : ''}`}>
            <div className="grid grid-cols-3 gap-2">
              <input className="input col-span-3 !py-2" placeholder="Search name, phone, trigger" value={q} onChange={e => setQ(e.target.value)} />
              <select className="input col-span-2 !py-2" value={fStatus} onChange={e => setFStatus(e.target.value)}>
                <option value="all">All statuses</option><option value="open">Open only</option>
                {Object.entries(LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <select className="input !py-2" value={sort} onChange={e => setSort(e.target.value)}>
                <option value="new">Newest</option><option value="old">Oldest</option>
              </select>
            </div>

            {incidents === null && !error && [1, 2, 3].map(k => <div key={k} className="h-20 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800" />)}
            {error && <div className="card text-center"><p className="text-red-600">{error}</p><button className="btn mt-3" onClick={load}>Retry</button></div>}
            {incidents && (
              <>
                <Section title="Urgent - SOS active" color="text-red-600" items={urgentList} empty="No urgent SOS right now." />
                <Section title="Normal - location only" color="text-blue-600" items={normalList} empty="No one is being tracked right now." />
                <Section title="Past incidents" color="text-slate-500" items={pastList} empty={incidents.length ? 'Nothing matches your filters.' : 'No alerts yet. They appear here instantly.'} />
              </>
            )}
          </section>

          <section className={`lg:col-span-3 ${selected ? '' : 'hidden lg:block'}`}>
            {selected ? (
              <IncidentPanel key={selected.id} incident={selected} live={live[selected.id]} urgent={urgent[selected.id]}
                socket={socket} stationPos={stationPos} onStatus={setStatus} onClose={() => setSelectedId(null)} />
            ) : (
              <div className="card grid h-64 place-items-center text-center text-slate-500">Select an incident to see the live map, video and evidence.</div>
            )}
          </section>
        </div>
      </main>
    </>
  )
}