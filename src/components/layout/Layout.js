import React from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../../contexts/AppContext';
import Toast from '../shared/Toast';

const TABS = [
  { path: '/', icon: '📋', label: 'Daily' },
  { path: '/weekly', icon: '📅', label: 'Weekly' },
  { path: '/bonus', icon: '⭐', label: 'Bonus' },
  { path: '/store', icon: '🏪', label: 'Store' },
  { path: '/settings', icon: '⚙️', label: 'Settings' },
];

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useApp();

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-cave-900/90 backdrop-blur-md border-b border-cave-600/30 px-4 py-3">
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <div className="flex items-center gap-2">
            <span className="text-2xl animate-float">🐉</span>
            <h1 className="text-lg font-bold bg-gradient-to-r from-gold to-gold-light bg-clip-text text-transparent">
              Dragon Gems
            </h1>
          </div>
          <button
            onClick={() => navigate('/history')}
            className="text-sm text-gold/70 hover:text-gold transition-colors px-2 py-1"
          >
            📜 History
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 px-4 py-4 pb-24 max-w-lg mx-auto w-full">
        <Outlet />
      </main>

      {/* Bottom Tab Bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-cave-900/95 backdrop-blur-md border-t border-cave-600/30 safe-area-bottom">
        <div className="flex justify-around max-w-lg mx-auto">
          {TABS.map(tab => {
            const isActive = location.pathname === tab.path ||
              (tab.path !== '/' && location.pathname.startsWith(tab.path));
            return (
              <button
                key={tab.path}
                onClick={() => navigate(tab.path)}
                className={`flex flex-col items-center py-2 px-3 transition-all ${
                  isActive
                    ? 'text-gold scale-105'
                    : 'text-gray-500 hover:text-gray-300 active:scale-95'
                }`}
              >
                <span className="text-xl">{tab.icon}</span>
                <span className="text-[10px] font-medium mt-0.5">{tab.label}</span>
                {isActive && (
                  <div className="w-1 h-1 rounded-full bg-gold mt-0.5" />
                )}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Toast */}
      {toast && <Toast message={toast.message} variant={toast.variant} />}
    </div>
  );
}
