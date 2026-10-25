import { useEffect, useState } from 'react'
import Field from './Field'
import { useToast } from '../context/ToastContext'
import { useKeyword, voiceSupported, hasKeyword, saveKeyword, clearKeyword, validateKeyword, kwEnabled, setKwEnabled, stopKeyword, subscribeKeyword } from '../hooks/useKeyword'
import { createRecorder, peakRms, stopSharedMic } from '../lib/mic'
import { preload, embed, similarity, hasVoiceprint, loadVoiceprint, saveVoiceprint, clearVoiceprint, voiceLock, setVoiceLock, threshold, setThreshold } from '../lib/voiceprint'

// Records ~3 seconds from the microphone, reporting live loudness so the user can see the mic working.
async function sample(onLevel) {
  const r = createRecorder(4)
  await r.start()
  const timer = setInterval(() => onLevel?.(r.level()), 100)
  await new Promise(res => setTimeout(res, 3500))
  clearInterval(timer)
  const s = r.snapshot(3); r.stop(); onLevel?.(0)
  const p = peakRms(s)
  if (p < 0.008) throw new Error(`The microphone heard almost nothing (level ${(p * 1000).toFixed(1)}). Check the input device in your system sound settings and speak closer.`)
  return s
}

export default function VoiceKeywordCard() {
  const { toast } = useToast()
  const [word, setWord] = useState('')
  const [lang, setLang] = useState(localStorage.getItem('shesafe_kw_lang') || 'en-IN')
  const [isSet, setIsSet] = useState(hasKeyword())
  const [on, setOn] = useState(kwEnabled())
  const [error, setError] = useState('')
  const [testing, setTesting] = useState(false)
  const [hasVp, setHasVp] = useState(hasVoiceprint())
  const [lock, setLock] = useState(voiceLock())
  const [th, setTh] = useState(Math.round(threshold() * 100))
  const [msg, setMsg] = useState('')
  const [level, setLevel] = useState(0)
  const [busy, setBusy] = useState(false)
  const [heard, setHeard] = useState('')
  useEffect(() => subscribeKeyword(d => setHeard(d.error ? `Problem: ${d.error}` : d.text ? `Heard: "${d.text}"` : d.listening ? 'Microphone is listening...' : '')), [])
  useKeyword({ enabled: testing, onHeard: () => { setTesting(false); toast.success('Keyword heard. It will work!') } })
  useEffect(() => {
    if (!testing) return
    const t = setTimeout(() => { setTesting(false); toast.error('Keyword not heard. Try again, or pick a more distinct word.') }, 15000)
    return () => clearTimeout(t)
  }, [testing])

  const save = async e => {
    e.preventDefault()
    const err = validateKeyword(word)
    setError(err)
    if (err) return
    await saveKeyword(word, lang)
    setWord(''); setIsSet(true); toast.success('Keyword saved')
  }

  const enroll = async () => {
    setBusy(true); stopKeyword(); stopSharedMic() // free the microphone during setup
    try {
      setMsg('Loading the voice model (first time only, about 100 MB)...')
      await preload()
      const list = []
      for (let i = 1; i <= 3; i++) {
        setMsg(`Sample ${i} of 3: say your keyword phrase clearly, at your normal distance. Watch the bar.`)
        list.push(await embed(await sample(setLevel)))
      }
      const t = saveVoiceprint(list); setHasVp(true); setTh(Math.round(t * 100))
      toast.success(`Voice saved. Match threshold set to ${Math.round(t * 100)}%`)
    } catch (e) { toast.error(e.message || 'Could not set up your voice') }
    finally { setBusy(false); setMsg(''); setLevel(0) }
  }
  const testVoice = async () => {
    setBusy(true); stopKeyword(); stopSharedMic()
    try {
      setMsg('Say your keyword phrase now...')
      const sim = similarity(await embed(await sample(setLevel)), loadVoiceprint())
      const ok = sim >= threshold()
      ;(ok ? toast.success : toast.error)(`Match ${Math.round(sim * 100)}% (needs ${Math.round(threshold() * 100)}%) - ${ok ? 'recognised as you' : 'not recognised'}`)
    } catch (e) { toast.error(e.message || 'Test failed') }
    finally { setBusy(false); setMsg(''); setLevel(0) }
  }

  return (
    <section className="card space-y-3">
      <h2 className="font-bold">Emergency voice keyword</h2>
      {!voiceSupported ? <p className="text-sm text-slate-500">Voice keyword needs Chrome or Edge.</p> : (
        <>
          <p className="text-sm text-slate-500">While you are logged in, the keyword is listened for and acted on when you are on the Home page. Saying it starts a 5-second warning, then an SOS unless you enter your PIN. Chrome sends speech to Google for recognition while listening. Chrome also plays a short sound when listening starts, which a page cannot mute. The Android app uses on-device detection instead.</p>
          <label className="flex items-center justify-between rounded-xl bg-slate-100 p-3 text-sm font-semibold dark:bg-slate-800">
            Listen for the keyword
            <input type="checkbox" checked={on} onChange={e => { setOn(e.target.checked); setKwEnabled(e.target.checked) }} />
          </label>
          <p className="text-sm font-semibold">{isSet ? 'A keyword is set (stored only as a hash).' : 'No keyword set.'}</p>
          <form onSubmit={save} className="space-y-3">
            <Field label="Secret word or short phrase" value={word} error={error} onChange={e => setWord(e.target.value)} />
            <select className="input" value={lang} onChange={e => setLang(e.target.value)}>
              <option value="en-IN">English (India)</option><option value="hi-IN">Hindi</option>
            </select>
            <button className="btn w-full">{isSet ? 'Replace keyword' : 'Save keyword'}</button>
          </form>
          {isSet && (
            <div className="grid grid-cols-2 gap-2">
              <button className="btn !bg-blue-600 hover:!bg-blue-700" disabled={testing} onClick={() => setTesting(true)}>{testing ? 'Listening... say it now' : 'Test keyword'}</button>
              <button className="btn !bg-slate-700 hover:!bg-slate-800" onClick={() => { clearKeyword(); setIsSet(false); toast.info('Keyword removed') }}>Remove</button>
            </div>
          )}
                    {heard && <p className="rounded-xl bg-slate-100 p-3 text-sm dark:bg-slate-800">{heard}</p>}

          <hr className="border-slate-200 dark:border-slate-800" />
          <h3 className="font-bold">Voice recognition (recognise my voice)</h3>
          <p className="text-sm text-slate-500">The app learns your voice from 3 short samples and can ignore the keyword when someone else says it. Your voiceprint stays on this device and is never uploaded. It is a false-alarm filter, not a security lock. If anything fails, the warning still appears. Record the samples saying your keyword phrase, at the distance and in the place you will normally use it.</p>
          {msg && (
            <div className="space-y-2 rounded-xl bg-blue-50 p-3 text-sm font-semibold text-blue-900 dark:bg-blue-950 dark:text-blue-100">
              <p>{msg}</p>
              <div className="h-3 overflow-hidden rounded bg-blue-200 dark:bg-blue-900"><div className="h-3 rounded bg-blue-600 transition-all" style={{ width: `${Math.min(100, level * 600)}%` }} /></div>
            </div>
          )}
          <button className="btn w-full" disabled={busy} onClick={enroll}>{hasVp ? 'Re-record my voice' : 'Set up my voice (3 samples)'}</button>
          {hasVp && (
            <>
              <label className="block rounded-xl bg-slate-100 p-3 text-sm font-semibold dark:bg-slate-800">
                Match needed: {th}% (lower = accepts more, higher = stricter)
                <input type="range" min="50" max="95" value={th} className="mt-2 w-full"
                  onChange={e => { setTh(+e.target.value); setThreshold(+e.target.value / 100) }} />
              </label>
              <label className="flex items-center justify-between rounded-xl bg-slate-100 p-3 text-sm font-semibold dark:bg-slate-800">
                Only react to my voice
                <input type="checkbox" checked={lock} onChange={e => { setLock(e.target.checked); setVoiceLock(e.target.checked); if (!e.target.checked) stopSharedMic() }} />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button className="btn !bg-blue-600 hover:!bg-blue-700" disabled={busy} onClick={testVoice}>Test my voice</button>
                <button className="btn !bg-slate-700 hover:!bg-slate-800" disabled={busy} onClick={() => { clearVoiceprint(); stopSharedMic(); setHasVp(false); setLock(false); toast.info('Voiceprint deleted') }}>Delete voiceprint</button>
              </div>
            </>
          )}
        </>
      )}
    </section>
  )
}