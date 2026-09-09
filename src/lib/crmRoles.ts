/**
 * Rol de la app CRM (taller), distinto de AviAdmin global.
 * Solo `app_metadata` concede privilegios; `user_metadata` lo edita el usuario.
 */

import { isDemoAsesor } from './demoAsesores'
import { readLocalPreview } from './localPreview'
import { isGlobalAviAdmin } from './operationsConnect'
import type { DashboardShellRoute } from '../components/Sidebar'

export type CrmAppRole = 'admin' | 'asesor'

const ADMIN_APP_ROLES = new Set(['admin', 'aviadmin', 'taller_admin', 'jefe', 'responsable'])

/** Admins de taller por email (no son AviAdmin global). */
export const TALLER_ADMIN_EMAILS = ['santy@gmail.com'] as const

function sessionEmail(sessionUser: unknown): string {
  const record = sessionUser as { email?: unknown } | null
  return String(record?.email ?? '').trim().toLowerCase()
}

export function isTallerAdminEmail(email: string | null | undefined): boolean {
  const e = String(email ?? '').trim().toLowerCase()
  return TALLER_ADMIN_EMAILS.some((item) => item.toLowerCase() === e)
}

export function resolveCrmAppRole(sessionUser: unknown): CrmAppRole {
  const preview = readLocalPreview()
  if (preview) return preview.role
  if (isTallerAdminEmail(sessionEmail(sessionUser))) return 'admin'
  if (isDemoAsesor(sessionUser)) return 'asesor'
  if (isGlobalAviAdmin({ user: sessionUser })) return 'admin'

  const record = sessionUser as { app_metadata?: Record<string, unknown> } | null
  const am = record?.app_metadata && typeof record.app_metadata === 'object' ? record.app_metadata : {}
  const role = String(am.role ?? am.user_role ?? '').trim().toLowerCase()
  if (ADMIN_APP_ROLES.has(role)) return 'admin'
  return 'asesor'
}

export function crmAppRoleLabel(role: CrmAppRole): string {
  return role === 'admin' ? 'Admin' : 'Asesor'
}

export const ADMIN_SHELL_ROUTES: DashboardShellRoute[] = [
  'dashboard-general',
  'pending-citas',
  'equipos',
  'asignar-tarea',
  'stats-equipo',
  'boards',
  'laura',
  'bot-identity',
  'reportes',
  'configuration',
]

export const ASESOR_SHELL_ROUTES: DashboardShellRoute[] = [
  'dashboard-general',
  'pending-citas',
  'equipos',
  'tareas-hoy',
  'boards',
  'laura',
  'configuration',
]

export function defaultRouteForRole(role: CrmAppRole): DashboardShellRoute {
  return 'dashboard-general'
}

export function routeAllowedForRole(route: DashboardShellRoute, role: CrmAppRole): boolean {
  return role === 'admin' ? ADMIN_SHELL_ROUTES.includes(route) : ASESOR_SHELL_ROUTES.includes(route)
}

/** Rol activo en el escritorio; el teléfono lo usa para ocultar costes Telnyx. */
let boundCrmAppRole: CrmAppRole | null = null

export function bindCrmAppRole(role: CrmAppRole | null): void {
  boundCrmAppRole = role
}

export function canSeeTelnyxCosts(role?: CrmAppRole | null): boolean {
  const resolved = role ?? boundCrmAppRole ?? readLocalPreview()?.role ?? null
  return resolved === 'admin'
}
