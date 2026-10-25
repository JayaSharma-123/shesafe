import { useEffect, useRef, useState } from 'react'

const ICE = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }

// Receives the person's live camera over WebRTC.
// Handshake: station says "ready" -> phone sends an offer -> station answers -> both swap ICE candidates.
export default function LiveVideo({ socket, incidentId }) {
  const video = useRef()
  const [state, setState] = useState('waiting') // waiting | live | lost

  useEffect(() => {
    if (!socket) return
    let pc = null
    const pending = [] // ICE candidates that arrive before the offer is applied
    const ask = () => socket.emit('rtc', { incidentId, data: { type: 'ready' } })

    const onRtc = async ({ data }) => {
      try {
        if (data.type === 'user-ready') ask()
        else if (data.type === 'offer') {
          pc?.close(); pending.length = 0
          pc = new RTCPeerConnection(ICE)
          pc.ontrack = e => { video.current.srcObject = e.streams[0]; setState('live') }
          pc.onicecandidate = e => e.candidate && socket.emit('rtc', { incidentId, data: { type: 'ice', candidate: e.candidate } })
          pc.onconnectionstatechange = () => ['failed', 'disconnected', 'closed'].includes(pc.connectionState) && setState('lost')
          await pc.setRemoteDescription(data.sdp)
          for (const c of pending.splice(0)) await pc.addIceCandidate(c)
          await pc.setLocalDescription(await pc.createAnswer())
          socket.emit('rtc', { incidentId, data: { type: 'answer', sdp: pc.localDescription } })
        } else if (data.type === 'ice') {
          if (pc?.remoteDescription) await pc.addIceCandidate(data.candidate)
          else pending.push(data.candidate)
        }
      } catch (e) { console.warn('rtc', e) }
    }

    socket.on('rtc', onRtc)
    socket.on('connect', ask)
    ask()
    return () => { socket.off('rtc', onRtc); socket.off('connect', ask); pc?.close() }
  }, [socket, incidentId])

  return (
    <div className="relative overflow-hidden rounded-xl bg-black">
      <video ref={video} autoPlay playsInline controls className="h-64 w-full object-cover sm:h-80" />
      {state !== 'live' && (
        <div className="absolute inset-0 grid place-items-center bg-black/70 p-4 text-center text-sm text-white">
          {state === 'lost' ? 'Live stream stopped. Check the saved clips below.' : 'Waiting for live video...'}
        </div>
      )}
      {state === 'live' && <span className="absolute left-3 top-3 rounded bg-red-600 px-2 py-0.5 text-xs font-bold text-white">LIVE</span>}
    </div>
  )
}