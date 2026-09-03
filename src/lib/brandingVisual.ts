/**
 * Estilos visuales compartidos entre login y selector (fondo hero + acentos hex).
 */

import type { CSSProperties } from 'react';
import type { TallerBranding } from './tallerBranding';

export const ACCENT_HEX_FALLBACK = '#14b8a6';

/** Hex válido (#fff o #ffffff). Defensa contra valores corruptos en JSONB. */
export function safeBrandHex(v: unknown, fallback: string = ACCENT_HEX_FALLBACK): string {
  if (typeof v !== 'string') return fallback;
  const s = v.trim();
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(s) ? s : fallback;
}

export function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export type BrandingFullscreenHero = {
  outerStyle: CSSProperties;
  overlayStyle: CSSProperties;
};

/** Fondo a pantalla completa con imagen corporativa (misma lógica que el login). */
export function brandingFullscreenHeroStyle(
  branding: TallerBranding | null | undefined,
): BrandingFullscreenHero | null {
  const url = (branding?.background_url ?? '').trim();
  if (!url) return null;
  const primary = safeBrandHex(branding?.primary_color);
  const pos = (branding?.background_position && String(branding.background_position).trim()) || 'center';
  const outerStyle: CSSProperties = {
    backgroundColor: primary,
    backgroundImage: `url("${url}")`,
    backgroundSize: 'cover',
    backgroundPosition: pos,
    backgroundRepeat: 'no-repeat',
  };
  const overlayStyle: CSSProperties = {
    backgroundImage: `linear-gradient(180deg, ${hexToRgba(primary, 0.55)} 0%, ${hexToRgba(primary, 0.88)} 100%)`,
  };
  return { outerStyle, overlayStyle };
}
