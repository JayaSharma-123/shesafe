import { useEffect, useRef, useState } from 'react'
import Navbar from '../components/Navbar'
import SosButton from '../components/SosButton'
import ExitModal from '../components/ExitModal'
import JourneyCard from '../components/JourneyCard'
import CheckInModal from '../components/CheckInModal'
import SafePinModal from '../components/SafePinModal'
import WatchPrompt from '../components/WatchPrompt'
import EndTripModal from '../components/EndTripModal'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useSos } from '../hooks/useSos'
import { useJourney } from '../hooks/useJourney'
import { useKeyword, hasKeyword, kwEnabled } from '../hooks/useKeyword'
import { sharedMic, peakRms } from '../lib/mic'
import { embed, similarity, hasVoiceprint, loadVoiceprint, voiceLock, threshold, preload } from '../lib/voiceprint'
import { api } from '../lib/api'

export default function UserHome() {
  const { user } = useAuth()
  const { toast } = useToast()
  const sos = useSos()

  const [consent, setConsent] = useState(() => localStorage.getItem('shesafe_consent') === 'yes')
  const [agree, setAgree] = useState(false)
  const [showExit, setShowExit] = useState(false)       // "Exit with PIN" during an emergency
  const [showSafePin, setShowSafePin] = useState(false) // PIN prompt after pressing "Yes"
  const [showEnd, setShowEnd] = useState(false)         // "End trip" PIN box
  const [kwWarn, setKwWarn] = useState(false)           // 5-second warning after the keyword is heard
  const [kwChecking, setKwChecking] = useState(false)   // voice check in progress
  const [outcome, setOutcome] = useState('')
  const [history, setHistory] = useState(null)          // null = loading skeleton
  const videoRef = useRef()
  const mic = useRef(null)                              // shared microphone buffer for the voice check
  const checkingRef = useRef(false)                     // blocks a second check while one is running

  // ---------- Starting an emergency ----------
  // Any "No / unsafe" answer = Normal mode (location only).
  // Silence, wrong PINs, the SOS button, a missed check-in or the keyword = Urgent (full SOS).
  const goNormal = trigger => { setShowSafePin(false); sos.start(trigger, 'watch') }
  const goUrgent = trigger => { setShowSafePin(false); sos.start(trigger, 'urgent') }

  // ---------- PIN helper ----------
  const checkPin = async pin => {
    try { await api('/auth/verify-pin', { method: 'POST', body: { pin } }); return true } catch { return false }
  }

  // ---------- Safety Journey ----------
  const journey = useJourney({ onSos: t => goUrgent(t), paused: sos.status !== 'idle' })
  const startJourney = async s => { await journey.start(s); toast.success('Safety Journey started') }
  // "Yes + PIN" at a check-in means safe right now. The trip keeps running.
  const answerYes = async pin => {
    const ok = await checkPin(pin)
    if (ok) { journey.yes(); toast.success('Confirmed safe. Your trip continues, next check-in is on its way.') }
    return ok
  }
  // Ending the trip is a separate PIN box
  const endTrip = async pin => {
    const ok = await checkPin(pin)
    if (ok) { journey.stop(); setShowEnd(false); toast.info('Safety Journey ended') }
    return ok
  }

  // ---------- "Are you safe?" Yes button ----------
  const confirmSafe = async pin => {
    const ok = await checkPin(pin)
    if (ok) { setShowSafePin(false); toast.success("Glad you're safe. Stay protected.") }
    return ok
  }

  // ---------- Tracking mode: "I'm safe" + PIN stops location sharing ----------
  const watchSafe = async pin => {
    try { const r = await sos.exit(pin, 'safe'); setOutcome(r.outcome); toast.success("Glad you're safe. Location sharing stopped."); return true }
    catch { return false }
  }

  // ---------- Voice keyword and voice recognition ----------
  const useVoice = consent && hasKeyword() && kwEnabled() && hasVoiceprint() && voiceLock()

  // Load the voice model and open the shared microphone in the background, so the check is quick later
  useEffect(() => {
    if (!useVoice) return
    preload().catch(() => {})
    sharedMic().then(r => { mic.current = r }).catch(() => { mic.current = null })
  }, [useVoice])

  // Runs when the keyword is heard. force = true skips the voice check (not used by default).
  const onKeyword = async (force = false) => {
    if (checkingRef.current) return
    const strict = !force && hasVoiceprint() && voiceLock() // read the switches NOW, not at render time
    if (strict) {
      checkingRef.current = true; setKwChecking(true)
      toast.info('Keyword heard. Checking your voice...')
      try {
        const rec = mic.current || await Promise.race([sharedMic(), new Promise((_, rej) => setTimeout(() => rej(new Error('microphone not ready')), 2000))])
        mic.current = rec
        await new Promise(r => setTimeout(r, 1200)) // let the person finish the phrase before comparing
        const audio = rec.snapshot(4)
        if (peakRms(audio) < 0.005) throw new Error('no audio was captured')
        const sim = similarity(await embed(audio), loadVoiceprint())
        const pct = `${Math.round(sim * 100)}%, needs ${Math.round(threshold() * 100)}%`
        if (sim < threshold()) { toast.info(`Not recognised as your voice (${pct}). Ignored.`); return }
        toast.info(`Voice confirmed (${pct})`)
      } catch (e) {
        // Strict mode: if the voice cannot be checked, do not start anything silently
        toast.error(`Voice check could not run (${e.message}). Keyword ignored. Use the SOS button if you need help.`)
        return
      } finally { checkingRef.current = false; setKwChecking(false) }
    } else {
      toast.info('Keyword heard')
    }
    setKwWarn(true); navigator.vibrate?.([400, 200, 400]) // opens the 5-second warning box
  }

  // Listening starts once and keeps running. Pop-ups only pause it, they never restart it.
  useKeyword({
    enabled: consent && sos.status === 'idle' && hasKeyword(),
    paused: kwWarn || kwChecking || showSafePin || showEnd || showExit || journey.due,
    onHeard: () => onKeyword(),
  })

  // ---------- Camera preview and history ----------
  useEffect(() => { if (videoRef.current) videoRef.current.srcObject = sos.stream }, [sos.stream, sos.status, sos.level])
  const loadHistory = () => api('/incidents').then(setHistory).catch(() => setHistory([]))
  useEffect(() => { loadHistory() }, [])
  useEffect(() => { if (sos.status === 'ended') loadHistory() }, [sos.status])

  // ---------- Consent ----------
  const enable = async () => {
    try {
      await sos.grantPermissions()
      if ('Notification' in window && Notification.permission === 'default') await Notification.requestPermission()
      localStorage.setItem('shesafe_consent', 'yes'); setConsent(true); toast.success('Protection enabled')
    } catch { toast.error('Please allow camera, microphone and location in the browser prompt') }
  }

  // ---------- Exit an emergency with the PIN ----------
  const submitExit = async (pin, out) => {
    try { const r = await sos.exit(pin, out); setOutcome(r.outcome); setShowExit(false); toast.success('Emergency ended. Evidence is saved.') }
    catch (e) {
      const n = e.data?.attempts
      toast.error(e.status === 401 ? `Wrong PIN (${n}/3)${n >= 3 ? ' - station has been warned' : ''}` : e.message)
    }
  }
  const verify = async id => {
    const r = await api('/evidence/verify/' + id)
    r.intact ? toast.success('Evidence chain is intact') : toast.error('Evidence has been tampered with!')
  }

  const live = ['active', 'received', 'on_the_way'].includes(sos.status)
  const urgent = sos.level === 'urgent'
  const statusText = sos.status === 'received' ? 'Police have received your alert'
    : sos.status === 'on_the_way' ? 'Help is on the way'
    : urgent ? 'Alert sent. Waiting for the station...' : 'Your location is shared with the police station'

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-3xl space-y-6 px-4 py-6">
        {/* 1. First-time consent */}
        {!consent && (
          <div className="card space-y-3">
            <h1 className="text-xl font-bold">Turn on protection</h1>
            <p className="text-sm text-slate-500">If you tap No or SOS, this app shares your location with your nearest police station. In an SOS it also uses your camera and microphone, records automatically, and streams live video.</p>
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={agree} onChange={e => setAgree(e.target.checked)} /> I understand and consent to location sharing, and to automatic recording during an SOS.</label>
            <button className="btn" disabled={!agree} onClick={enable}>Enable protection</button>
          </div>
        )}

        {/* 2. Idle: SOS button, check-in, journey */}
        {consent && (sos.status === 'idle' || sos.status === 'starting') && (
          <div className="card space-y-6 text-center">
            <div>
              <h1 className="text-2xl font-bold">Hello, {user.name.split(' ')[0]}</h1>
              <p className="text-sm text-slate-500">Trusted contacts: {user.contacts.length}</p>
              {hasKeyword() && kwEnabled() && (
                <p className="text-xs text-slate-500">{kwChecking ? 'Checking your voice...' : 'Voice protection is on'}</p>
              )}
            </div>
            <SosButton busy={sos.status === 'starting'} onClick={() => goUrgent('button')} />
            <div className="rounded-xl bg-slate-100 p-4 dark:bg-slate-800">
              <p className="mb-3 font-semibold">Are you safe?</p>
              <div className="grid grid-cols-2 gap-3">
                <button className="btn !bg-emerald-600 hover:!bg-emerald-700" onClick={() => setShowSafePin(true)}>Yes</button>
                <button className="btn" onClick={() => goNormal('check_in_no')}>No</button>
              </div>
            </div>
            <JourneyCard journey={journey} onStart={startJourney} onStop={() => setShowEnd(true)} />
          </div>
        )}

        {/* 3. Running: Normal (location only) or Urgent (full SOS) */}
        {live && (
          <div className={`card space-y-4 text-center ${urgent ? 'border-brand-500' : 'border-blue-500'}`}>
            <div className={`flex items-center justify-center gap-2 font-semibold ${urgent ? 'text-brand-600' : 'text-blue-600'}`}>
              <span className={`h-3 w-3 animate-pulse rounded-full ${urgent ? 'bg-brand-600' : 'bg-blue-600'}`} />
              {urgent ? 'Safety mode - SOS active' : 'Tracking mode - sharing location'}
            </div>
            <p className="text-lg font-bold">{statusText}</p>
            {sos.station && <p className="text-sm text-slate-500">Nearest station: {sos.station.name} ({sos.station.distanceKm} km)</p>}
            {urgent ? (
              <>
                <video ref={videoRef} autoPlay muted playsInline className="mx-auto h-40 rounded-xl bg-black object-cover" />
                <p className="text-sm text-slate-500">Recording: {sos.uploaded} evidence clips saved to the vault</p>
              </>
            ) : (
              <p className="text-sm text-slate-500">Camera and recording start only if you say you're unsafe or don't reply.</p>
            )}
            <button className="btn w-full !bg-slate-700 hover:!bg-slate-800" onClick={() => setShowExit(true)}>Exit with PIN</button>
          </div>
        )}

        {/* 4. Finished */}
        {sos.status === 'ended' && (
          <div className="card space-y-3 text-center">
            <h2 className="text-xl font-bold">{outcome === 'false_alarm' ? 'Marked as false alarm' : 'Marked as safe'}</h2>
            <p className="text-sm text-slate-500">{sos.uploaded > 0 ? `${sos.uploaded} evidence clips were saved. Exiting never deletes evidence.` : 'Location sharing has stopped.'}</p>
            <button className="btn" onClick={() => { sos.reset(); setOutcome('') }}>Back to home</button>
          </div>
        )}

        {/* 5. History */}
        <section className="card">
          <h2 className="mb-3 text-lg font-bold">My incidents</h2>
          {history === null && <div className="space-y-2">{[1, 2].map(i => <div key={i} className="h-12 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />)}</div>}
          {history?.length === 0 && <p className="py-6 text-center text-sm text-slate-500">No incidents yet. That's a good thing.</p>}
          {history?.map(h => (
            <div key={h.id} className="flex items-center justify-between border-t border-slate-200 py-3 text-sm first:border-0 dark:border-slate-800">
              <div>
                <p className="font-semibold">#{h.id} · {h.level === 'watch' ? 'tracking' : 'SOS'} · {h.trigger.replace(/_/g, ' ')} · {h.status.replace(/_/g, ' ')}</p>
                <p className="text-slate-500">{new Date(h.started_at).toLocaleString()}</p>
              </div>
              {h.level !== 'watch' && <button onClick={() => verify(h.id)} className="font-semibold text-brand-600">Verify evidence</button>}
            </div>
          ))}
        </section>
      </main>

      {/* ---------- Pop-ups ---------- */}
      {showExit && <ExitModal onSubmit={submitExit} onClose={() => setShowExit(false)} />}

      {/* Yes button: PIN within 15 s, otherwise SOS */}
      {showSafePin && sos.status === 'idle' && (
        <SafePinModal onVerify={confirmSafe} onTimeout={() => goUrgent('safe_pin_timeout')}
          onWrong3={() => goUrgent('wrong_pin')} onNo={() => goNormal('check_in_no')} />
      )}

      {/* Voice keyword warning: PIN within 5 s cancels, otherwise SOS */}
      {kwWarn && sos.status === 'idle' && (
        <SafePinModal seconds={5} title="Keyword heard" noLabel="Start SOS now"
          message="An SOS starts in a few seconds. Enter your PIN to cancel."
          onVerify={async pin => { const ok = await checkPin(pin); if (ok) { setKwWarn(false); toast.success('SOS cancelled') } return ok }}
          onTimeout={() => { setKwWarn(false); toast.error('No PIN entered - starting SOS'); goUrgent('voice_keyword') }}
          onWrong3={() => { setKwWarn(false); goUrgent('voice_keyword') }}
          onNo={() => { setKwWarn(false); goUrgent('voice_keyword') }} />
      )}

      {/* End trip: its own PIN box */}
      {showEnd && journey.active && sos.status === 'idle' && (
        <EndTripModal onVerify={endTrip} onClose={() => setShowEnd(false)}
          onWrong3={() => { setShowEnd(false); journey.stop(); goUrgent('wrong_pin') }} />
      )}

      {/* Safety Journey check-in (30 s to reply). No -> Normal mode, 3 wrong PINs or silence -> SOS */}
      {journey.due && (
        <CheckInModal deadline={journey.deadline} onYes={answerYes}
          onNo={() => { journey.stop(); goNormal('check_in_no') }}
          onWrong3={() => { journey.stop(); goUrgent('wrong_pin') }} />
      )}

      {/* Tracking mode: "safe or unsafe?" with a 30 s countdown */}
      {live && sos.level === 'watch' && !showExit && <WatchPrompt onSafe={watchSafe} onUnsafe={sos.upgrade} />}
    </>
  )
}