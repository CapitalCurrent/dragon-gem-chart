import React, { useMemo, useState, useEffect } from 'react';

const GEM_COLORS = [
  '#e0115f', '#50c878', '#4169e1', '#9b59b6',
  '#ffbf00', '#b9f2ff', '#ff6b9d', '#00d4aa',
];

function srand(seed) {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

export default function TreasureChest({
  count = 0,        // gems currently in jar (given/collected balance)
  pending = 0,       // ungiven gems waiting to be collected
  size = 'md',
  onCollect,         // callback when jar is tapped to collect
}) {
  const [pouring, setPouring] = useState(false);
  const [showCheck, setShowCheck] = useState(false);

  const dims = size === 'sm'
    ? { w: 34, h: 46, neckW: 22, neckH: 6, rimW: 28, gemR: 2.0, lipH: 3 }
    : size === 'lg'
    ? { w: 56, h: 72, neckW: 36, neckH: 10, rimW: 44, gemR: 3.0, lipH: 4 }
    : { w: 44, h: 56, neckW: 28, neckH: 8, rimW: 34, gemR: 2.4, lipH: 3.5 };

  const { w, h, neckW, neckH, rimW, gemR, lipH } = dims;
  const pad = 6;
  const svgW = w + pad * 2;
  const bodyH = h - neckH - lipH;
  const overflowH = 12;
  const svgH = h + overflowH + 2;
  const jarTop = overflowH + lipH + neckH;
  const jarBottom = overflowH + h;
  const cx = svgW / 2;

  const fillFrac = Math.min(count / 150, 1);
  const overflowing = count > 120;
  const hasPending = pending > 0;
  const tappable = hasPending && onCollect;

  const handleTap = async () => {
    if (!tappable || pouring) return;
    setPouring(true);
    // Wait for pour animation
    setTimeout(async () => {
      if (onCollect) await onCollect();
      setPouring(false);
      setShowCheck(true);
      setTimeout(() => setShowCheck(false), 2000);
    }, 800);
  };

  const gems = useMemo(() => {
    if (count === 0) return [];
    const result = [];
    const n = Math.min(count, 150);
    const innerL = pad + 3;
    const innerR = pad + w - 3;
    const bottom = jarBottom - 2;
    const top = jarTop + 2;
    const pileTop = bottom - fillFrac * (bottom - top);

    for (let i = 0; i < n; i++) {
      const xPos = innerL + srand(i * 7 + 1) * (innerR - innerL);
      const t = srand(i * 13 + 3);
      const yPos = bottom - Math.sqrt(t) * (bottom - pileTop);
      result.push({
        cx: xPos, cy: yPos,
        color: GEM_COLORS[Math.floor(srand(i * 11 + 5) * GEM_COLORS.length)],
        rot: srand(i * 17 + 7) * 360,
        bright: srand(i * 23) > 0.55,
      });
    }
    return result;
  }, [count, w, pad, jarTop, jarBottom, fillFrac]);

  const overflowGems = useMemo(() => {
    if (!overflowing) return [];
    const result = [];
    const extra = Math.min(count - 120, 15);
    for (let i = 0; i < extra; i++) {
      result.push({
        cx: cx + Math.cos(srand(i * 31 + 9) * Math.PI - Math.PI / 2) * (neckW / 2 * 0.6) * (0.5 + srand(i * 41)),
        cy: overflowH + lipH - 1 - srand(i * 43 + 13) * (3 + srand(i * 37 + 11) * 8),
        color: GEM_COLORS[Math.floor(srand(i * 47 + 15) * GEM_COLORS.length)],
        rot: srand(i * 53 + 17) * 360,
      });
    }
    return result;
  }, [count, overflowing, cx, neckW, overflowH, lipH]);

  // Pour animation gems (falling into jar)
  const pourGems = useMemo(() => {
    if (!pouring) return [];
    const result = [];
    const n = Math.min(pending, 12);
    for (let i = 0; i < n; i++) {
      result.push({
        cx: cx + (srand(i * 71) - 0.5) * neckW * 0.5,
        color: GEM_COLORS[Math.floor(srand(i * 83) * GEM_COLORS.length)],
        delay: i * 0.06,
      });
    }
    return result;
  }, [pouring, pending, cx, neckW]);

  const uid = `jar-${size}`;
  const bellyW = w / 2;
  const neckWHalf = neckW / 2;
  const rimHalf = rimW / 2;

  const jarPath = `
    M ${cx - rimHalf},${overflowH}
    L ${cx - rimHalf},${overflowH + lipH}
    C ${cx - neckWHalf},${overflowH + lipH} ${cx - neckWHalf},${overflowH + lipH + neckH * 0.3} ${cx - neckWHalf},${overflowH + lipH + neckH}
    C ${cx - neckWHalf},${overflowH + lipH + neckH + 4} ${cx - bellyW},${jarTop + bodyH * 0.15} ${cx - bellyW},${jarTop + bodyH * 0.4}
    L ${cx - bellyW},${jarBottom - 6}
    Q ${cx - bellyW},${jarBottom} ${cx - bellyW + 6},${jarBottom}
    L ${cx + bellyW - 6},${jarBottom}
    Q ${cx + bellyW},${jarBottom} ${cx + bellyW},${jarBottom - 6}
    L ${cx + bellyW},${jarTop + bodyH * 0.4}
    C ${cx + bellyW},${jarTop + bodyH * 0.15} ${cx + neckWHalf},${overflowH + lipH + neckH + 4} ${cx + neckWHalf},${overflowH + lipH + neckH}
    C ${cx + neckWHalf},${overflowH + lipH + neckH * 0.3} ${cx + neckWHalf},${overflowH + lipH} ${cx + rimHalf},${overflowH + lipH}
    L ${cx + rimHalf},${overflowH}
  `;

  const clipPath = `
    M ${cx - neckWHalf + 1},${overflowH + lipH + 1}
    C ${cx - neckWHalf + 1},${overflowH + lipH + neckH * 0.3} ${cx - neckWHalf + 1},${overflowH + lipH + neckH} ${cx - neckWHalf + 1},${overflowH + lipH + neckH}
    C ${cx - neckWHalf + 1},${overflowH + lipH + neckH + 4} ${cx - bellyW + 1},${jarTop + bodyH * 0.15} ${cx - bellyW + 1},${jarTop + bodyH * 0.4}
    L ${cx - bellyW + 1},${jarBottom - 5}
    Q ${cx - bellyW + 1},${jarBottom - 1} ${cx - bellyW + 7},${jarBottom - 1}
    L ${cx + bellyW - 7},${jarBottom - 1}
    Q ${cx + bellyW - 1},${jarBottom - 1} ${cx + bellyW - 1},${jarBottom - 5}
    L ${cx + bellyW - 1},${jarTop + bodyH * 0.4}
    C ${cx + bellyW - 1},${jarTop + bodyH * 0.15} ${cx + neckWHalf - 1},${overflowH + lipH + neckH + 4} ${cx + neckWHalf - 1},${overflowH + lipH + neckH}
    C ${cx + neckWHalf - 1},${overflowH + lipH + neckH * 0.3} ${cx + neckWHalf - 1},${overflowH + lipH + 1} ${cx + neckWHalf - 1},${overflowH + lipH + 1}
    Z
  `;

  const badgeSize = size === 'sm' ? 14 : 18;

  return (
    <div
      className={`relative flex flex-col items-center ${tappable ? 'cursor-pointer' : ''}`}
      style={{ width: svgW, height: svgH + 14 }}
      onClick={handleTap}
    >
      {/* Pulsing glow ring when pending */}
      {hasPending && !pouring && (
        <div
          className="absolute inset-0 rounded-full animate-pulse"
          style={{
            boxShadow: '0 0 12px rgba(255,215,0,0.4), 0 0 24px rgba(255,215,0,0.2)',
            margin: '-4px',
            borderRadius: '50%',
          }}
        />
      )}

      {/* Background glow */}
      {count > 0 && (
        <div
          className="absolute inset-0 rounded-full blur-lg"
          style={{ background: `radial-gradient(circle, rgba(255,215,0,${0.04 + fillFrac * 0.12}) 0%, transparent 70%)` }}
        />
      )}

      {/* Sparkles for high count */}
      {count >= 130 && (
        <>
          <span className="absolute top-0 left-0 text-[7px] animate-pulse">✨</span>
          <span className="absolute top-2 -right-0 text-[7px] animate-pulse" style={{ animationDelay: '0.7s' }}>✨</span>
        </>
      )}

      {/* Pending badge "+14" */}
      {hasPending && !pouring && !showCheck && (
        <div
          className="absolute z-30 flex items-center justify-center animate-bounce"
          style={{
            top: -8,
            right: -10,
            minWidth: badgeSize + 2,
            height: badgeSize + 2,
            borderRadius: (badgeSize + 2) / 2,
            background: 'linear-gradient(135deg, #ffd700, #ffbf00)',
            color: '#1a0a2e',
            fontSize: size === 'sm' ? 9 : 11,
            fontWeight: 800,
            padding: '0 4px',
            boxShadow: '0 2px 8px rgba(255,215,0,0.5)',
            border: '2px solid rgba(10,5,20,0.8)',
          }}
        >
          +{pending}
        </div>
      )}

      {/* Check mark after collecting */}
      {showCheck && (
        <div
          className="absolute z-30 flex items-center justify-center"
          style={{
            top: -8,
            right: -10,
            width: badgeSize + 2,
            height: badgeSize + 2,
            borderRadius: (badgeSize + 2) / 2,
            background: '#50c878',
            color: 'white',
            fontSize: size === 'sm' ? 9 : 11,
            fontWeight: 800,
            border: '2px solid rgba(10,5,20,0.8)',
            boxShadow: '0 2px 8px rgba(80,200,120,0.5)',
          }}
        >
          ✓
        </div>
      )}

      <svg width={svgW} height={svgH} viewBox={`0 0 ${svgW} ${svgH}`} className="relative z-10">
        <defs>
          <linearGradient id={`g-${uid}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgba(255,255,255,0.12)" />
            <stop offset="25%" stopColor="rgba(255,255,255,0.03)" />
            <stop offset="75%" stopColor="rgba(255,255,255,0.02)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0.10)" />
          </linearGradient>
          <linearGradient id={`s-${uid}`} x1="0.15" y1="0" x2="0.5" y2="1">
            <stop offset="0%" stopColor="rgba(255,255,255,0.22)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </linearGradient>
          <linearGradient id={`a-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(180,160,120,0.08)" />
            <stop offset="100%" stopColor="rgba(140,110,70,0.12)" />
          </linearGradient>
          <clipPath id={`c-${uid}`}>
            <path d={clipPath} />
          </clipPath>
        </defs>

        {/* Jar body */}
        <path d={jarPath} fill={`url(#g-${uid})`} stroke="rgba(180,160,120,0.35)" strokeWidth={1.3} strokeLinejoin="round" />
        <path d={jarPath} fill={`url(#a-${uid})`} />

        {/* Rim */}
        <line x1={cx - rimHalf} y1={overflowH} x2={cx + rimHalf} y2={overflowH}
          stroke="rgba(180,160,120,0.5)" strokeWidth={2.5} strokeLinecap="round" />

        {/* Gems inside jar */}
        <g clipPath={`url(#c-${uid})`}>
          {gems.map((gem, i) => (
            <polygon key={i}
              points={`0,${-gemR} ${gemR * 0.7},0 0,${gemR * 0.55} ${-gemR * 0.7},0`}
              transform={`translate(${gem.cx},${gem.cy}) rotate(${gem.rot})`}
              fill={gem.color} opacity={gem.bright ? 1 : 0.7}
            />
          ))}

          {/* Pour animation — gems falling in */}
          {pourGems.map((gem, i) => (
            <g key={`pour-${i}`}>
              <polygon
                points={`0,${-gemR} ${gemR * 0.7},0 0,${gemR * 0.55} ${-gemR * 0.7},0`}
                fill={gem.color}
              >
                <animateTransform attributeName="transform" type="translate"
                  from={`${gem.cx} ${overflowH - 5}`}
                  to={`${gem.cx} ${jarBottom - 5 - srand(i * 97) * 15}`}
                  dur="0.6s" begin={`${gem.delay}s`} fill="freeze"
                />
                <animate attributeName="opacity" from="1" to="0.8" dur="0.6s" begin={`${gem.delay}s`} fill="freeze" />
              </polygon>
            </g>
          ))}
        </g>

        {/* Overflow gems */}
        {overflowGems.map((gem, i) => (
          <polygon key={`ov-${i}`}
            points={`0,${-gemR} ${gemR * 0.7},0 0,${gemR * 0.55} ${-gemR * 0.7},0`}
            transform={`translate(${gem.cx},${gem.cy}) rotate(${gem.rot})`}
            fill={gem.color} opacity={0.9}
          />
        ))}

        {/* Glass shine */}
        <path d={`
          M ${cx - bellyW + 3},${jarTop + bodyH * 0.45}
          L ${cx - bellyW + 3},${jarBottom - 8}
          Q ${cx - bellyW + 3},${jarBottom - 2} ${cx - bellyW + 5},${jarBottom - 2}
          L ${cx - bellyW + 5},${jarTop + bodyH * 0.45} Z
        `} fill={`url(#s-${uid})`} />
        <line x1={cx - neckWHalf + 2} y1={overflowH + lipH + 2} x2={cx - neckWHalf + 2} y2={overflowH + lipH + neckH - 1}
          stroke="rgba(255,255,255,0.12)" strokeWidth={1.5} strokeLinecap="round" />
      </svg>

      <span className="text-[10px] font-bold text-gold mt-0.5">{count}</span>
    </div>
  );
}
