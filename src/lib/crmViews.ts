/**
 * Vistas del CRM que el super admin puede activar por licencia (grupo de dealers).
 * Si no hay config, el admin de esa licencia ve todas.
 */

import type { DashboardShellRoute } from '../components/Sidebar'
import { supabaseOperations } from './supabase'
import { brandingContainerId } from './tallerBranding'

export const CRM_VIEWS_CONFIG_KEY = 'crm_views' as const

export type LicenseViewId = Exclude<DashboardShellRoute, 'licencias' | 'configuration' | 'contrasenas' | 'reportes'>

export type LicenseViewOption = {
  id: LicenseViewId
  label: string
  hint: string
}

export const LICENSE_VIEW_CATALOG: LicenseViewOption[] = [
  { id: 'dashboard-general', label: 'Dashboard', hint: 'Resumen del taller' },
  { id: 'boards', label: 'Gestor de tableros', hint: 'Trabajo de hoy por tipo' },
  { id: 'pending-citas', label: 'Triage operativo', hint: 'Consultas y calendario' },
  { id: 'equipos', label: 'Cuentas y equipos', hint: 'Gente y grupos' },
  { id: 'asignar-tarea', label: 'Asignar tarea', hint: 'Repartir trabajo' },
  { id: 'tareas-hoy', label: 'Historial', hint: 'Consultas del periodo' },
  { id: 'stats-equipo', label: 'Operadores', hint: 'Ficha, tickets y rendimiento' },
  { id: 'gasto-ia', label: 'Gasto IA', hint: 'Tokens de OpenAI' },
  { id: 'laura', label: 'Asistente de IA', hint: 'Laura y costes Telnyx' },
  { id: 'bot-identity', label: 'Identidad del bot', hint: 'Voz y foto del asistente' },
]

export const DEFAULT_LICENSE_VIEWS: LicenseViewId[] = LICENSE_VIEW_CATALOG.map((item) => item.id)

const KNOWN = new Set<string>(DEFAULT_LICENSE_VIEWS)

export function parseLicenseViews(raw: unknown): LicenseViewId[] | null {
  if (raw == null) return null
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray((raw as { routes?: unknown }).routes)
      ? (raw as { routes: unknown[] }).routes
      : null
  if (!list) return null
  const next = list
    .map((item) => String(item || '').trim())
    .filter((item): item is LicenseViewId => KNOWN.has(item))
  return next
}

export function resolveLicenseViews(raw: unknown): LicenseViewId[] {
  return parseLicenseViews(raw) ?? DEFAULT_LICENSE_VIEWS
}

export function licenseViewEnabled(views: LicenseViewId[] | null | undefined, route: string): boolean {
  if (route === 'configuration' || route === 'licencias') return true
  if (!views) return true
  return views.includes(route as LicenseViewId)
}

export async function fetchLicenseViews(containerId: string): Promise<LicenseViewId[] | null> {
  const id = brandingContainerId({ containerIdTaller: containerId })
  if (!id || id === 'local-preview') return null
  try {
    const { data, error } = await supabaseOperations
      .from('crm_config')
      .select('config_value')
      .eq('idtaller', id)
      .eq('config_key', CRM_VIEWS_CONFIG_KEY)
      .maybeSingle()
    if (error || !data) return null
    return parseLicenseViews((data as { config_value?: unknown }).config_value)
  } catch {
    return null
  }
}
