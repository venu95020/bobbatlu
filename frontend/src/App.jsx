import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Placeholder from './pages/Placeholder'
import Items from './pages/Items'
import Sale from './pages/Sale'
import Reports from './pages/Reports'

function Protected({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="p-8 text-center text-slate-500">Loading…</div>
  return user ? children : <Navigate to="/login" replace />
}

export default function App() {
  const { user } = useAuth()
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <Login />} />
      <Route element={<Protected><Layout /></Protected>}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/sale" element={<Sale />} />
        <Route path="/menu" element={<Items />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/settings" element={<Placeholder title="Settings" />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}
