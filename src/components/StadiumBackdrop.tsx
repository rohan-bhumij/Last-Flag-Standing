import React, { useEffect, useRef } from 'react';

/**
 * Rich, high-definition World Championship Stadium & Rivalry Backdrop.
 * Renders multi-layered volumetric smoke/nebula textures, stadium floodlight trusses,
 * distant crowd bokeh lights, detailed rim-lit rival athlete silhouettes (#10 Blue vs #7 Red),
 * and rising ember particles — while keeping a dark radial center vignette so the main
 * circular flag arena remains 100% crisp and never overshadowed.
 */
export const StadiumBackdrop: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = 540;
    const H = 960;
    canvas.width = W;
    canvas.height = H;

    // Deterministic PRNG so the stadium texture is rich and consistent
    let seed = 20261025;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };

    // 1. Deep Night Stadium Sky Base
    const baseGrad = ctx.createLinearGradient(0, 0, 0, H);
    baseGrad.addColorStop(0, '#030511');
    baseGrad.addColorStop(0.35, '#05091d');
    baseGrad.addColorStop(0.75, '#070b20');
    baseGrad.addColorStop(1, '#03040c');
    ctx.fillStyle = baseGrad;
    ctx.fillRect(0, 0, W, H);

    // 2. Volumetric Left (Electric Cyan-Blue) & Right (Fiery Crimson-Red) Smoke Clouds
    // Layered soft cloud puffs around the left and right wings
    for (let i = 0; i < 65; i++) {
      const isLeft = i % 2 === 0;
      const cx = isLeft ? rand() * (W * 0.52) - 30 : W - rand() * (W * 0.52) + 30;
      const cy = 90 + rand() * (H * 0.82);
      const radius = 55 + rand() * 130;

      const g = ctx.createRadialGradient(cx, cy, 4, cx, cy, radius);
      if (isLeft) {
        const alpha = 0.04 + rand() * 0.07;
        g.addColorStop(0, `rgba(56, 189, 248, ${alpha * 1.4})`);
        g.addColorStop(0.45, `rgba(2, 132, 199, ${alpha})`);
        g.addColorStop(1, 'rgba(2, 132, 199, 0)');
      } else {
        const alpha = 0.04 + rand() * 0.075;
        g.addColorStop(0, `rgba(251, 113, 133, ${alpha * 1.4})`);
        g.addColorStop(0.45, `rgba(225, 29, 72, ${alpha})`);
        g.addColorStop(1, 'rgba(159, 18, 57, 0)');
      }
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // 3. Subtle Cosmic Lightning / Energy Filaments in the Left & Right Smoke
    ctx.save();
    for (let w = 0; w < 18; w++) {
      const isLeft = w % 2 === 0;
      let x = isLeft ? 20 + rand() * 140 : W - 20 - rand() * 140;
      let y = 140 + rand() * 680;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let seg = 0; seg < 6; seg++) {
        x += (rand() - 0.5) * 38;
        y += 18 + rand() * 28;
        ctx.lineTo(x, y);
      }
      ctx.strokeStyle = isLeft
        ? `rgba(125, 211, 252, ${0.08 + rand() * 0.1})`
        : `rgba(253, 164, 175, ${0.08 + rand() * 0.1})`;
      ctx.lineWidth = 0.8 + rand() * 1.2;
      ctx.stroke();
    }
    ctx.restore();

    // 4. Distant Stadium Crowd Tier Bokeh Lights (Upper & Lower Bowl)
    for (let i = 0; i < 220; i++) {
      const x = rand() * W;
      // Concentrate bokeh along the stadium tiers (y: 120..300 and y: 660..890)
      const inUpperTier = i < 90;
      const y = inUpperTier ? 110 + rand() * 210 : 650 + rand() * 240;
      // Keep center quieter
      const distCenter = Math.hypot(x - W / 2, y - H / 2);
      if (distCenter < 190) continue;

      const r = 0.8 + rand() * 2.2;
      const isLeft = x < W / 2;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      if (rand() < 0.25) {
        ctx.fillStyle = `rgba(254, 240, 138, ${0.15 + rand() * 0.35})`;
      } else if (isLeft) {
        ctx.fillStyle = `rgba(125, 211, 252, ${0.14 + rand() * 0.3})`;
      } else {
        ctx.fillStyle = `rgba(253, 164, 175, ${0.14 + rand() * 0.3})`;
      }
      ctx.fill();
    }

    // 5. Stadium Floodlight Beams from Top Corners
    ctx.save();
    const leftBeam = ctx.createLinearGradient(0, 40, W * 0.55, 460);
    leftBeam.addColorStop(0, 'rgba(56, 189, 248, 0.22)');
    leftBeam.addColorStop(0.5, 'rgba(14, 165, 233, 0.06)');
    leftBeam.addColorStop(1, 'rgba(14, 165, 233, 0)');
    ctx.fillStyle = leftBeam;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(190, 0);
    ctx.lineTo(340, 480);
    ctx.lineTo(0, 340);
    ctx.closePath();
    ctx.fill();

    const rightBeam = ctx.createLinearGradient(W, 40, W * 0.45, 460);
    rightBeam.addColorStop(0, 'rgba(244, 63, 94, 0.22)');
    rightBeam.addColorStop(0.5, 'rgba(225, 29, 72, 0.06)');
    rightBeam.addColorStop(1, 'rgba(225, 29, 72, 0)');
    ctx.fillStyle = rightBeam;
    ctx.beginPath();
    ctx.moveTo(W, 0);
    ctx.lineTo(W - 190, 0);
    ctx.lineTo(W - 340, 480);
    ctx.lineTo(W, 340);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // 6. Rising Ember & Ice Sparks in Lower Stadium Floor
    for (let i = 0; i < 85; i++) {
      const isLeft = rand() < 0.5;
      const x = isLeft ? rand() * (W * 0.48) : W * 0.52 + rand() * (W * 0.48);
      const y = 600 + rand() * 340;
      const r = 1.0 + rand() * 2.4;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = isLeft
        ? rand() < 0.3
          ? 'rgba(224, 242, 254, 0.65)'
          : 'rgba(56, 189, 248, 0.5)'
        : rand() < 0.35
          ? 'rgba(251, 191, 36, 0.65)'
          : 'rgba(251, 113, 133, 0.55)';
      ctx.fill();
    }

    // 7. Soft Center Vignette so the HUD and Circular Arena have maximum contrast
    const centerVignette = ctx.createRadialGradient(W / 2, H * 0.48, 120, W / 2, H * 0.48, 390);
    centerVignette.addColorStop(0, 'rgba(4, 7, 20, 0.55)');
    centerVignette.addColorStop(0.65, 'rgba(4, 7, 20, 0.18)');
    centerVignette.addColorStop(1, 'rgba(3, 5, 14, 0.42)');
    ctx.fillStyle = centerVignette;
    ctx.fillRect(0, 0, W, H);
  }, []);

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      {/* Procedural Volumetric Smoke, Floodlights & Stadium Bokeh Canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full object-cover" />

      {/* Detailed Vector Stadium Arches & Rim-Lit Rival Championship Athletes (#10 Left vs #7 Right) */}
      <svg
        viewBox="0 0 540 960"
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 w-full h-full"
      >
        <defs>
          <linearGradient id="leftPlayerBody" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.55" />
            <stop offset="45%" stopColor="#0c4a6e" stopOpacity="0.65" />
            <stop offset="100%" stopColor="#040817" stopOpacity="0.85" />
          </linearGradient>
          <linearGradient id="leftCyanRim" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#7dd3fc" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#0284c7" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="rightPlayerBody" x1="100%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#e11d48" stopOpacity="0.55" />
            <stop offset="45%" stopColor="#881337" stopOpacity="0.65" />
            <stop offset="100%" stopColor="#040817" stopOpacity="0.85" />
          </linearGradient>
          <linearGradient id="rightRedRim" x1="100%" y1="0%" x2="0%" y2="0%">
            <stop offset="0%" stopColor="#fda4af" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#e11d48" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Subtle Stadium Roof Arch & Upper Floodlight Rig */}
        <g opacity="0.22" stroke="#64748b" strokeWidth="1" fill="none">
          <path d="M-40,145 Q270,65 580,145" strokeWidth="1.5" />
          <path d="M-40,165 Q270,88 580,165" strokeDasharray="6 6" />
          <path d="M-40,860 Q270,815 580,860" opacity="0.5" />
        </g>

        {/* ============================================================
            LEFT RIVAL ATHLETE (#10 ELECTRIC BLUE — Visible on Left Edge & Below Circle)
           ============================================================ */}
        <g opacity="0.62">
          {/* Head & Athletic Hair Silhouette */}
          <path
            d="M66,188 C66,162 84,145 106,145 C128,145 144,162 144,188 C144,212 128,232 106,232 C84,232 66,212 66,188 Z"
            fill="url(#leftPlayerBody)"
            stroke="#38bdf8"
            strokeWidth="1.4"
            strokeOpacity="0.55"
          />
          {/* Torso & Jersey Shoulders */}
          <path
            d="M12,380 C16,285 45,242 86,236 L126,236 C168,242 195,285 204,380 L172,560 L34,560 Z"
            fill="url(#leftPlayerBody)"
            stroke="#38bdf8"
            strokeWidth="1.5"
            strokeOpacity="0.5"
          />
          {/* Vertical Albiceleste Stripes & #10 Crest */}
          <rect x="64" y="246" width="16" height="150" fill="#bae6fd" opacity="0.22" />
          <rect x="102" y="246" width="16" height="150" fill="#bae6fd" opacity="0.22" />
          <rect x="140" y="246" width="16" height="150" fill="#bae6fd" opacity="0.22" />

          {/* Shorts & Muscular Legs / Striped Socks below the Circular Arena (y: 620..880 matching reference!) */}
          <path
            d="M36,560 L170,560 L182,685 L122,685 L110,615 L96,685 L28,685 Z"
            fill="#082f49"
            stroke="#38bdf8"
            strokeWidth="1.2"
            strokeOpacity="0.45"
          />
          {/* Left Leg & Sock */}
          <path d="M44,685 L88,685 L76,845 L38,845 Z" fill="url(#leftPlayerBody)" />
          <rect x="41" y="755" width="40" height="8" fill="#7dd3fc" opacity="0.45" />
          <rect x="40" y="772" width="40" height="8" fill="#7dd3fc" opacity="0.45" />
          {/* Right Leg & Sock */}
          <path d="M126,685 L170,685 L186,845 L146,845 Z" fill="url(#leftPlayerBody)" />
          <rect x="138" y="755" width="40" height="8" fill="#7dd3fc" opacity="0.45" />
          <rect x="140" y="772" width="40" height="8" fill="#7dd3fc" opacity="0.45" />
        </g>

        {/* ============================================================
            RIGHT RIVAL ATHLETE (#7 CRIMSON RED — Visible on Right Edge & Below Circle)
           ============================================================ */}
        <g opacity="0.62">
          {/* Head & Sculpted Hair Silhouette */}
          <path
            d="M396,184 C396,158 412,140 434,140 C456,140 474,158 474,184 C474,210 456,228 434,228 C412,228 396,210 396,184 Z"
            fill="url(#rightPlayerBody)"
            stroke="#fb7185"
            strokeWidth="1.4"
            strokeOpacity="0.55"
          />
          {/* Torso & Broad Jersey Shoulders */}
          <path
            d="M336,380 C345,282 372,238 414,232 L454,232 C495,238 524,282 528,380 L506,560 L368,560 Z"
            fill="url(#rightPlayerBody)"
            stroke="#fb7185"
            strokeWidth="1.5"
            strokeOpacity="0.5"
          />
          {/* Subtle Shoulder Trim */}
          <path d="M352,290 L414,235 M454,235 L516,290" stroke="#fda4af" strokeWidth="3" opacity="0.3" />

          {/* Shorts & Muscular Legs / Socks below the Circular Arena (y: 620..880 matching reference!) */}
          <path
            d="M370,560 L504,560 L512,685 L444,685 L430,615 L418,685 L358,685 Z"
            fill="#4c0519"
            stroke="#fb7185"
            strokeWidth="1.2"
            strokeOpacity="0.45"
          />
          {/* Left Leg & Sock */}
          <path d="M370,685 L414,685 L394,845 L354,845 Z" fill="url(#rightPlayerBody)" />
          <rect x="360" y="755" width="40" height="8" fill="#fda4af" opacity="0.45" />
          <rect x="358" y="772" width="40" height="8" fill="#fbbf24" opacity="0.4" />
          {/* Right Leg & Sock */}
          <path d="M452,685 L496,685 L502,845 L464,845 Z" fill="url(#rightPlayerBody)" />
          <rect x="460" y="755" width="40" height="8" fill="#fda4af" opacity="0.45" />
          <rect x="461" y="772" width="40" height="8" fill="#fbbf24" opacity="0.4" />
        </g>

        {/* Bottom Stadium Pitch Turf & Dramatic Rim Shadow */}
        <rect x="0" y="840" width="540" height="120" fill="url(#bottomVignette)" opacity="0.85" />
        <defs>
          <linearGradient id="bottomVignette" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#050816" stopOpacity="0" />
            <stop offset="65%" stopColor="#040612" stopOpacity="0.88" />
            <stop offset="100%" stopColor="#02030a" stopOpacity="0.98" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
};
