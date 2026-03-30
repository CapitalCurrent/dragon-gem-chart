import React, { useState, useEffect, useRef, useCallback } from 'react';

// ─── Video sources ───
const VIDEOS = {
  collect:  'gem_collect.mp4',
  complete: 'all_complete.mp4',
  redeem:   'store_redeem.mp4',
  celebrate: 'dragon_celebrate.mp4',
};

// ─── StarburstFlash ─── Gem explosion overlay (plays on bonus / collect moments)
export function StarburstFlash({ show, onDone }) {
  const [phase, setPhase] = useState('idle'); // idle → entering → visible → exiting → idle

  useEffect(() => {
    if (!show || phase !== 'idle') return;
    setPhase('entering');

    // Short delay before main burst
    const t1 = setTimeout(() => setPhase('visible'), 50);
    const t2 = setTimeout(() => setPhase('exiting'), 900);
    const t3 = setTimeout(() => {
      setPhase('idle');
      if (onDone) onDone();
    }, 1200);

    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [show]); // eslint-disable-line react-hooks/exhaustive-deps

  if (phase === 'idle') return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
      {/* Soft radial flash behind the burst */}
      <div
        className="absolute inset-0 transition-opacity duration-300"
        style={{
          background: 'radial-gradient(circle, rgba(255,215,0,0.15) 0%, transparent 60%)',
          opacity: phase === 'visible' ? 1 : 0,
        }}
      />
      {/* Starburst image */}
      <img
        src={`${process.env.PUBLIC_URL}/mascots/starburst.jpg`}
        alt=""
        className="w-80 h-auto animate-starburst"
        style={{ mixBlendMode: 'screen' }}
      />
    </div>
  );
}

// ─── CelebrationVideo ─── Plays a celebration video with smooth entrance/exit
export function CelebrationVideo({ show, type = 'celebrate', onDone }) {
  const [phase, setPhase] = useState('idle'); // idle → entering → playing → exiting → idle
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
      // Allow enter animation to settle before "playing" state
      const t = setTimeout(() => setPhase('playing'), 400);
      return () => clearTimeout(t);
    }
  }, [show]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-dismiss when video ends
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
        {/* Tap to skip hint */}
        <p className="text-center text-[10px] text-gray-500 mt-3 animate-fade-in"
           style={{ animationDelay: '2s', animationFillMode: 'both' }}>
          tap to skip
        </p>
      </div>
    </div>
  );
}

// ─── Convenience hook for managing celebration state ───
export function useCelebration() {
  const [starburst, setStarburst] = useState(false);
  const [video, setVideo] = useState({ show: false, type: 'celebrate' });

  const triggerStarburst = useCallback(() => {
    setStarburst(true);
  }, []);

  const triggerVideo = useCallback((type = 'celebrate') => {
    setVideo({ show: true, type });
  }, []);

  const clearStarburst = useCallback(() => setStarburst(false), []);
  const clearVideo = useCallback(() => setVideo({ show: false, type: 'celebrate' }), []);

  return {
    starburst,
    video,
    triggerStarburst,
    triggerVideo,
    clearStarburst,
    clearVideo,
  };
}
