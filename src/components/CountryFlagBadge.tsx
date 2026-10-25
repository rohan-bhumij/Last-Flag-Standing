import React, { useEffect, useRef } from 'react';
import { CountrySpec, drawCountryFlagOnContext } from '../data/countries';

interface CountryFlagBadgeProps {
  country: CountrySpec;
  size?: number;
  shielded?: boolean;
  eliminated?: boolean;
  className?: string;
}

const flagDataUrlCache = new Map<string, string>();

export function getCountryFlagDataUrl(country: CountrySpec, pixelSize = 64): string {
  const key = `${country.code}_${pixelSize}`;
  const cached = flagDataUrlCache.get(key);
  if (cached) return cached;

  if (typeof document === 'undefined') return '';
  const canvas = document.createElement('canvas');
  canvas.width = pixelSize;
  canvas.height = pixelSize;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const r = pixelSize / 2 - 2;
    drawCountryFlagOnContext(ctx, country, pixelSize / 2, pixelSize / 2, r);
    ctx.beginPath();
    ctx.arc(pixelSize / 2, pixelSize / 2, r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.lineWidth = Math.max(1.5, pixelSize * 0.04);
    ctx.stroke();
  }
  const url = canvas.toDataURL('image/png');
  flagDataUrlCache.set(key, url);
  return url;
}

export const CountryFlagBadge: React.FC<CountryFlagBadgeProps> = ({
  country,
  size = 28,
  shielded = false,
  eliminated = false,
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const px = Math.round(size * dpr);
    canvas.width = px;
    canvas.height = px;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, px, px);
    const cx = px / 2;
    const cy = px / 2;
    const r = px / 2 - (shielded ? 3 * dpr : 1.5 * dpr);

    drawCountryFlagOnContext(ctx, country, cx, cy, r);

    // Inner metallic rim
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = shielded ? '#00f5d4' : 'rgba(255, 255, 255, 0.82)';
    ctx.lineWidth = shielded ? 2.2 * dpr : 1.2 * dpr;
    ctx.stroke();

    if (eliminated) {
      ctx.fillStyle = 'rgba(4, 7, 20, 0.45)';
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [country, size, shielded, eliminated]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      style={{ width: `${size}px`, height: `${size}px` }}
      aria-label={`${country.name} flag`}
      title={`${country.name} (${country.abbr})`}
      className={`inline-block shrink-0 rounded-full ${className}`}
    />
  );
};
