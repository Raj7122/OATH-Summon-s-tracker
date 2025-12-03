import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import CalendarDashboard from './pages/CalendarDashboard'
import Clients from './pages/Clients'
import ClientList from './pages/ClientList'
import ClientDetail from './pages/ClientDetail'
import Account from './pages/Account'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'

function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          {/* New Calendar-Centric Dashboard (Strategic Pivot) */}
          <Route path="dashboard" element={<CalendarDashboard />} />
          {/* Legacy Dashboard (kept for reference) */}
          <Route path="dashboard-legacy" element={<Dashboard />} />
          {/* Client Center - Practice Management View (replaces old Clients page) */}
          <Route path="clients" element={<ClientList />} />
          <Route path="clients/:id" element={<ClientDetail />} />
          {/* Legacy Clients page for managing client records */}
          <Route path="manage-clients" element={<Clients />} />
          <Route path="account" element={<Account />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  )
}

export default App
