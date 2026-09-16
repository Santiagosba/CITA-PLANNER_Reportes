/**
 * Modelo grupo → licencias → centros (en datos, las licencias siguen en tablas de taller).
 */

import { filterCrmUuids, isCrmUuid } from './crmUuid'
import { supabaseAviOld, supabaseOperations } from './supabase'
import { fetchAllSupabasePages } from './supabaseFetchAll'
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
  if (!isCrmUuid(containerIdtaller)) return null
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
  ids = filterCrmUuids(ids)
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

export type TallerCentro = {
  idcentro: string
  idtaller: string
  nombre: string
  direccion?: string | null
  poblacion?: string | null
}

function mapCentroRow(row: Record<string, unknown>): TallerCentro | null {
  const idcentro = String(row.idcentro ?? '').trim()
  const idtaller = String(row.idtaller ?? '').trim().toLowerCase()
  if (!idcentro || !idtaller) return null
  return {
    idcentro,
    idtaller,
    nombre: String(row.nombre ?? 'Centro').trim() || 'Centro',
    direccion: (row.direccion ?? null) as string | null,
    poblacion: (row.poblacion ?? null) as string | null,
  }
}

/** Centros de las licencias de un grupo. RPC: el admin del grupo no lee aviold.centros a pelo. */
export async function fetchCentrosForGrupo(
  idlicenciagrupo: string,
  webId?: string | null,
): Promise<TallerCentro[]> {
  if (!idlicenciagrupo) return []
  const wid = webId?.trim() || getCrmHubWebIdFromEnv()
  if (!wid) return []
  try {
    const { data, error } = await supabaseOperations.rpc('licencia_module_centros_list', {
      p_idlicenciagrupo: idlicenciagrupo,
      p_web_id: wid,
    })
    if (error || !Array.isArray(data)) return []
    return (data as Record<string, unknown>[])
      .filter((row) => row.activo !== false)
      .map((row) => mapCentroRow(row))
      .filter((row): row is TallerCentro => row !== null)
  } catch {
    return []
  }
}

export async function fetchCentrosForTalleres(idtalleres: string[]): Promise<TallerCentro[]> {
  const ids = filterCrmUuids(idtalleres)
  if (ids.length === 0) return []
  try {
    const mapped: TallerCentro[] = []
    for (let i = 0; i < ids.length; i += 80) {
      const chunk = ids.slice(i, i + 80)
      const data = await fetchAllSupabasePages<Record<string, unknown>>(() =>
        supabaseAviOld
          .from('centros')
          .select('idcentro, idtaller, nombre, direccion, poblacion')
          .in('idtaller', chunk)
          .is('fechabaja', null)
          .order('nombre', { ascending: true }),
      )
      for (const row of data) {
        const mappedRow = mapCentroRow(row)
        if (mappedRow) mapped.push(mappedRow)
      }
    }
    return mapped
  } catch {
    return []
  }
}

export type NonAdminBaseRoute = {
  containerIdTaller: string
  slug: string | null
  /** Varios grupos activos: el usuario elige grupo, luego licencia y centro. */
  mustPickLicense: boolean
}

export async function listUserActiveContainers(
  session: { user?: any } | null | undefined,
): Promise<ContainerRow[]> {
  const user = session?.user
  if (!user) return []
  const crmWebId = getCrmHubWebIdFromEnv()
  if (!crmWebId) return []

  const userId = user.id ?? null
  const legacyId = user.user_metadata?.legacy_id ?? null
  const parse = parseConnectSiteIds(user)
  const isAdmin = isGlobalAviAdmin(session)

  if (!isAdmin && scopedSitesEmptyDenied(parse)) return []
  if (!isAdmin && !sessionAllowsThisHubWeb(parse, crmWebId, false)) return []

  const ids = await fetchUserContainerIds(userId, legacyId)
  if (ids.length === 0) return []
  const containers = await fetchContainersByIds(ids)
  return containers.filter((c) => c.isModuleActive)
}

export async function resolveNonAdminBaseRoute(session: { user?: any } | null | undefined): Promise<NonAdminBaseRoute | null> {
  const visible = await listUserActiveContainers(session)
  if (visible.length === 0) return null
  if (visible.length > 1) {
    return { containerIdTaller: '', slug: null, mustPickLicense: true }
  }

  const pick = visible[0]
  const slugRaw = pick.slug != null ? String(pick.slug).trim() : ''
  return {
    containerIdTaller: pick.idtaller,
    slug: slugRaw !== '' ? slugRaw : null,
    mustPickLicense: false,
  }
}
