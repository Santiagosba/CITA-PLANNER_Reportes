/** Paleta/accent global desde `ui_branding` (sin acoplar nombre de producto). */

import type { CSSProperties } from 'react'
import type { TallerBranding } from './tallerBranding'

export const DEFAULT_BRAND_PRIMARY = '#0d9488'
export const DEFAULT_BRAND_ACCENT = '#22d3ee'

export interface AccentPalette {
  50: string
  100: string
  200: string
  300: string
  400: string
  500: string
  600: string
  700: string
  800: string
  900: string
  950: string
}

export const ACCENT_PALETTES: Record<string, { palette: AccentPalette }> = {
  teal: {
    palette: {
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
    },
  },
}

const CSS_VAR_KEYS: (keyof AccentPalette)[] = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]

export function applyAccentPalette(palette: AccentPalette): void {
  const root = document.documentElement
  for (const shade of CSS_VAR_KEYS) {
    root.style.setProperty(`--accent-${shade}`, palette[shade])
  }
}

export function applyAccentById(id: string): void {
  if (id === 'custom') return
  const entry = ACCENT_PALETTES[id]
  if (entry) applyAccentPalette(entry.palette)
}

export function normalizeHex(input: string): string {
  let s = (input || '').trim()
  if (!s) return '#0d9488'
  if (!s.startsWith('#')) s = `#${s}`
  if (/^#[0-9a-f]{3}$/i.test(s)) {
    const r = s[1]
    const g = s[2]
    const b = s[3]
    s = `#${r}${r}${g}${g}${b}${b}`
  }
  if (!/^#[0-9a-f]{6}$/i.test(s)) return '#0d9488'
  return s.toLowerCase()
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const n = normalizeHex(hex)
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(n)
  if (!m) return null
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) }
}

export function rgbToHex(r: number, g: number, b: number): string {
  const c = (x: number) => Math.max(0, Math.min(255, Math.round(x)))
  return `#${c(r).toString(16).padStart(2, '0')}${c(g).toString(16).padStart(2, '0')}${c(b).toString(16).padStart(2, '0')}`
}

export function generateAccentPaletteFromHex(hexInput: string): AccentPalette {
  const base = hexToRgb(hexInput)
  if (!base) return ACCENT_PALETTES.teal.palette
  const W = { r: 255, g: 255, b: 255 }
  const K = { r: 15, g: 23, b: 42 }
  const mix = (a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }, t: number) =>
    rgbToHex(a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t)
  const B = base
  return {
    50: mix(W, B, 0.1),
    100: mix(W, B, 0.18),
    200: mix(W, B, 0.28),
    300: mix(W, B, 0.42),
    400: mix(W, B, 0.55),
    500: rgbToHex(B.r, B.g, B.b),
    600: mix(B, K, 0.14),
    700: mix(B, K, 0.28),
    800: mix(B, K, 0.42),
    900: mix(B, K, 0.55),
    950: mix(B, K, 0.68),
  }
}

export function applyCustomAccentHex(hex: string): void {
  applyAccentPalette(generateAccentPaletteFromHex(hex))
}

export function brandingCssVars(b: TallerBranding | null | undefined): CSSProperties {
  const primary = (b?.primary_color || '').trim() || DEFAULT_BRAND_PRIMARY
  const accent = (b?.accent_color || '').trim() || DEFAULT_BRAND_ACCENT
  const p = normalizeHex(primary)
  const a = normalizeHex(accent)
  return {
    '--license-primary': p,
    '--license-accent': a,
    '--brand-primary': p,
    '--brand-accent': a,
  } as CSSProperties
}

export function applyUiBrandingAccentPalette(b: TallerBranding | null | undefined): boolean {
  if (!b) return false
  const raw = (b.accent_color || '').trim() || DEFAULT_BRAND_ACCENT
  applyCustomAccentHex(normalizeHex(raw))
  return true
}

export function applyLicenseUiBrandingCssVars(
  branding: { primary_color?: string | null; accent_color?: string | null } | null | undefined,
): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  if (!branding) {
    root.style.removeProperty('--license-primary')
    root.style.removeProperty('--license-accent')
    root.style.removeProperty('--brand-primary')
    root.style.removeProperty('--brand-accent')
    return
  }
  const primary = (branding.primary_color || '').trim() || DEFAULT_BRAND_PRIMARY
  const accent = (branding.accent_color || '').trim() || DEFAULT_BRAND_ACCENT
  const p = normalizeHex(primary)
  const a = normalizeHex(accent)
  root.style.setProperty('--license-primary', p)
  root.style.setProperty('--license-accent', a)
  root.style.setProperty('--brand-primary', p)
  root.style.setProperty('--brand-accent', a)
}

const BRAND_ACCENT_STORAGE_KEY = 'hub_web_template_brand_accent_v1'

export function hydrateBrandAccentFromStorage(): void {
  try {
    const raw = localStorage.getItem(BRAND_ACCENT_STORAGE_KEY)
    if (!raw) return
    const v = JSON.parse(raw) as { accentId?: string; customHex?: string | null }
    if (!v?.accentId) return
    if (v.accentId === 'custom' && typeof v.customHex === 'string' && v.customHex.trim()) {
      applyCustomAccentHex(normalizeHex(v.customHex))
      return
    }
    if (ACCENT_PALETTES[v.accentId]) applyAccentById(v.accentId)
  } catch {
    /* ignore */
  }
}
