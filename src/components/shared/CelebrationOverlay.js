import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';

// ─── Video sources ───
const VIDEOS = {
  collect:  'gem_collect.mp4',
  complete: 'all_complete.mp4',
  redeem:   'store_redeem.mp4',
  celebrate: 'dragon_celebrate.mp4',
};

const BURST_COLORS = [
  '#ff2070', '#5df590', '#5588ff', '#c06ef0',
  '#ffd000', '#80ffff', '#ff80b0', '#b9f2ff',
  '#e0115f', '#50c878', '#ffbf00', '#9b59b6',
  '#ff6b35', '#00d4ff', '#ff1493', '#7fff00',
];

function seededRandom(seed) {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

// ─── StarburstFlash ─── Multi-wave particle explosion
export function StarburstFlash({ show, onDone }) {
  const [phase, setPhase] = useState('idle');
  const [seed] = useState(() => Math.floor(Math.random() * 10000));

  const { wave1, wave2, wave3, bigGems, trails } = useMemo(() => {
    if (phase === 'idle') return { wave1: [], wave2: [], wave3: [], bigGems: [], trails: [] };

    // Wave 1: fast inner burst — small bright particles
    const w1 = [];
    for (let i = 0; i < 20; i++) {
      const angle = (i / 20) * 360 + seededRandom(seed + i) * 18;
      const rad = (angle * Math.PI) / 180;
      const dist = 80 + seededRandom(seed + i + 100) * 60;
      w1.push({
        color: BURST_COLORS[i % BURST_COLORS.length],
        tx: Math.cos(rad) * dist,
        ty: Math.sin(rad) * dist,
        size: 4 + seededRandom(seed + i + 200) * 6,
        delay: seededRandom(seed + i + 300) * 0.08,
      });
    }

    // Wave 2: main explosion — larger gems flying far
    const w2 = [];
    for (let i = 0; i < 32; i++) {
      const angle = (i / 32) * 360 + seededRandom(seed + i + 400) * 11;
      const rad = (angle * Math.PI) / 180;
      const dist = 150 + seededRandom(seed + i + 500) * 180;
      w2.push({
        color: BURST_COLORS[i % BURST_COLORS.length],
        tx: Math.cos(rad) * dist,
        ty: Math.sin(rad) * dist,
        size: 8 + seededRandom(seed + i + 600) * 14,
        delay: 0.05 + seededRandom(seed + i + 700) * 0.2,
        rotation: seededRandom(seed + i + 800) * 360,
      });
    }

    // Wave 3: slow outer sparkles — tiny dots drifting out
    const w3 = [];
    for (let i = 0; i < 16; i++) {
      const angle = (i / 16) * 360 + seededRandom(seed + i + 900) * 22;
      const rad = (angle * Math.PI) / 180;
      const dist = 200 + seededRandom(seed + i + 1000) * 150;
      w3.push({
        color: '#ffd700',
        tx: Math.cos(rad) * dist,
        ty: Math.sin(rad) * dist,
        size: 2 + seededRandom(seed + i + 1100) * 4,
        delay: 0.3 + seededRandom(seed + i + 1200) * 0.3,
      });
    }

    // Big gem shapes — 6 large rotating gems
    const bg = [];
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * 360 + 30;
      const rad = (angle * Math.PI) / 180;
      const dist = 100 + seededRandom(seed + i + 1300) * 80;
      bg.push({
        color: BURST_COLORS[i * 2],
        tx: Math.cos(rad) * dist,
        ty: Math.sin(rad) * dist,
        size: 18 + seededRandom(seed + i + 1400) * 12,
        delay: 0.02 + i * 0.04,
        rotation: seededRandom(seed + i + 1500) * 180,
      });
    }

    // Light trails — long streaks radiating out
    const tr = [];
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * 360;
      const rad = (angle * Math.PI) / 180;
      tr.push({
        angle,
        color: BURST_COLORS[i % BURST_COLORS.length],
        tx: Math.cos(rad) * 250,
        ty: Math.sin(rad) * 250,
        delay: seededRandom(seed + i + 1600) * 0.1,
      });
    }

    return { wave1: w1, wave2: w2, wave3: w3, bigGems: bg, trails: tr };
  }, [phase, seed]);

  useEffect(() => {
    if (!show || phase !== 'idle') return;
    setPhase('active');
    const t = setTimeout(() => {
      setPhase('idle');
      if (onDone) onDone();
    }, 2200);
    return () => clearTimeout(t);
  }, [show]); // eslint-disable-line react-hooks/exhaustive-deps

  if (phase === 'idle') return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none overflow-hidden">
      {/* Screen flash */}
      <div className="absolute inset-0" style={{
        background: 'radial-gradient(circle at center, rgba(255,215,0,0.4) 0%, rgba(255,255,255,0.15) 30%, transparent 60%)',
        animation: 'screenFlash 0.6s ease-out forwards',
      }} />

      {/* Central bright core */}
      <div className="absolute rounded-full" style={{
        width: 40, height: 40,
        background: 'radial-gradient(circle, #fff 0%, #ffd700 50%, transparent 100%)',
        animation: 'coreFlash 0.8s ease-out forwards',
      }} />

      {/* Ring bursts — 3 expanding rings */}
      {[0, 1, 2].map(i => (
        <div key={`ring-${i}`} className="absolute rounded-full" style={{
          width: 30, height: 30,
          border: `${3 - i}px solid rgba(255,215,0,${0.6 - i * 0.15})`,
          animation: `ringExpand ${0.8 + i * 0.3}s ease-out ${i * 0.12}s forwards`,
          opacity: 0,
        }} />
      ))}

      {/* Light trails */}
      {trails.map((t, i) => (
        <div key={`trail-${i}`} className="absolute" style={{
          width: 3, height: 40,
          background: `linear-gradient(to bottom, ${t.color}, transparent)`,
          transformOrigin: 'center top',
          transform: `rotate(${t.angle}deg)`,
          animation: `trailShoot 0.5s ease-out ${t.delay}s forwards`,
          opacity: 0,
        }} />
      ))}

      {/* Wave 1: fast inner particles */}
      {wave1.map((p, i) => (
        <div key={`w1-${i}`} className="absolute rounded-full" style={{
          width: p.size, height: p.size,
          backgroundColor: p.color,
          boxShadow: `0 0 ${p.size * 2}px ${p.color}`,
          animation: `particleFly 0.5s cubic-bezier(0.16, 1, 0.3, 1) ${p.delay}s forwards`,
          '--tx': `${p.tx}px`, '--ty': `${p.ty}px`,
          opacity: 0,
        }} />
      ))}

      {/* Wave 2: main gem explosion */}
      {wave2.map((p, i) => (
        <div key={`w2-${i}`} className="absolute" style={{
          width: p.size, height: p.size,
          backgroundColor: p.color,
          borderRadius: i % 3 === 0 ? '50%' : '3px',
          transform: `rotate(${p.rotation}deg)`,
          boxShadow: `0 0 ${p.size}px ${p.color}, 0 0 ${p.size * 2}px ${p.color}40`,
          animation: `particleFly ${0.8 + seededRandom(seed + i + 2000) * 0.4}s cubic-bezier(0.16, 1, 0.3, 1) ${p.delay}s forwards`,
          '--tx': `${p.tx}px`, '--ty': `${p.ty}px`,
          opacity: 0,
        }} />
      ))}

      {/* Big gem shapes */}
      {bigGems.map((g, i) => (
        <div key={`gem-${i}`} className="absolute" style={{
          width: g.size, height: g.size * 1.2,
          background: `linear-gradient(135deg, ${g.color}, ${g.color}88)`,
          clipPath: 'polygon(50% 0%, 100% 38%, 80% 100%, 20% 100%, 0% 38%)',
          boxShadow: `0 0 20px ${g.color}`,
          animation: `gemFly 1s cubic-bezier(0.16, 1, 0.3, 1) ${g.delay}s forwards`,
          '--tx': `${g.tx}px`, '--ty': `${g.ty}px`,
          '--rot': `${g.rotation}deg`,
          opacity: 0,
        }} />
      ))}

      {/* Wave 3: outer sparkle drift */}
      {wave3.map((p, i) => (
        <div key={`w3-${i}`} className="absolute rounded-full" style={{
          width: p.size, height: p.size,
          backgroundColor: p.color,
          boxShadow: `0 0 ${p.size * 3}px ${p.color}`,
          animation: `particleDrift 1.4s ease-out ${p.delay}s forwards`,
          '--tx': `${p.tx}px`, '--ty': `${p.ty}px`,
          opacity: 0,
        }} />
      ))}

      <style>{`
        @keyframes screenFlash {
          0% { opacity: 0; }
          15% { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes coreFlash {
          0% { transform: scale(0); opacity: 1; }
          25% { transform: scale(3); opacity: 1; }
          100% { transform: scale(5); opacity: 0; }
        }
        @keyframes ringExpand {
          0% { transform: scale(0); opacity: 1; }
          100% { transform: scale(15); opacity: 0; }
        }
        @keyframes trailShoot {
          0% { transform: rotate(var(--angle, 0deg)) scaleY(0); opacity: 1; }
          50% { opacity: 1; }
          100% { transform: rotate(var(--angle, 0deg)) scaleY(6); opacity: 0; }
        }
        @keyframes particleFly {
          0% { transform: translate(0, 0) scale(1); opacity: 1; }
          70% { opacity: 0.8; }
          100% { transform: translate(var(--tx), var(--ty)) scale(0.2); opacity: 0; }
        }
        @keyframes gemFly {
          0% { transform: translate(0, 0) rotate(0deg) scale(0.5); opacity: 1; }
          50% { opacity: 1; }
          100% { transform: translate(var(--tx), var(--ty)) rotate(var(--rot)) scale(0.1); opacity: 0; }
        }
        @keyframes particleDrift {
          0% { transform: translate(0, 0) scale(0.5); opacity: 0; }
          20% { opacity: 1; }
          100% { transform: translate(var(--tx), var(--ty)) scale(0); opacity: 0; }
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
