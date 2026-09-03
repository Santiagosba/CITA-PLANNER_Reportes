/**
 * operations.taller_web_activo: qué contenedor (idtaller) tiene qué web Hub (web_id → hub_webs.id) activa.
 */

import { supabaseOperations } from './supabase'
import { normalizeHubWebUuid } from './hubWebEnv'

export async function isContainerActiveForHubWeb(
  containerIdtaller: string,
  webId: string | null | undefined,
): Promise<boolean> {
  const tid = String(containerIdtaller || '').trim()
  const wid = normalizeHubWebUuid(webId)
  if (!tid || !wid) return false
  try {
    const { data, error } = await supabaseOperations
      .from('taller_web_activo')
      .select('idtaller')
      .eq('idtaller', tid)
      .eq('web_id', wid)
      .limit(1)
      .maybeSingle()
    return !error && !!data
  } catch {
    return false
  }
}

export async function fetchContainerIdsActiveForHubWeb(webId: string): Promise<string[]> {
  const wid = normalizeHubWebUuid(webId)
  if (!wid) return []
  try {
    const { data, error } = await supabaseOperations.from('taller_web_activo').select('idtaller').eq('web_id', wid)
    if (error || !Array.isArray(data)) return []
    const set = new Set<string>()
    for (const r of data) {
      const id = String((r as { idtaller?: unknown }).idtaller ?? '').trim()
      if (id) set.add(id)
    }
    return [...set]
  } catch {
    return []
  }
}

export async function filterContainerIdsActiveForHubWeb(webId: string, candidates: string[]): Promise<Set<string>> {
  const wid = normalizeHubWebUuid(webId)
  const ids = [...new Set(candidates.map((x) => String(x || '').trim()).filter(Boolean))]
  if (!wid || ids.length === 0) return new Set()
  try {
    const { data, error } = await supabaseOperations
      .from('taller_web_activo')
      .select('idtaller')
      .eq('web_id', wid)
      .in('idtaller', ids)
    if (error || !Array.isArray(data)) return new Set()
    const set = new Set<string>()
    for (const r of data) {
      const id = String((r as { idtaller?: unknown }).idtaller ?? '').trim()
      if (id) set.add(id)
    }
    return set
  } catch {
    return new Set()
  }
}
