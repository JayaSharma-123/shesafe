import { NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import NotificationCenter from './NotificationCenter'
import LogoutButton from './LogoutButton'

const LINKS = {
  user: [['/app', 'Home'], ['/contacts', 'Contacts'], ['/profile', 'Profile']],
  station: [['/station', 'Dashboard'], ['/profile', 'Profile']],
}

// Top bar: brand, alerts bell, theme switch, logout, plus page links for the logged-in role.
export default function Navbar() {
  const { user, logout } = useAuth()
  const { theme, toggle } = useTheme()
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2 text-lg font-bold">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-white">S</span> SheSafe
        </div>
        <div className="flex items-center gap-2 text-sm">
          {user && <NotificationCenter />}
          <button onClick={toggle} className="rounded-lg border border-slate-300 px-3 py-1.5 dark:border-slate-700" aria-label="Toggle theme">
            {theme === 'dark' ? 'Light' : 'Dark'}
          </button>
                    {user && <LogoutButton className="font-semibold text-brand-600" />}
        </div>
      </div>
      {user && (
        <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 pb-2 text-sm font-semibold">
          {LINKS[user.role].map(([to, label]) => (
            <NavLink key={to} to={to} className={({ isActive }) => `rounded-lg px-3 py-1.5 ${isActive ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}>{label}</NavLink>
          ))}
        </nav>
      )}
    </header>
  )
}