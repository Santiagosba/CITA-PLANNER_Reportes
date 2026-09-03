/**
 * Fila `operations.hub_webs` del despliegue (favicon `icon_image_url`).
 */

import { supabaseOperations } from './supabase'
import { getCrmHubWebIdFromEnv } from './hubWebEnv'
import { HUB_WEB_SLUG_CRM } from './hubSites'

export const CRM_FAVICON_FALLBACK_HREF = '/favicon.svg'

export interface CrmHubWebBranding {
  id: string
  slug: string | null
  name: string | null
  icon_image_url: string | null
}

function pickRow(raw: Record<string, unknown> | null | undefined): CrmHubWebBranding | null {
  if (!raw || typeof raw !== 'object') return null
  const id = String((raw as { id?: unknown }).id || '').trim()
  if (!id) return null
  const slug = (raw as { slug?: unknown }).slug
  const name = (raw as { name?: unknown }).name
  const icon = (raw as { icon_image_url?: unknown }).icon_image_url
  const iconStr = typeof icon === 'string' ? icon.trim() : ''
  return {
    id,
    slug: typeof slug === 'string' && slug.trim() ? slug.trim() : null,
    name: typeof name === 'string' && name.trim() ? name.trim() : null,
    icon_image_url: iconStr || null,
  }
}

export async function fetchCrmHubWebBranding(): Promise<CrmHubWebBranding | null> {
  try {
    const hubId = getCrmHubWebIdFromEnv()
    if (hubId) {
      const { data, error } = await supabaseOperations
        .from('hub_webs')
        .select('id, slug, name, icon_image_url')
        .eq('id', hubId)
        .maybeSingle()
      if (error || !data) return null
      return pickRow(data as Record<string, unknown>)
    }
    const slugEnv = (import.meta.env.VITE_HUB_WEB_SLUG || '').trim().toLowerCase()
    const slug = slugEnv || HUB_WEB_SLUG_CRM
    const { data, error } = await supabaseOperations
      .from('hub_webs')
      .select('id, slug, name, icon_image_url')
      .ilike('slug', slug)
      .maybeSingle()
    if (error || !data) return null
    return pickRow(data as Record<string, unknown>)
  } catch {
    return null
  }
}
