/**
 * Modelo licencia/contenedor Hub Connect (UUID web + taller_web_activo + RPC talleres).
 */

import { supabaseOperations } from './supabase'
import { getCrmHubWebIdFromEnv } from './hubWebEnv'
import { isGlobalAviAdmin } from './operationsConnect'
import { parseConnectSiteIds, scopedSitesEmptyDenied, sessionAllowsThisHubWeb } from './connectSiteScope'
import {
  fetchContainerIdsActiveForHubWeb,
  filterContainerIdsActiveForHubWeb,
  isContainerActiveForHubWeb,
} from './tallerWebActivo'

const ACC_SELECT = 'idtaller, idlicenciagrupo, nombre_personalizado, slug, data_schema'

export interface ContainerRow {
  idtaller: string
  hubWebId: string | null
  idlicenciagrupo: string | null
  nombre_personalizado: string | null
  slug: string | null
  data_schema: string | null
  isModuleActive: boolean
}

function mapContainerFields(
  row: Record<string, unknown>,
  crmWebId: string | null,
  activeSet: Set<string>,
): ContainerRow | null {
  const idtaller = String(row.idtaller || '').trim()
  if (!idtaller) return null
  const active = activeSet.has(idtaller)
  return {
    idtaller,
    hubWebId: crmWebId && active ? crmWebId : null,
    idlicenciagrupo:
      row.idlicenciagrupo == null || String(row.idlicenciagrupo).trim() === ''
        ? null
        : String(row.idlicenciagrupo),
    nombre_personalizado: (row.nombre_personalizado ?? null) as string | null,
    slug: (row.slug ?? null) as string | null,
    data_schema: (row.data_schema ?? null) as string | null,
    isModuleActive: active,
  }
}

export async function fetchContainerRow(containerIdtaller: string): Promise<ContainerRow | null> {
  if (!containerIdtaller) return null
  const webId = getCrmHubWebIdFromEnv()
  try {
    const { data, error } = await supabaseOperations
      .from('talleres_accesibles')
      .select(ACC_SELECT)
      .eq('idtaller', containerIdtaller)
      .maybeSingle()
    if (error || !data) return null
    const active = webId != null ? await isContainerActiveForHubWeb(containerIdtaller, webId) : false
    const set = new Set(active && webId ? [containerIdtaller] : [])
    return mapContainerFields(data as Record<string, unknown>, webId, set)
  } catch {
    return null
  }
}

export async function fetchAllActiveContainers(): Promise<ContainerRow[]> {
  const webId = getCrmHubWebIdFromEnv()
  if (!webId) return []
  const ids = await fetchContainerIdsActiveForHubWeb(webId)
  return fetchContainersByIds(ids)
}

export async function fetchUserContainerIds(userId: string | null | undefined, legacyId: string | null | undefined): Promise<string[]> {
  const filters: string[] = []
  if (userId) filters.push(`user_id.eq.${userId}`)
  if (legacyId) filters.push(`legacy_idusuario.eq.${legacyId}`)
  if (filters.length === 0) return []
  try {
    const { data } = await supabaseOperations.from('taller_users').select('idtaller').or(filters.join(','))
    if (!Array.isArray(data)) return []
    const set = new Set<string>()
    for (const r of data) {
      const v = String((r as { idtaller?: unknown }).idtaller ?? '').trim()
      if (v) set.add(v)
    }
    return [...set]
  } catch {
    return []
  }
}

export async function fetchContainersByIds(ids: string[]): Promise<ContainerRow[]> {
  if (!Array.isArray(ids) || ids.length === 0) return []
  const webId = getCrmHubWebIdFromEnv()
  try {
    const { data, error } = await supabaseOperations.from('talleres_accesibles').select(ACC_SELECT).in('idtaller', ids)
    if (error || !Array.isArray(data)) return []
    const activeSet = webId ? await filterContainerIdsActiveForHubWeb(webId, ids) : new Set<string>()
    return data.map((r) => mapContainerFields(r as Record<string, unknown>, webId, activeSet)).filter((r): r is ContainerRow => r !== null)
  } catch {
    return []
  }
}

export interface LicenciaTaller {
  idtaller: string
  nombre: string | null
  activo: boolean
  direccion?: string | null
  poblacion?: string | null
  logo?: string | null
  data_schema?: string | null
}

export async function fetchLicenciaModuleTalleres(idlicenciagrupo: string, webId?: string | null): Promise<LicenciaTaller[]> {
  if (!idlicenciagrupo) return []
  const wid = webId?.trim() || getCrmHubWebIdFromEnv()
  if (!wid) return []
  try {
    const { data, error } = await supabaseOperations.rpc('licencia_module_talleres', {
      p_idlicenciagrupo: idlicenciagrupo,
      p_web_id: wid,
    })
    if (error || !Array.isArray(data)) return []
    return (data as Record<string, unknown>[])
      .map((r) => ({
        idtaller: String(r.idtaller ?? r.id ?? '').trim(),
        nombre: (r.nombre ?? r.taller ?? r.name ?? null) as string | null,
        activo: r.activo === true,
        direccion: (r.direccion ?? null) as string | null,
        poblacion: (r.poblacion ?? r.ciudad ?? null) as string | null,
        logo: (r.logo ?? null) as string | null,
        data_schema: (r.data_schema ?? null) as string | null,
      }))
      .filter((r) => r.idtaller !== '' && r.activo === true)
  } catch {
    return []
  }
}

export type NonAdminBaseRoute = {
  containerIdTaller: string
  slug: string | null
}

export async function resolveNonAdminBaseRoute(session: { user?: any } | null | undefined): Promise<NonAdminBaseRoute | null> {
  const user = session?.user
  if (!user) return null
  const crmWebId = getCrmHubWebIdFromEnv()
  if (!crmWebId) return null

  const userId = user.id ?? null
  const legacyId = user.user_metadata?.legacy_id ?? null
  const parse = parseConnectSiteIds(user)
  const isAdmin = isGlobalAviAdmin(session)

  if (!isAdmin && scopedSitesEmptyDenied(parse)) return null
  if (!isAdmin && !sessionAllowsThisHubWeb(parse, crmWebId, false)) return null

  const ids = await fetchUserContainerIds(userId, legacyId)
  if (ids.length === 0) return null
  const containers = await fetchContainersByIds(ids)
  const visible = containers.filter((c) => c.isModuleActive)
  if (visible.length === 0) return null

  const withSlug = visible.filter((c) => c.slug && String(c.slug).trim() !== '')
  let pick: ContainerRow
  if (withSlug.length > 0) {
    withSlug.sort((a, b) => String(a.slug).localeCompare(String(b.slug), 'es', { sensitivity: 'base', numeric: true }))
    pick = withSlug[0]
  } else {
    visible.sort((a, b) => a.idtaller.localeCompare(b.idtaller))
    pick = visible[0]
  }

  const slugRaw = pick.slug != null ? String(pick.slug).trim() : ''
  return {
    containerIdTaller: pick.idtaller,
    slug: slugRaw !== '' ? slugRaw : null,
  }
}
