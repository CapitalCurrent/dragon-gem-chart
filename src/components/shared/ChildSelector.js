import React from 'react';
import { useApp } from '../../contexts/AppContext';
import ChildAvatar from './ChildAvatar';

export default function ChildSelector({ showBalance = true }) {
  const { children, selectedChild, setSelectedChild, balances } = useApp();

  if (children.length === 0) return null;

  return (
    <div className="flex gap-2 overflow-x-auto pb-1 px-1">
      {children.map(child => {
        const isActive = selectedChild?.id === child.id;
        return (
          <button
            key={child.id}
            onClick={() => setSelectedChild(child)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl font-semibold text-sm transition-all whitespace-nowrap
              ${isActive
                ? 'bg-gradient-to-r from-gold/20 to-gold/10 border-2 border-gold/60 text-gold shadow-lg shadow-gold/10'
                : 'bg-cave-700/50 border-2 border-cave-600/50 text-gray-300 hover:border-cave-500'
              }`}
            style={isActive ? {} : {}}
          >
            <ChildAvatar emoji={child.avatar_emoji} size="sm" />
            <span>{child.name}</span>
            {showBalance && balances[child.id] !== undefined && (
              <span className={`text-xs px-2 py-0.5 rounded-full ${isActive ? 'bg-gold/20 text-gold' : 'bg-cave-600/50 text-gray-400'}`}>
                💎 {balances[child.id]}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
