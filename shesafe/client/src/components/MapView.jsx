import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Leaflet + OpenStreetMap (free, no API key). Red dot = person, blue square = station, line = trail.
const dot = cls => L.divIcon({ className: '', html: `<span class="${cls}"></span>`, iconSize: [22, 22], iconAnchor: [11, 11] })

export default function MapView({ user, station, trail }) {
  const el = useRef(), map = useRef(), mk = useRef({}), line = useRef()

  useEffect(() => {
    const m = L.map(el.current).setView([user.lat, user.lng], 16)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(m)
    map.current = m
    setTimeout(() => m.invalidateSize(), 200)
    return () => { m.remove(); map.current = null; mk.current = {}; line.current = null }
  }, [])

  useEffect(() => {
    const m = map.current
    if (!m) return
    if (!mk.current.user) mk.current.user = L.marker([user.lat, user.lng], { icon: dot('sos-dot') }).addTo(m).bindTooltip('Person in danger')
    else mk.current.user.setLatLng([user.lat, user.lng])
    if (station && !mk.current.station) mk.current.station = L.marker([station.lat, station.lng], { icon: dot('st-dot') }).addTo(m).bindTooltip(station.name)
    if (!line.current) line.current = L.polyline(trail, { color: '#e11d48', weight: 4 }).addTo(m)
    else line.current.setLatLngs(trail)
    m.panTo([user.lat, user.lng])
  }, [user.lat, user.lng, trail.length, station])

  return <div ref={el} className="h-64 w-full overflow-hidden rounded-xl sm:h-80" />
}