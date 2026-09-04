import type { CSSProperties } from 'react';

const PALETTE_TEAL = {
  50: '#f0fdfa',
  100: '#ccfbf1',
  200: '#99f6e4',
  300: '#5eead4',
  400: '#2dd4bf',
  500: '#14b8a6',
  600: '#0d9488',
  700: '#0f766e',
  800: '#115e59',
  900: '#134e4a',
  950: '#042f2e',
} as const;

const KEYS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;

/** Variables globales tipo CRM (`applyAccentPalette` / `--accent-*`). */
export function applyTealAccentVars(): void {
  const root = document.documentElement;
  for (const k of KEYS) {
    root.style.setProperty(`--accent-${k}`, PALETTE_TEAL[k]);
  }
}

export type UiBranding = {
  logoUrl?: string | null;
  primaryColorHex?: string | null;
  backgroundUrl?: string | null;
  displayName?: string | null;
};

export function brandingInlineStyle(b: UiBranding | null | undefined): CSSProperties {
  const primary = (b?.primaryColorHex ?? '#0b63d6').trim();
  const accent = '#60a5fa';
  return {
    '--brand-primary': primary,
    '--brand-accent': accent,
  } as CSSProperties;
}
