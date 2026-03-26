import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { AppProvider } from './contexts/AppContext';
import Layout from './components/layout/Layout';
import DailyPage from './pages/DailyPage';
import WeeklyPage from './pages/WeeklyPage';
import BonusPage from './pages/BonusPage';
import StorePage from './pages/StorePage';
import HistoryPage from './pages/HistoryPage';
import SettingsPage from './pages/SettingsPage';
import LoginPage from './pages/LoginPage';

function AppRoutes() {
  const { user, loading, isConfigured } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <span className="text-6xl block animate-float">🐉</span>
          <p className="text-gold mt-4 font-semibold">Loading...</p>
        </div>
      </div>
    );
  }

  // If Supabase is configured but no user, show login
  if (isConfigured && !user) {
    return <LoginPage />;
  }

  return (
    <AppProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<DailyPage />} />
          <Route path="/weekly" element={<WeeklyPage />} />
          <Route path="/bonus" element={<BonusPage />} />
          <Route path="/store" element={<StorePage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
        <Route path="/history" element={<Layout />}>
          <Route index element={<HistoryPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppProvider>
  );
}

const BG_URL = process.env.PUBLIC_URL + '/dragon-cave-bg.jpg';

export default function App() {
  return (
    <HashRouter>
      <div id="dragon-bg" style={{ backgroundImage: `url(${BG_URL})` }} />
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </HashRouter>
  );
}
