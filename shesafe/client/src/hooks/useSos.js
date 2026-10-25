import { useCallback, useEffect, useRef, useState } from 'react'
import { api, getToken } from '../lib/api'
import { connectSocket } from '../lib/socket'
import { useToast } from '../context/ToastContext'

const ICE = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }
const SEGMENT_MS = 5000 // evidence is saved in 5-second pieces

const getPosition = () =>
  new Promise((res, rej) => navigator.geolocation.getCurrentPosition(p => res(p.coords), rej, { enableHighAccuracy: true, timeout: 10000 }))

// Emergency logic. level 'watch' = GPS only. level 'urgent' = GPS + camera + mic + recording + live video.
export function useSos() {
  const { toast } = useToast()
  const [incident, setIncident] = useState(null)
  const [station, setStation] = useState(null)
  const [status, setStatus] = useState('idle') // idle | starting | active | received | on_the_way | ended
  const [level, setLevel] = useState(null)     // null | 'watch' | 'urgent'
  const [uploaded, setUploaded] = useState(0)
  const [stream, setStream] = useState(null)
  const r = useRef({})

  const cleanup = useCallback(() => {
    const x = r.current
    clearInterval(x.locTimer)
    if (x.watchId != null) navigator.geolocation.clearWatch(x.watchId)
    x.recording = false
    try { if (x.recorder?.state === 'recording') x.recorder.stop() } catch {}
    x.stream?.getTracks().forEach(t => t.stop())
    x.pc?.close()
    x.socket?.disconnect()
    r.current = {}
    setStream(null)
  }, [])
  useEffect(() => () => cleanup(), [cleanup])

  const upload = async (id, blob) => {
    if (!blob.size) return
    try {
      await fetch(`/api/evidence/${id}`, { method: 'POST', headers: { Authorization: 'Bearer ' + getToken(), 'Content-Type': 'video/webm' }, body: blob })
      setUploaded(n => n + 1)
    } catch { /* network drop: this piece is skipped, the next one still uploads */ }
  }

  const recordSegment = id => {
    const x = r.current
    if (!x.recording || !x.stream) return
    const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus') ? 'video/webm;codecs=vp8,opus' : 'video/webm'
    const rec = new MediaRecorder(x.stream, { mimeType: mime, videoBitsPerSecond: 600000 })
    const parts = []
    x.recorder = rec
    rec.ondataavailable = e => e.data.size && parts.push(e.data)
    rec.onstop = () => { upload(id, new Blob(parts, { type: 'video/webm' })); recordSegment(id) }
    rec.start()
    setTimeout(() => rec.state === 'recording' && rec.stop(), SEGMENT_MS)
  }

  const makeOffer = async (socket, id) => {
    const x = r.current
    if (!x.stream) return
    x.pc?.close()
    const pc = new RTCPeerConnection(ICE)
    x.pc = pc
    x.stream.getTracks().forEach(t => pc.addTrack(t, x.stream))
    pc.onicecandidate = e => e.candidate && socket.emit('rtc', { incidentId: id, data: { type: 'ice', candidate: e.candidate } })
    await pc.setLocalDescription(await pc.createOffer())
    socket.emit('rtc', { incidentId: id, data: { type: 'offer', sdp: pc.localDescription } })
  }

  // Camera + mic + recording + live video. Runs at once for an urgent SOS, or later on upgrade().
  const beginMedia = async () => {
    const x = r.current
    if (!x.id || x.stream) return
    try {
      x.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: true })
      setStream(x.stream)
      x.recording = true
      recordSegment(x.id)
      if (x.socket?.connected) x.socket.emit('rtc', { incidentId: x.id, data: { type: 'user-ready' } }) // station asks for video
    } catch { toast.error('Camera or mic blocked - sending location only') }
  }

  const start = useCallback(async (trigger = 'button', lvl = 'urgent') => {
    if (status !== 'idle') return
    setStatus('starting'); setUploaded(0)
    try {
      const pos = await getPosition()
      const res = await api('/sos/trigger', { method: 'POST', body: { trigger, level: lvl, lat: pos.latitude, lng: pos.longitude } })
      const id = res.incident.id
      setIncident(res.incident); setStation(res.station); setLevel(lvl); setStatus('active')
      const x = r.current
      x.id = id

      // Live GPS: watch continuously, send to the server every 4 seconds (both levels)
      x.watchId = navigator.geolocation.watchPosition(p => (x.last = p.coords), () => {}, { enableHighAccuracy: true })
      x.last = pos
      x.locTimer = setInterval(() => x.last &&
        api(`/sos/${id}/location`, { method: 'POST', body: { lat: x.last.latitude, lng: x.last.longitude } }).catch(() => {}), 4000)

      // Realtime channel: station updates + live video handshake
      const socket = connectSocket()
      x.socket = socket
      socket.on('connect', () => {
        socket.emit('join', id)
        if (r.current.stream) socket.emit('rtc', { incidentId: id, data: { type: 'user-ready' } })
      })
      socket.on('sos:status', ({ status: s }) => {
        if (s === 'received') { setStatus('received'); toast.success('Police have received your alert') }
        if (s === 'on_the_way') { setStatus('on_the_way'); toast.success('Help is on the way') }
        if (s === 'resolved') { cleanup(); setStatus('ended'); toast.info('The station closed this case') }
      })
      socket.on('sos:escalated', ({ station: n }) => toast.info(`No answer yet - alerting ${n}`))
      socket.on('rtc', async ({ data }) => {
        try {
          if (data.type === 'ready') await makeOffer(socket, id)
          else if (data.type === 'answer') await r.current.pc?.setRemoteDescription(data.sdp)
          else if (data.type === 'ice') await r.current.pc?.addIceCandidate(data.candidate)
        } catch (e) { console.warn('rtc', e) }
      })

      if (lvl === 'urgent') await beginMedia()
    } catch (e) {
      cleanup(); setStatus('idle'); setLevel(null)
      toast.error(e.code === 1 ? 'Location is blocked. Allow location in the browser.' : e.message || 'Could not start SOS')
    }
  }, [status, cleanup, toast])

  // Location-only -> full SOS: tell the server, then start camera, recording and live video.
  const upgrade = async () => {
    const x = r.current
    if (!x.id || x.upgraded) return
    x.upgraded = true
    try {
      await api(`/sos/${x.id}/upgrade`, { method: 'POST' })
      setLevel('urgent')
      toast.error('SOS started - police are being alerted')
      await beginMedia()
    } catch (e) { x.upgraded = false; toast.error(e.message) }
  }

  const exit = async (pin, outcome) => {
    const res = await api(`/sos/${incident.id}/exit`, { method: 'POST', body: { pin, outcome } })
    cleanup(); setStatus('ended')
    return res
  }
  const reset = () => { setIncident(null); setStation(null); setStatus('idle'); setLevel(null) }

  const grantPermissions = async () => {
    const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    s.getTracks().forEach(t => t.stop())
    await getPosition()
  }

  return { status, level, incident, station, stream, uploaded, start, upgrade, exit, reset, grantPermissions }
}