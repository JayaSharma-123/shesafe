import { Navigate, Route, Routes } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import ContactAlerts from './components/ContactAlerts'
import { useAuth } from './context/AuthContext'
import Login from './pages/Login'
import Signup from './pages/Signup'
import ForgotPassword from './pages/ForgotPassword'
import UserHome from './pages/UserHome'
import StationDashboard from './pages/StationDashboard'
import Contacts from './pages/Contacts'
import Profile from './pages/Profile'

export default function App() {
  const { user } = useAuth()
  return (
    <>
      {/* Red SOS cards for people who are someone's trusted contact. Shows nothing unless an alert exists. */}
      <ContactAlerts />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/forgot" element={<ForgotPassword />} />
        <Route path="/app" element={<ProtectedRoute role="user"><UserHome /></ProtectedRoute>} />
        <Route path="/contacts" element={<ProtectedRoute role="user"><Contacts /></ProtectedRoute>} />
        <Route path="/station" element={<ProtectedRoute role="station"><StationDashboard /></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to={user ? (user.role === 'station' ? '/station' : '/app') : '/login'} replace />} />
      </Routes>
    </>
  )
}