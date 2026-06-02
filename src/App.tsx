import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { InvoiceProvider } from './contexts/InvoiceContext'
import { InvoiceTrackerProvider } from './contexts/InvoiceTrackerContext'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import CalendarDashboard from './pages/CalendarDashboard'
import Clients from './pages/Clients'
import ClientList from './pages/ClientList'
import ClientDetail from './pages/ClientDetail'
import Account from './pages/Account'
import InvoiceBuilder from './pages/InvoiceBuilder'
import InvoiceTracker from './pages/InvoiceTracker'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'

function App() {
  return (
    <AuthProvider>
      <InvoiceProvider>
      <InvoiceTrackerProvider>
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
          {/* Invoice Builder - staging area for generating client invoices */}
          <Route path="invoice-builder" element={<InvoiceBuilder />} />
          {/* Invoice Tracker - monitor payment statuses and overdue invoices */}
          <Route path="invoice-tracker" element={<InvoiceTracker />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </InvoiceTrackerProvider>
      </InvoiceProvider>
    </AuthProvider>
  )
}

export default App
