import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Register from './pages/Register';
import AdminDashboard from './pages/admin/AdminDashboard';
import LoadManagement from './pages/admin/LoadManagement';
import CarrierManagement from './pages/admin/CarrierManagement';
import BookingManagement from './pages/admin/BookingManagement';
import AIMarketing from './pages/admin/AIMarketing';
import CarrierDashboard from './pages/carrier/CarrierDashboard';
import LoadBoard from './pages/carrier/LoadBoard';
import MyBookings from './pages/carrier/MyBookings';

function PrivateRoute({ children, adminOnly = false }) {
  const { user, carrier, loading } = useAuth();
  if (loading) return <div className="flex h-screen items-center justify-center"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-navy-800" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && user.role !== 'admin') return <Navigate to="/carrier/dashboard" replace />;
  if (user.role === 'carrier' && carrier?.status !== 'Approved' && !adminOnly) {
    return (
      <div className="flex h-screen items-center justify-center flex-col gap-4">
        <div className="card text-center max-w-md">
          <h2 className="text-xl font-bold text-navy-800 mb-2">Application Pending</h2>
          <p className="text-slate-600">Your carrier application is <strong>{carrier?.status || 'under review'}</strong>. You will be notified once approved.</p>
          <button onClick={() => { localStorage.removeItem('token'); window.location.href = '/login'; }} className="btn-secondary mt-4">Sign Out</button>
        </div>
      </div>
    );
  }
  return children;
}

function AppRoutes() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to={user.role === 'admin' ? '/admin/dashboard' : '/carrier/dashboard'} /> : <Login />} />
      <Route path="/register" element={<Register />} />

      <Route path="/admin" element={<PrivateRoute adminOnly><Layout /></PrivateRoute>}>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<AdminDashboard />} />
        <Route path="loads" element={<LoadManagement />} />
        <Route path="carriers" element={<CarrierManagement />} />
        <Route path="bookings" element={<BookingManagement />} />
        <Route path="marketing" element={<AIMarketing />} />
      </Route>

      <Route path="/carrier" element={<PrivateRoute><Layout /></PrivateRoute>}>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<CarrierDashboard />} />
        <Route path="loads" element={<LoadBoard />} />
        <Route path="bookings" element={<MyBookings />} />
      </Route>

      <Route path="*" element={<Navigate to={user ? (user.role === 'admin' ? '/admin/dashboard' : '/carrier/dashboard') : '/login'} replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
