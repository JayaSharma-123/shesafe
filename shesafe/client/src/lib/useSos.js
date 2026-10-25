import { useCallback, useEffect, useRef, useState } from 'react'
import { api, getToken } from '../lib/api'
import { connectSocket } from '../lib/socket'
import { useToast } from '../context/ToastContext'

// STUN lets the phone and the station find each other for direct video (free Google server).
const ICE = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }
const SEGMENT_MS = 5000 // evidence is saved in 5-second pieces

const getPosition = () =>
  new Promise((res, rej) => navigator.geolocation.getCurrentPosition(p => res(p.coords), rej, { enableHighAccuracy: true, timeout: 10000 }))

// All emergency logic lives here: trigger, GPS, camera, recording, live video, exit.
export function useSos() {
  const { toast } = useToast()
  const [incident, setIncident] = useState(null)
  const [station, setStation] = useState(null)
  const [status, setStatus] = useState('idle') // idle | starting | active | received | on_the_way | ended
  const [uploaded, setUploaded] = useState(0)
  const [stream, setStream] = useState(null)
  const r = useRef({}) // things that change without needing a re-render (timers, socket, recorder)

  // Stops everything: GPS, camera, mic, recorder, live video, socket. Evidence stays on the server.
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

  // Record one 5s segment, upload it, then start the next. Each file plays on its own.
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

  // Sends our camera to the station using WebRTC (direct peer-to-peer, no media server).
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

  const start = useCallback(async (trigger = 'button') => {
    if (status !== 'idle') return
    setStatus('starting'); setUploaded(0)
    try {
      const pos = await getPosition()
      const res = await api('/sos/trigger', { method: 'POST', body: { trigger, lat: pos.latitude, lng: pos.longitude } })
      const id = res.incident.id
      setIncident(res.incident); setStation(res.station); setStatus('active')
      const x = r.current

      // Camera + mic (permissions were granted at setup, so there is no prompt now)
      try {
        x.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: true })
        setStream(x.stream)
        x.recording = true
        recordSegment(id)
      } catch { toast.error('Camera or mic blocked - sending location only') }

      // Live GPS: watch continuously, send to the server every 4 seconds
      x.watchId = navigator.geolocation.watchPosition(p => (x.last = p.coords), () => {}, { enableHighAccuracy: true })
      x.last = pos
      x.locTimer = setInterval(() => x.last &&
        api(`/sos/${id}/location`, { method: 'POST', body: { lat: x.last.latitude, lng: x.last.longitude } }).catch(() => {}), 4000)

      // Realtime channel: station updates + live video handshake
      const socket = connectSocket()
      x.socket = socket
      socket.on('connect', () => { // also runs after a reconnect
        socket.emit('join', id)
        socket.emit('rtc', { incidentId: id, data: { type: 'user-ready' } })
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
    } catch (e) {
      cleanup(); setStatus('idle')
      toast.error(e.code === 1 ? 'Location is blocked. Allow location in the browser.' : e.message || 'Could not start SOS')
    }
  }, [status, cleanup, toast])

  // Exit needs the PIN. A wrong PIN throws (error.data.attempts holds the count).
  const exit = async (pin, outcome) => {
    const res = await api(`/sos/${incident.id}/exit`, { method: 'POST', body: { pin, outcome } })
    cleanup(); setStatus('ended')
    return res
  }
  const reset = () => { setIncident(null); setStation(null); setStatus('idle') }

  // One-time setup: ask the browser for camera, mic and location so SOS never has to prompt.
  const grantPermissions = async () => {
    const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    s.getTracks().forEach(t => t.stop())
    await getPosition()
  }

  return { status, incident, station, stream, uploaded, start, exit, reset, grantPermissions }
}