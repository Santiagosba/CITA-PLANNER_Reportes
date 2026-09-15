/**
 * Rol de la app CRM (taller), distinto de AviAdmin global.
 * Super admin: todos los talleres. Admin de taller / asesor: solo los suyos.
 * Solo `app_metadata` concede privilegios; `user_metadata` lo edita el usuario.
 */

import { isDemoAsesor } from './demoAsesores'
import { isSuperAdminUser, isTallerAdminUser } from './crmAccess'
import { readLocalPreview } from './localPreview'
import type { DashboardShellRoute } from '../components/Sidebar'

export type CrmAppRole = 'admin' | 'asesor'

const ADMIN_APP_ROLES = new Set(['admin', 'aviadmin', 'taller_admin', 'jefe', 'responsable'])

/** @deprecated El super admin ya no se decide solo por este email; se mantiene por compatibilidad. */
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
  if (isDemoAsesor(sessionUser)) return 'asesor'
  if (isSuperAdminUser(sessionUser) || isTallerAdminUser(sessionUser)) return 'admin'
  if (isTallerAdminEmail(sessionEmail(sessionUser))) return 'admin'

  const record = sessionUser as { app_metadata?: Record<string, unknown> } | null
  const am = record?.app_metadata && typeof record.app_metadata === 'object' ? record.app_metadata : {}
  const role = String(am.role ?? am.user_role ?? '').trim().toLowerCase()
  if (ADMIN_APP_ROLES.has(role)) return 'admin'
  return 'asesor'
}

export function crmAppRoleLabel(role: CrmAppRole, opts?: { superAdmin?: boolean }): string {
  if (opts?.superAdmin) return 'Super admin'
  return role === 'admin' ? 'Admin' : 'Asesor'
}

export const ADMIN_SHELL_ROUTES: DashboardShellRoute[] = [
  'dashboard-general',
  'boards',
  'pending-citas',
  'equipos',
  'asignar-tarea',
  'tareas-hoy',
  'stats-equipo',
  'gasto-ia',
  'laura',
  'bot-identity',
  'reportes',
  'configuration',
]

export const ASESOR_SHELL_ROUTES: DashboardShellRoute[] = [
  'dashboard-general',
  'boards',
  'pending-citas',
  'equipos',
  'tareas-hoy',
  'laura',
  'configuration',
]

export function defaultRouteForRole(_role: CrmAppRole): DashboardShellRoute {
  return 'boards'
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

/** El gasto de tokens de IA es del admin del taller, no del asesor. */
export function canSeeAiCosts(role?: CrmAppRole | null): boolean {
  return canSeeTelnyxCosts(role)
}
