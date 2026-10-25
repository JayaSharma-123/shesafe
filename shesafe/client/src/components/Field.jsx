// A labelled input with an inline error message; used by Login and Signup.
export default function Field({ label, error, ...props }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">{label}</span>
      <input className={`input ${error ? 'border-red-500' : ''}`} {...props} />
      {error && <span className="mt-1 block text-sm text-red-600">{error}</span>}
    </label>
  )
}