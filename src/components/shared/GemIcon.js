import React, { useState, useEffect } from 'react';

const GEM_COLORS = [
  { name: 'ruby', color: '#e0115f', shadow: 'rgba(224,17,95,0.5)' },
  { name: 'emerald', color: '#50c878', shadow: 'rgba(80,200,120,0.5)' },
  { name: 'sapphire', color: '#4169e1', shadow: 'rgba(65,105,225,0.5)' },
  { name: 'amethyst', color: '#9b59b6', shadow: 'rgba(155,89,182,0.5)' },
  { name: 'topaz', color: '#ffbf00', shadow: 'rgba(255,191,0,0.5)' },
  { name: 'diamond', color: '#b9f2ff', shadow: 'rgba(185,242,255,0.5)' },
];

export function getGemColor(index) {
  return GEM_COLORS[index % GEM_COLORS.length];
}

export default function GemIcon({ earned, size = 'md', colorIndex = 0, animate = false, count }) {
  const [justEarned, setJustEarned] = useState(false);
  const gem = GEM_COLORS[colorIndex % GEM_COLORS.length];

  useEffect(() => {
    if (animate && earned) {
      setJustEarned(true);
      const t = setTimeout(() => setJustEarned(false), 600);
      return () => clearTimeout(t);
    }
  }, [animate, earned]);

  const sizeClass = size === 'sm' ? 'w-5 h-5 text-sm' : size === 'lg' ? 'w-10 h-10 text-2xl' : 'w-7 h-7 text-lg';

  if (!earned) {
    return (
      <span className={`inline-flex items-center justify-center ${sizeClass} opacity-20 grayscale`}>
        💎
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center justify-center ${sizeClass} ${justEarned ? 'gem-earned' : ''}`}
      style={{
        color: gem.color,
        filter: `drop-shadow(0 0 4px ${gem.shadow})`,
      }}
    >
      {count ? (
        <span className="flex items-center gap-0.5">
          💎<span className="text-xs font-bold" style={{ color: gem.color }}>{count}</span>
        </span>
      ) : (
        '💎'
      )}
    </span>
  );
}

// Compact gem count display
export function GemCount({ count, size = 'md' }) {
  const sizeClass = size === 'sm' ? 'text-sm' : size === 'lg' ? 'text-xl' : 'text-base';
  return (
    <span className={`gem-counter ${sizeClass}`}>
      💎 {count}
    </span>
  );
}

// Multiple gem display (shows individual gems)
export function GemRow({ total, earned, startColor = 0 }) {
  return (
    <span className="inline-flex gap-0.5 flex-wrap">
      {Array.from({ length: total }, (_, i) => (
        <GemIcon
          key={i}
          earned={i < earned}
          size="sm"
          colorIndex={startColor + i}
          animate={i === earned - 1}
        />
      ))}
    </span>
  );
}
