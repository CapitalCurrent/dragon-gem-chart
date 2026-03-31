import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';

// ─── Video sources ───
const VIDEOS = {
  collect:  'gem_collect.mp4',
  complete: 'all_complete.mp4',
  redeem:   'store_redeem.mp4',
  celebrate: 'dragon_celebrate.mp4',
};

// ─── Gem colors for particles ───
const BURST_COLORS = [
  '#ff2070', '#5df590', '#5588ff', '#c06ef0',
  '#ffd000', '#80ffff', '#ff80b0', '#b9f2ff',
  '#e0115f', '#50c878', '#ffbf00', '#9b59b6',
];

// ─── StarburstFlash ─── Pure CSS particle burst
export function StarburstFlash({ show, onDone }) {
  const [phase, setPhase] = useState('idle');

  // Generate random particles once per burst
  const particles = useMemo(() => {
    if (phase === 'idle') return [];
    const count = 24;
    const result = [];
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * 360 + (Math.random() * 15 - 7.5);
      const rad = (angle * Math.PI) / 180;
      const dist = 120 + Math.random() * 100;
      const size = 6 + Math.random() * 10;
      result.push({
        id: i,
        color: BURST_COLORS[i % BURST_COLORS.length],
        tx: Math.cos(rad) * dist,
        ty: Math.sin(rad) * dist,
        size,
        delay: Math.random() * 0.15,
        duration: 0.6 + Math.random() * 0.4,
        shape: Math.random() > 0.5 ? 'diamond' : 'circle',
      });
    }
    return result;
  }, [phase]);

  useEffect(() => {
    if (!show || phase !== 'idle') return;
    setPhase('active');

    const t = setTimeout(() => {
      setPhase('idle');
      if (onDone) onDone();
    }, 1800);

    return () => clearTimeout(t);
  }, [show]); // eslint-disable-line react-hooks/exhaustive-deps

  if (phase === 'idle') return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
      {/* Central flash */}
      <div
        className="absolute rounded-full"
        style={{
          width: 80,
          height: 80,
          background: 'radial-gradient(circle, rgba(255,255,255,0.9) 0%, rgba(255,215,0,0.6) 40%, transparent 70%)',
          animation: 'centralFlash 0.8s ease-out forwards',
        }}
      />

      {/* Golden ring burst */}
      <div
        className="absolute rounded-full border-2 border-gold/60"
        style={{
          width: 20,
          height: 20,
          animation: 'ringBurst 1s ease-out forwards',
        }}
      />

      {/* Particles */}
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute"
          style={{
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
            borderRadius: p.shape === 'circle' ? '50%' : '2px',
            transform: p.shape === 'diamond' ? 'rotate(45deg)' : 'none',
            boxShadow: `0 0 ${p.size}px ${p.color}`,
            animation: `particleBurst ${p.duration}s cubic-bezier(0.16, 1, 0.3, 1) ${p.delay}s forwards`,
            '--tx': `${p.tx}px`,
            '--ty': `${p.ty}px`,
            opacity: 0,
          }}
        />
      ))}

      {/* Sparkle stars */}
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const angle = (i / 6) * 360;
        const rad = (angle * Math.PI) / 180;
        const dist = 60 + Math.random() * 40;
        return (
          <div
            key={`star-${i}`}
            className="absolute text-gold"
            style={{
              fontSize: 14 + Math.random() * 10,
              animation: `particleBurst 1s ease-out ${0.1 + i * 0.05}s forwards`,
              '--tx': `${Math.cos(rad) * dist}px`,
              '--ty': `${Math.sin(rad) * dist}px`,
              opacity: 0,
            }}
          >
            ✦
          </div>
        );
      })}

      {/* Inline keyframes */}
      <style>{`
        @keyframes centralFlash {
          0% { transform: scale(0); opacity: 1; }
          30% { transform: scale(2); opacity: 1; }
          100% { transform: scale(3); opacity: 0; }
        }
        @keyframes ringBurst {
          0% { transform: scale(0); opacity: 1; }
          100% { transform: scale(12); opacity: 0; }
        }
        @keyframes particleBurst {
          0% { transform: translate(0, 0) scale(1) ${''} ; opacity: 1; }
          60% { opacity: 1; }
          100% { transform: translate(var(--tx), var(--ty)) scale(0.3); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

// ─── CelebrationVideo ─── Plays a celebration video with smooth entrance/exit
export function CelebrationVideo({ show, type = 'celebrate', onDone }) {
  const [phase, setPhase] = useState('idle');
  const videoRef = useRef(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  const dismiss = useCallback(() => {
    if (phase === 'exiting' || phase === 'idle') return;
    setPhase('exiting');
    setTimeout(() => {
      setPhase('idle');
      if (onDoneRef.current) onDoneRef.current();
    }, 300);
  }, [phase]);

  useEffect(() => {
    if (show && phase === 'idle') {
      setPhase('entering');
      const t = setTimeout(() => setPhase('playing'), 400);
      return () => clearTimeout(t);
    }
  }, [show]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleEnded = useCallback(() => {
    dismiss();
  }, [dismiss]);

  if (phase === 'idle') return null;

  const videoFile = VIDEOS[type] || VIDEOS.celebrate;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center transition-all duration-300
        ${phase === 'exiting' ? 'opacity-0' : 'opacity-100'}`}
      style={{ backgroundColor: 'rgba(10,5,20,0.7)', backdropFilter: 'blur(8px)' }}
      onClick={dismiss}
    >
      <div className={`relative transition-transform duration-400
        ${phase === 'entering' ? 'animate-celebration-in' : ''}
        ${phase === 'exiting' ? 'animate-celebration-out' : ''}`}
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          onEnded={handleEnded}
          className="w-80 max-w-[85vw] rounded-2xl shadow-2xl"
          style={{
            boxShadow: '0 0 60px rgba(255,215,0,0.2), 0 20px 60px rgba(0,0,0,0.5)',
          }}
        >
          <source src={`${process.env.PUBLIC_URL}/mascots/${videoFile}`} type="video/mp4" />
        </video>
        <p className="text-center text-[10px] text-gray-500 mt-3 animate-fade-in"
           style={{ animationDelay: '2s', animationFillMode: 'both' }}>
          tap to skip
        </p>
      </div>
    </div>
  );
}
