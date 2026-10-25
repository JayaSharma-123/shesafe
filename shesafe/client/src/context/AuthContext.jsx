import { stopKeyword } from '../hooks/useKeyword'
import { stopSharedMic } from '../lib/mic'
import { createContext, useContext, useEffect, useState } from 'react'
import { api, getToken, setToken } from '../lib/api'
const Ctx = createContext()
export const useAuth = () => useContext(Ctx)

// Holds the logged-in user. On page refresh it re-checks the saved token with /auth/me.
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(!!getToken())

  useEffect(() => {
    if (!getToken()) return
    api('/auth/me').then(setUser).catch(() => setToken(null)).finally(() => setLoading(false))
  }, [])

  const accept = ({ token, user }) => { setToken(token); setUser(user); return user }
  const login = (phone, password, role) => api('/auth/login', { method: 'POST', body: { phone, password, role } }).then(accept)
  const signup = payload => api('/auth/register', { method: 'POST', body: payload }).then(accept)
  const logout = () => { stopKeyword(); stopSharedMic(); setToken(null); setUser(null) }
    return <Ctx.Provider value={{ user, setUser, loading, login, signup, logout }}>{children}</Ctx.Provider>
}
