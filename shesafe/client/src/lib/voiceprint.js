import { trimSpeech } from './mic'

// Speaker verification in the browser (CPU / WebAssembly). The model downloads once and the browser caches it.
let loading = null
export function preload() {
  if (!loading) loading = (async () => {
    const T = await import('@huggingface/transformers')
    const Model = T.WavLMForXVector || T.AutoModel
    const processor = await T.AutoProcessor.from_pretrained('Xenova/wavlm-base-plus-sv')
    const model = await Model.from_pretrained('Xenova/wavlm-base-plus-sv')
    return { processor, model }
  })().catch(e => { loading = null; throw e })
  return loading
}

// Float32Array (16 kHz) -> unit-length voiceprint. Silence is trimmed first.
export async function embed(samples) {
  const { processor, model } = await preload()
  const { embeddings } = await model(await processor(trimSpeech(samples)))
  const v = Array.from(embeddings.data)
  const n = Math.sqrt(v.reduce((a, x) => a + x * x, 0))
  return v.map(x => x / n)
}
export const similarity = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0)

// Stored only in this browser. The voiceprint is biometric data, so it is never sent to the server.
const VP = 'shesafe_vp', LOCK = 'shesafe_vp_lock', TH = 'shesafe_vp_th'
export const hasVoiceprint = () => !!localStorage.getItem(VP)
export const loadVoiceprint = () => JSON.parse(localStorage.getItem(VP) || 'null')
export const clearVoiceprint = () => { [VP, LOCK, TH].forEach(k => localStorage.removeItem(k)) }
export const voiceLock = () => localStorage.getItem(LOCK) === 'yes'
export const setVoiceLock = on => localStorage.setItem(LOCK, on ? 'yes' : 'no')
export const threshold = () => +(localStorage.getItem(TH) || 0.8)
export const setThreshold = v => localStorage.setItem(TH, String(v))

// Saves the average voiceprint and sets the threshold from how alike your own 3 samples are. Returns the threshold.
export function saveVoiceprint(list) {
  const avg = list[0].map((_, i) => list.reduce((s, e) => s + e[i], 0) / list.length)
  const n = Math.sqrt(avg.reduce((a, x) => a + x * x, 0))
  localStorage.setItem(VP, JSON.stringify(avg.map(x => x / n)))
  let min = 1
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) min = Math.min(min, similarity(list[i], list[j]))
  const th = Math.min(0.85, Math.max(0.6, min - 0.08))
  setThreshold(th)
  return th
}