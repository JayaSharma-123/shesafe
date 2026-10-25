import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

// Only lets logged-in users with the right role see a page.
export default function ProtectedRoute({ role, children }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="mx-auto mt-24 h-6 w-40 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
  if (!user) return <Navigate to="/login" replace />
  if (role && user.role !== role) return <Navigate to={user.role === 'station' ? '/station' : '/app'} replace />
  return children
}