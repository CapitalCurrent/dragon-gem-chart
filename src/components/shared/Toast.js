import React from 'react';

export default function Toast({ message, variant = 'success' }) {
  if (!message) return null;

  const colors = {
    success: 'bg-gem-emerald/20 border-gem-emerald/50 text-gem-emerald',
    error: 'bg-gem-ruby/20 border-gem-ruby/50 text-gem-ruby',
    info: 'bg-gem-sapphire/20 border-gem-sapphire/50 text-gem-sapphire',
    gem: 'bg-gold/20 border-gold/50 text-gold',
  };

  return (
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 toast-in">
      <div className={`px-5 py-3 rounded-2xl border ${colors[variant] || colors.success} backdrop-blur-md shadow-lg flex items-center gap-2 font-semibold`}>
        {variant === 'gem' && <span className="text-lg">💎</span>}
        {variant === 'success' && <span className="text-lg">✨</span>}
        {message}
      </div>
    </div>
  );
}
