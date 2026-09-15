/**
 * Super admin (todos los talleres) vs admin de taller vs asesor (solo su taller).
 * Solo `app_metadata` concede privilegios; `user_metadata` lo edita el usuario.
 */

import { isAviAdminProfile, isSuperAdminEmail, sessionEmailOf } from './aviAdminGate'
import type { Workshop } from '../types'

export { isSuperAdminEmail, sessionEmailOf }

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const SUPER_APP_ROLES = new Set(['aviadmin'])
const TALLER_ADMIN_APP_ROLES = new Set(['taller_admin', 'admin', 'jefe', 'responsable'])

function appMetadata(user: unknown): Record<string, unknown> {
  const record = user as { app_metadata?: Record<string, unknown> } | null
  return record?.app_metadata && typeof record.app_metadata === 'object' ? record.app_metadata : {}
}

function appRole(user: unknown): string {
  const am = appMetadata(user)
  return String(am.role ?? am.user_role ?? '').trim().toLowerCase()
}

function normalizeUuid(raw: string | null | undefined): string {
  return String(raw || '').trim().toLowerCase()
}

function rawClaimToUuidList(raw: unknown): string[] {
  if (raw == null) return []
  if (Array.isArray(raw)) return raw.map((item) => String(item).trim()).filter(Boolean)
  if (typeof raw === 'string') {
    return raw
      .split(/[,;\s]+/)
      .map((item) => item.trim())
      .filter(Boolean)
  }
  return []
}

export function isDemoAccountEmail(email: string | null | undefined): boolean {
  return String(email ?? '').trim().toLowerCase().endsWith('@taller.demo')
}

/** Super admin: ve todos los talleres y puede crear un admin de taller. */
export function isSuperAdminUser(user: unknown): boolean {
  if (!user || typeof user !== 'object') return false
  const role = appRole(user)
  if (SUPER_APP_ROLES.has(role)) return true
  return isAviAdminProfile(sessionEmailOf(user), String(appMetadata(user).role ?? ''))
}

export function isTallerAdminUser(user: unknown): boolean {
  if (isSuperAdminUser(user)) return true
  return TALLER_ADMIN_APP_ROLES.has(appRole(user))
}

/** Talleres operativos (p. ej. Supra Gamboa) firmados en `app_metadata.crm_idtalleres`. */
export function assignedOperationalTallerIds(user: unknown): Set<string> {
  const raw = appMetadata(user).crm_idtalleres
  return new Set(rawClaimToUuidList(raw).map(normalizeUuid).filter((id) => UUID_RE.test(id)))
}

export function filterWorkshopsForUser(
  workshops: Workshop[],
  user: unknown,
  isSuper = isSuperAdminUser(user),
): Workshop[] {
  if (isSuper) return workshops
  const assigned = assignedOperationalTallerIds(user)
  if (assigned.size === 0) return workshops
  const filtered = workshops.filter((workshop) => {
    const original = normalizeUuid(String(workshop.originalId ?? ''))
    const container = normalizeUuid(workshop.containerIdTaller)
    return assigned.has(original) || assigned.has(container)
  })
  return filtered.length > 0 ? filtered : workshops
}
