import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import LoginPage from './pages/LoginPage';
import Dashboard from './pages/Dashboard';
import ConnectPage from './pages/ConnectPage';
import ChatsPage from './pages/ChatsPage';
import SettingsPage from './pages/SettingsPage';
import InventoryPage from './pages/InventoryPage';
import PendingBookingsPage from './pages/PendingBookingsPage';
import BookingsPage from './pages/BookingsPage';
import MessageLogPage from './pages/MessageLogPage';
import CalendarPage from './pages/CalendarPage';
import AvailabilityPage from './pages/AvailabilityPage';
import PublicWidgetPage from './pages/PublicWidgetPage';
import Sidebar from './components/Sidebar';
import BottomNav from './components/BottomNav';

// Protected Route wrapper component
function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

// Protected layout that includes vertical Sidebar & BottomNav for mobile
function ProtectedLayout({ children }) {
  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-slate-50 flex flex-col lg:flex-row">
        <Sidebar />
        <div className="flex-1 min-w-0 lg:pl-64 flex flex-col transition-all duration-300">
          <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 pb-24 lg:pb-8">
            {children}
          </main>
        </div>
        <BottomNav />
      </div>
    </ProtectedRoute>
  );
}

function App() {
  return (
    <div className="min-h-screen bg-gray-100">
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <ProtectedLayout>
              <Dashboard />
            </ProtectedLayout>
          }
        />
        <Route
          path="/connect"
          element={
            <ProtectedLayout>
              <ConnectPage />
            </ProtectedLayout>
          }
        />
        <Route
          path="/chats"
          element={
            <ProtectedLayout>
              <ChatsPage />
            </ProtectedLayout>
          }
        />
        <Route
          path="/chats/:id"
          element={
            <ProtectedLayout>
              <ChatsPage />
            </ProtectedLayout>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedLayout>
              <SettingsPage />
            </ProtectedLayout>
          }
        />
        <Route
          path="/inventory"
          element={
            <ProtectedLayout>
              <InventoryPage />
            </ProtectedLayout>
          }
        />
        <Route
          path="/pms/pending"
          element={
            <ProtectedLayout>
              <PendingBookingsPage />
            </ProtectedLayout>
          }
        />
        <Route
          path="/pms/bookings"
          element={
            <ProtectedLayout>
              <BookingsPage />
            </ProtectedLayout>
          }
        />
        <Route
          path="/pms/calendar"
          element={
            <ProtectedLayout>
              <CalendarPage />
            </ProtectedLayout>
          }
        />
        <Route
          path="/availability"
          element={
            <ProtectedLayout>
              <AvailabilityPage />
            </ProtectedLayout>
          }
        />
        <Route path="/availability/widget" element={<PublicWidgetPage />} />
        <Route
          path="/pms/message-log"
          element={
            <ProtectedLayout>
              <MessageLogPage />
            </ProtectedLayout>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}

export default App;
