/**
 * operations: rutas por slug (`talleres_accesibles`), activación por web (`taller_web_activo`) y JWT.
 */

import { supabase, supabaseOperations } from './supabase'
import { isAviAdminProfile } from './aviAdminGate'
import { isDemoAsesor } from './demoAsesores'
import { getCrmHubWebIdFromEnv } from './hubWebEnv'
import { parseConnectSiteIds, sessionAllowsThisHubWeb } from './connectSiteScope'
import { isContainerActiveForHubWeb } from './tallerWebActivo'

const ACC_ROUTE_SELECT = 'idtaller, nombre_personalizado, slug, data_schema'

export interface ConnectRoute {
  idtaller: string
  slug: string
  nombrePersonalizado: string | null
  dataSchema: string
  hubWebId: string | null
}

export function isGlobalAviAdmin(session: { user?: any } | null | undefined): boolean {
  const user = session?.user
  if (!user) return false
  const um = (user.user_metadata && typeof user.user_metadata === 'object' ? user.user_metadata : {}) as Record<
    string,
    unknown
  >
  const am = (user.app_metadata && typeof user.app_metadata === 'object' ? user.app_metadata : {}) as Record<
    string,
    unknown
  >
  const roleRaw = (um.role ?? am.role ?? '') as unknown
  const role = String(roleRaw).trim().toLowerCase()
  if (role === 'aviadmin' || role === 'admin') return true
  return isAviAdminProfile(user.email ?? null, (um.role as string | undefined) ?? null)
}

/** Admin real o asesor de prueba: puede listar talleres y ver toda la bandeja. */
export function canBrowseAllWorkshops(session: { user?: unknown } | null | undefined): boolean {
  if (isGlobalAviAdmin(session)) return true
  return isDemoAsesor(session?.user)
}

export async function fetchRouteBySlug(slug: string): Promise<ConnectRoute | null> {
  if (!slug) return null
  const crmWebId = getCrmHubWebIdFromEnv()
  if (!crmWebId) return null
  try {
    const { data, error } = await supabaseOperations
      .from('talleres_accesibles')
      .select(ACC_ROUTE_SELECT)
      .ilike('slug', slug)
      .limit(1)
      .maybeSingle()
    if (error || !data) return null
    const row = data as Record<string, unknown>
    const idtaller = String(row.idtaller || '')
    const slugDb = (row.slug ?? null) as string | null
    if (!idtaller || !slugDb) return null
    const active = await isContainerActiveForHubWeb(idtaller, crmWebId)
    if (!active) return null
    return {
      idtaller,
      slug: String(slugDb),
      nombrePersonalizado: ((row.nombre_personalizado ?? null) as string | null) || null,
      dataSchema: ((row.data_schema ?? null) as string | null) || 'public',
      hubWebId: crmWebId,
    }
  } catch {
    return null
  }
}

export async function fetchConnectRouteByContainerId(idtaller: string): Promise<ConnectRoute | null> {
  if (!idtaller) return null
  const crmWebId = getCrmHubWebIdFromEnv()
  if (!crmWebId) return null
  try {
    const { data, error } = await supabaseOperations
      .from('talleres_accesibles')
      .select(ACC_ROUTE_SELECT)
      .eq('idtaller', idtaller)
      .maybeSingle()
    if (error || !data) return null
    const row = data as Record<string, unknown>
    const id = String(row.idtaller || '')
    const slugDb = (row.slug ?? null) as string | null
    if (!id) return null
    const active = await isContainerActiveForHubWeb(id, crmWebId)
    if (!active) return null
    return {
      idtaller: id,
      slug: slugDb ? String(slugDb).trim() : '',
      nombrePersonalizado: ((row.nombre_personalizado ?? null) as string | null) || null,
      dataSchema: ((row.data_schema ?? null) as string | null) || 'public',
      hubWebId: crmWebId,
    }
  } catch {
    return null
  }
}

export async function fetchSlugForTaller(idtaller: string): Promise<string | null> {
  if (!idtaller) return null
  try {
    const { data, error } = await supabaseOperations
      .from('talleres_accesibles')
      .select('slug')
      .eq('idtaller', idtaller)
      .limit(1)
      .maybeSingle()
    if (error || !data) return null
    const slug = (data as { slug?: string | null }).slug
    return slug ? String(slug) : null
  } catch {
    return null
  }
}

export async function userMayAccessTaller(
  session: { user?: any } | null | undefined,
  idtaller: string,
  legacyId?: string | null,
): Promise<boolean> {
  if (!session?.user || !idtaller) return false

  const crmWebId = getCrmHubWebIdFromEnv()
  if (!crmWebId) return false

  const active = await isContainerActiveForHubWeb(idtaller, crmWebId)
  if (!active) return false

  if (isGlobalAviAdmin(session)) return true

  const parse = parseConnectSiteIds(session.user)
  if (!sessionAllowsThisHubWeb(parse, crmWebId, false)) return false

  try {
    const userId = String(session.user.id || '')
    if (userId) {
      const { data, error } = await supabaseOperations
        .from('taller_users')
        .select('idtaller')
        .eq('idtaller', idtaller)
        .eq('user_id', userId)
        .limit(1)
        .maybeSingle()
      if (!error && data) return true
    }

    if (legacyId && String(legacyId).trim() !== '') {
      const { data, error } = await supabaseOperations
        .from('taller_users')
        .select('idtaller')
        .eq('idtaller', idtaller)
        .eq('legacy_idusuario', legacyId)
        .limit(1)
        .maybeSingle()
      if (!error && data) return true
    }
    return false
  } catch {
    return false
  }
}

export async function ensureFreshSession(): Promise<unknown> {
  try {
    const { data } = await supabase.auth.getSession()
    return data?.session ?? null
  } catch {
    return null
  }
}
