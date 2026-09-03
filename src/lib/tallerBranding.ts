/**
 * Branding por taller (`operations.crm_config` ui_branding + storage).
 */

import { supabase, supabaseOperations, supabaseUrl } from './supabase'

export const BRANDING_BUCKET = 'taller-branding'

export const BRANDING_CONFIG_KEY = 'ui_branding' as const

export function brandingContainerId(workshop: {
  containerIdTaller?: string | null
  originalId?: number | string | null
} | null | undefined): string {
  const c = workshop?.containerIdTaller != null ? String(workshop.containerIdTaller).trim() : ''
  if (c) return c
  return workshop?.originalId != null ? String(workshop.originalId).trim() : ''
}

export interface TallerBranding {
  primary_color?: string | null
  accent_color?: string | null
  logo_url?: string | null
  background_url?: string | null
  background_position?: string | null
  updated_at?: string | null
}

export type BrandingAssetKind = 'logo' | 'background'

function pickStr(v: unknown, key: string): string | null {
  if (!v || typeof v !== 'object') return null
  const x = (v as Record<string, unknown>)[key]
  if (typeof x !== 'string') return null
  const t = x.trim()
  return t === '' ? null : t
}

function normalizeBranding(raw: unknown): TallerBranding | null {
  if (!raw || typeof raw !== 'object') return null
  const out: TallerBranding = {
    primary_color: pickStr(raw, 'primary_color'),
    accent_color: pickStr(raw, 'accent_color'),
    logo_url: pickStr(raw, 'logo_url'),
    background_url: pickStr(raw, 'background_url'),
    background_position: pickStr(raw, 'background_position'),
    updated_at: pickStr(raw, 'updated_at'),
  }
  const empty =
    !out.primary_color &&
    !out.accent_color &&
    !out.logo_url &&
    !out.background_url &&
    !out.background_position
  return empty ? null : out
}

export async function fetchTallerBranding(idtaller: string): Promise<TallerBranding | null> {
  if (!idtaller) return null
  try {
    const { data, error } = await supabaseOperations
      .from('crm_config')
      .select('config_value')
      .eq('idtaller', idtaller)
      .eq('config_key', BRANDING_CONFIG_KEY)
      .maybeSingle()
    if (error || !data) return null
    return normalizeBranding((data as { config_value?: unknown }).config_value)
  } catch {
    return null
  }
}

export async function saveTallerBranding(idtaller: string, patch: Partial<TallerBranding>): Promise<TallerBranding | null> {
  if (!idtaller) return null
  try {
    const current = (await fetchTallerBranding(idtaller)) ?? {}
    const merged: TallerBranding = {
      ...current,
      ...patch,
      updated_at: new Date().toISOString(),
    }
    const { error } = await supabaseOperations.from('crm_config').upsert(
      {
        idtaller,
        config_key: BRANDING_CONFIG_KEY,
        config_value: merged,
        updated_at: merged.updated_at,
      },
      { onConflict: 'idtaller,config_key' },
    )
    if (error) return null
    return merged
  } catch {
    return null
  }
}

function publicUrlFor(idtaller: string, kind: BrandingAssetKind, ext: string): string {
  const cleanExt = ext.replace(/^\./, '').toLowerCase()
  const path = `${idtaller}/${kind}.${cleanExt}`
  const base = (supabaseUrl || '').replace(/\/$/, '')
  return `${base}/storage/v1/object/public/${BRANDING_BUCKET}/${path}`
}

function extFromFile(file: File): string {
  const name = file.name || ''
  const dot = name.lastIndexOf('.')
  if (dot >= 0 && dot < name.length - 1) return name.slice(dot + 1).toLowerCase()
  const mt = (file.type || '').toLowerCase()
  if (mt === 'image/jpeg' || mt === 'image/jpg') return 'jpg'
  if (mt === 'image/png') return 'png'
  if (mt === 'image/webp') return 'webp'
  if (mt === 'image/svg+xml') return 'svg'
  if (mt === 'image/gif') return 'gif'
  return 'png'
}

export async function uploadBrandingAsset(idtaller: string, kind: BrandingAssetKind, file: File): Promise<string | null> {
  if (!idtaller || !file) return null
  try {
    const ext = extFromFile(file)
    const objectPath = `${idtaller}/${kind}.${ext}`
    const { error: upErr } = await supabase.storage.from(BRANDING_BUCKET).upload(objectPath, file, {
      upsert: true,
      contentType: file.type || undefined,
      cacheControl: '3600',
    })
    if (upErr) return null

    const stableUrl = publicUrlFor(idtaller, kind, ext)
    const patch: Partial<TallerBranding> = kind === 'logo' ? { logo_url: stableUrl } : { background_url: stableUrl }
    const saved = await saveTallerBranding(idtaller, patch)
    if (!saved) return null
    return `${stableUrl}?t=${Date.now()}`
  } catch {
    return null
  }
}

export async function deleteBrandingAsset(idtaller: string, kind: BrandingAssetKind, ext: string): Promise<boolean> {
  if (!idtaller || !ext) return false
  try {
    const cleanExt = ext.replace(/^\./, '').toLowerCase()
    const objectPath = `${idtaller}/${kind}.${cleanExt}`
    await supabase.storage.from(BRANDING_BUCKET).remove([objectPath])

    const patch: Partial<TallerBranding> = kind === 'logo' ? { logo_url: null } : { background_url: null }
    const saved = await saveTallerBranding(idtaller, patch)
    return !!saved
  } catch {
    return false
  }
}
