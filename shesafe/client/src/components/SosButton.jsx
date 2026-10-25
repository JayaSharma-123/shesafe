// Big pulsing emergency button.
export default function SosButton({ onClick, busy }) {
  return (
    <div className="relative mx-auto grid h-56 w-56 place-items-center">
      <span className="absolute inset-0 animate-ping rounded-full bg-brand-500/30" />
      <button onClick={onClick} disabled={busy} aria-label="Send SOS"
        className="relative h-48 w-48 rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-4xl font-extrabold tracking-widest text-white shadow-2xl transition active:scale-95 disabled:opacity-70">
        {busy ? '...' : 'SOS'}
      </button>
    </div>
  )
}