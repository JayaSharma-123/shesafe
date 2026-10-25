import { useEffect, useRef, useState } from 'react'

const KEY = 'shesafe_journey'
const REPLY_MS = 30000 // no reply in 10 seconds starts SOS (from the PRD)

const beep = () => { // short sound so the check-in is noticed
  try {
    const c = new (window.AudioContext || window.webkitAudioContext)(), o = c.createOscillator()
    o.frequency.value = 880; o.connect(c.destination); o.start(); setTimeout(() => { o.stop(); c.close() }, 600)
  } catch {}
}

// Runs the trip timer. Uses clock time (not a long timeout) so it stays accurate even if the tab sleeps.
export function useJourney({ onSos, paused }) {
  const [journey, setJourney] = useState(() => JSON.parse(localStorage.getItem(KEY) || 'null')) // { intervalSec, nextAt }
  const [due, setDue] = useState(false)
  const [deadline, setDeadline] = useState(0)
  const sosRef = useRef(onSos)
  sosRef.current = onSos // always the latest function

  const save = j => { setJourney(j); j ? localStorage.setItem(KEY, JSON.stringify(j)) : localStorage.removeItem(KEY) }

  const start = async intervalSec => {
    if ('Notification' in window && Notification.permission === 'default') await Notification.requestPermission()
    save({ intervalSec, nextAt: Date.now() + intervalSec * 1000 })
  }
  const stop = () => { setDue(false); save(null) }
    // "Yes + PIN" = safe at this moment only. The trip keeps going and the next check-in restarts.
  const yes = () => { setDue(false); save({ ...journey, nextAt: Date.now() + journey.intervalSec * 1000, lastSafeAt: Date.now() }) }

  useEffect(() => {
    if (!journey || paused) return
    const t = setInterval(() => {
      const now = Date.now()
      if (!due && now >= journey.nextAt) {            // time for a check-in
        setDue(true); setDeadline(now + REPLY_MS)
        beep(); navigator.vibrate?.([300, 150, 300])
        if ('Notification' in window && Notification.permission === 'granted') {
          const n = new Notification('SheSafe check-in', { body: 'Are you safe? Reply within 30 seconds.', tag: 'shesafe-checkin', requireInteraction: true })
          n.onclick = () => { window.focus(); n.close() }
        }
      } else if (due && now >= deadline) {            // no reply: emergency
        stop(); sosRef.current('missed_check_in')
      }
    }, 1000)
    return () => clearInterval(t)
  }, [journey, due, deadline, paused])

  return { active: !!journey, journey, due, deadline, start, stop, yes }
}