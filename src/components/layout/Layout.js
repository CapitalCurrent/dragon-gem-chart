import React, { useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../../contexts/AppContext';
import Toast from '../shared/Toast';
import TreasureChest from '../shared/TreasureChest';
import ChildAvatar from '../shared/ChildAvatar';
import { StarburstFlash, CelebrationVideo } from '../shared/CelebrationOverlay';
import { markGemsGiven } from '../../database';
import pkg from '../../../package.json';
const version = pkg.version;

const TAB_ICONS = {
  '/': `${process.env.PUBLIC_URL}/icons/tab_daily.png`,
  '/weekly': `${process.env.PUBLIC_URL}/icons/tab_weekly.png`,
  '/bonus': `${process.env.PUBLIC_URL}/icons/tab_bonus.png`,
  '/store': `${process.env.PUBLIC_URL}/icons/tab_store.png`,
  '/settings': `${process.env.PUBLIC_URL}/icons/tab_more.png`,
};

const TABS = [
  { path: '/', label: 'Daily' },
  { path: '/weekly', label: 'Weekly' },
  { path: '/bonus', label: 'Bonus' },
  { path: '/store', label: 'Store' },
  { path: '/settings', label: 'More' },
];

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { toast, children, selectedChild, setSelectedChild, collectedBalances, allUngiven, todayGems, refreshBalances, showToast } = useApp();

  const [showCollectVideo, setShowCollectVideo] = useState(false);
  const [showCollectBurst, setShowCollectBurst] = useState(false);

  const isDaily = location.pathname === '/';
  const childTodayGems = selectedChild ? todayGems[selectedChild.id] : null;
  const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  const jarBalance = selectedChild ? (collectedBalances[selectedChild.id] || 0) : 0;
  const pending = selectedChild ? (allUngiven[selectedChild.id] || 0) : 0;
  const earned = childTodayGems?.earned || 0;

  const wholeGems = Math.floor(pending);
  const handleCollect = async () => {
    if (!selectedChild || wholeGems <= 0) return;
    setShowCollectBurst(true);
    await markGemsGiven(selectedChild.id);
    await refreshBalances();
    showToast(`${wholeGems} gem${wholeGems !== 1 ? 's' : ''} added to jar!`, 'gem');
    // Play collect video after starburst
    setTimeout(() => setShowCollectVideo(true), 2400);
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-40 backdrop-blur-md border-b border-cave-600/30">
        {/* Row 1: Logo + Child Toggle — slightly darker */}
        <div className="bg-cave-950/80">
        <div className="flex items-center justify-between max-w-lg mx-auto px-4 py-1.5">
          <div className="flex items-center gap-1.5">
            <img src={`${process.env.PUBLIC_URL}/icon-192.png`} alt="Dragon Gems" className="w-7 h-7 rounded-lg" />
            <h1 className="text-base font-bold bg-gradient-to-r from-gold to-gold-light bg-clip-text text-transparent">
              Dragon Gems
            </h1>
            <span className="text-[11px] text-gray-400 mt-0.5 font-medium">v{version}</span>
          </div>

          {children.length > 0 && (
            <div className="flex items-center gap-2 overflow-x-auto p-1">
              {children.map(child => {
                const isActive = selectedChild?.id === child.id;
                return (
                  <button
                    key={child.id}
                    onClick={() => setSelectedChild(child)}
                    className={`flex items-center justify-center w-9 h-9 rounded-full text-lg transition-all flex-shrink-0
                      ${isActive
                        ? 'bg-gold/20 ring-2 ring-gold shadow-md shadow-gold/20'
                        : 'bg-cave-800/60 ring-1 ring-cave-600/30 opacity-50 hover:opacity-80 active:scale-95'
                      }`}
                    title={child.name}
                  >
                    <ChildAvatar emoji={child.avatar_emoji} size="sm" />
                  </button>
                );
              })}
            </div>
          )}
        </div>
        </div>

        {/* Row 2: Context bar — slightly lighter */}
        {selectedChild && (
          <div className="bg-cave-900/80">
          <div className="flex items-center justify-between max-w-lg mx-auto px-4 py-2">
            <div>
              <p className="text-sm font-semibold text-white">
                {isDaily ? `${selectedChild.name}'s Day` :
                 location.pathname === '/weekly' ? `${selectedChild.name}'s Week` :
                 location.pathname === '/bonus' ? 'Bonus Listening' :
                 location.pathname === '/store' ? `${selectedChild.name}'s Store` :
                 location.pathname === '/history' ? 'Gem History' :
                 location.pathname === '/settings' ? 'Settings' :
                 selectedChild.name}
              </p>
              {isDaily && <p className="text-[10px] text-gray-500">{dateStr}</p>}
            </div>
            <div className="flex items-center gap-3">
              {pending > 0 && <div className="gem-counter text-sm">💎 {pending}</div>}
              <TreasureChest
                count={jarBalance}
                pending={wholeGems}
                size="sm"
                onCollect={wholeGems > 0 ? handleCollect : undefined}
                showCount={true}
              />
            </div>
          </div>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1 px-4 py-3 pb-24 max-w-lg mx-auto w-full" style={{ position: 'relative', zIndex: 1 }}>
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
                className={`flex flex-col items-center py-2 px-2 transition-all ${
                  isActive
                    ? 'text-gold scale-105'
                    : 'text-gray-500 hover:text-gray-300 active:scale-95'
                }`}
              >
                <img src={TAB_ICONS[tab.path]} alt={tab.label} className={`w-6 h-6 ${isActive ? 'brightness-125' : 'brightness-75 opacity-60'}`} />
                <span className="text-[10px] font-medium mt-0.5">{tab.label}</span>
                {isActive && (
                  <div className="w-1 h-1 rounded-full bg-gold mt-0.5" />
                )}
              </button>
            );
          })}
        </div>
      </nav>

      {toast && <Toast message={toast.message} variant={toast.variant} />}

      {/* Celebration overlays for gem collect */}
      <StarburstFlash show={showCollectBurst} onDone={() => setShowCollectBurst(false)} />
      <CelebrationVideo show={showCollectVideo} type="collect" onDone={() => setShowCollectVideo(false)} />
    </div>
  );
}
