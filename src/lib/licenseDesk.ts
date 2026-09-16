/**
 * Panel de grupos: cada grupo tiene varias licencias (en datos, «talleres»).
 * Cada licencia tiene varios centros. El super admin activa el grupo y las vistas.
 */

import { supabase } from './supabase'
import { getCrmHubWebIdFromEnv } from './hubWebEnv'
import { CRM_VIEWS_CONFIG_KEY, DEFAULT_LICENSE_VIEWS, parseLicenseViews, type LicenseViewId } from './crmViews'
import { fetchCentrosForGrupo, fetchCentrosForTalleres } from './licenciaGrupo'
import { isLocalPreviewWorkshop, readLocalPreview } from './localPreview'
import type { Workshop } from '../types'

export type LicenseCenter = {
  idcentro: string
  nombre: string
  poblacion?: string | null
}

export type LicenseWorkshop = {
  idtaller: string
  nombre: string
  activo: boolean
  poblacion?: string | null
  centros?: LicenseCenter[]
}

export type LicenseAdmin = {
  name: string
  email: string
  role: string
}

export type LicenseDeskUser = {
  id: string
  email: string
  name: string
  role: 'taller_admin' | 'asesor'
  groupIds: string[]
  licenseIds: string[]
  centerIds: string[]
}

export type LicenseDeskRow = {
  idlicenciagrupo: string | null
  nombre: string
  slug: string | null
  containerId: string
  grupoActivo: boolean
  crmActivo: boolean
  views: LicenseViewId[] | null
  workshops: LicenseWorkshop[]
  admins: LicenseAdmin[]
}

type LicenseDeskPayload = {
  error?: string
  licenses?: LicenseDeskRow[]
}

const LOCAL_VIEWS_KEY = 'avi_local_license_views'
const LOCAL_ACTIVE_KEY = 'avi_local_license_active'
const LOCAL_SHOPS_KEY = 'avi_local_license_shops'
const LOCAL_USERS_KEY = 'avi_local_license_users'

type WorkshopHint = Pick<Workshop, 'id' | 'source' | 'originalId' | 'containerIdTaller'>

/** «Ver como admin» no cambia el JWT: las escrituras reales de licencias no valen. */
export function isLicenseDeskPreview(workshop?: WorkshopHint | null): boolean {
  return Boolean((workshop && isLocalPreviewWorkshop(workshop)) || readLocalPreview())
}

function localViews(): LicenseViewId[] | null {
  try {
    const raw = localStorage.getItem(LOCAL_VIEWS_KEY)
    if (!raw) return null
    return parseLicenseViews(JSON.parse(raw))
  } catch {
    return null
  }
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function localLicenses(): LicenseDeskRow[] {
  const crmActivo = readJson(LOCAL_ACTIVE_KEY, true)
  const shopFlags = readJson<Record<string, boolean>>(LOCAL_SHOPS_KEY, {})
  const workshops: LicenseWorkshop[] = [
    {
      idtaller: 'local-preview',
      nombre: 'Licencia local',
      activo: shopFlags['local-preview'] !== false,
      poblacion: 'Madrid',
      centros: [
        { idcentro: 'local-center-1', nombre: 'Recepción Madrid', poblacion: 'Madrid' },
        { idcentro: 'local-center-2', nombre: 'Chapa Madrid', poblacion: 'Madrid' },
      ],
    },
    {
      idtaller: 'local-preview-2',
      nombre: 'Licencia norte',
      activo: shopFlags['local-preview-2'] !== false,
      poblacion: 'Bilbao',
      centros: [{ idcentro: 'local-center-3', nombre: 'Recepción Bilbao', poblacion: 'Bilbao' }],
    },
  ]
  return [
    {
      idlicenciagrupo: '1',
      nombre: 'Grupo local',
      slug: 'local',
      containerId: 'local-preview',
      grupoActivo: true,
      crmActivo,
      views: localViews(),
      workshops,
      admins: [{ name: 'Admin local', email: 'santy@gmail.com', role: 'admin' }],
    },
  ]
}

async function invokeErrorMessage(error: unknown, payload: { error?: string } | null): Promise<string> {
  if (payload?.error) return payload.error
  const ctx = error && typeof error === 'object' && 'context' in error ? (error as { context?: unknown }).context : null
  if (ctx && typeof ctx === 'object' && ctx && 'json' in ctx && typeof (ctx as Response).json === 'function') {
    try {
      const body = (await (ctx as Response).json()) as { error?: string }
      if (body?.error) return body.error
    } catch {
      /* ignore */
    }
  }
  const msg = error instanceof Error ? error.message : ''
  if (/non-2xx/i.test(msg)) {
    return 'Solo el super admin puede gestionar licencias. Entra con santy@gmail.com. «Ver como admin» no cambia tu sesión.'
  }
  return msg || 'No se pudo hablar con licencias.'
}

async function invokeLicencias<T>(body: Record<string, unknown>): Promise<T> {
  const webId = getCrmHubWebIdFromEnv()
  const { data, error } = await supabase.functions.invoke('crm-licencias', {
    body: { ...body, webId },
  })
  const payload = data as (T & { error?: string }) | null
  if (error || payload?.error) {
    throw new Error(await invokeErrorMessage(error, payload))
  }
  if (!payload) throw new Error('No se pudo hablar con licencias.')
  return payload
}

function shopKey(id: string): string {
  return String(id || '').trim().toLowerCase()
}

function attachCenters(
  rows: LicenseDeskRow[],
  centros: Array<{ idtaller: string; idcentro: string; nombre: string; poblacion?: string | null }>,
): LicenseDeskRow[] {
  const byShop = new Map<string, LicenseCenter[]>()
  for (const row of centros) {
    const key = shopKey(row.idtaller)
    const list = byShop.get(key) || []
    const idcentro = String(row.idcentro || '').trim()
    if (!idcentro || list.some((item) => shopKey(item.idcentro) === shopKey(idcentro))) continue
    list.push({ idcentro, nombre: row.nombre, poblacion: row.poblacion ?? null })
    byShop.set(key, list)
  }
  return rows.map((row) => ({
    ...row,
    workshops: row.workshops.map((item) => ({
      ...item,
      centros: item.centros?.length ? item.centros : byShop.get(shopKey(item.idtaller)) || [],
    })),
  }))
}

function shopsNeedCenters(rows: LicenseDeskRow[]): boolean {
  return rows.some((row) => row.workshops.some((item) => !item.centros?.length))
}

export async function fetchLicenseDesk(workshop?: WorkshopHint | null): Promise<LicenseDeskRow[]> {
  if (isLicenseDeskPreview(workshop)) return localLicenses()
  const payload = await invokeLicencias<LicenseDeskPayload>({ action: 'list' })
  let rows = Array.isArray(payload.licenses) ? payload.licenses : []
  if (!shopsNeedCenters(rows)) return rows
  const ids = rows.flatMap((row) => row.workshops.map((item) => item.idtaller))
  rows = attachCenters(rows, await fetchCentrosForTalleres(ids))
  if (!shopsNeedCenters(rows)) return rows
  const extra: Array<{ idtaller: string; idcentro: string; nombre: string; poblacion?: string | null }> = []
  for (const row of rows) {
    if (!row.idlicenciagrupo) continue
    extra.push(...(await fetchCentrosForGrupo(row.idlicenciagrupo)))
  }
  return attachCenters(rows, extra)
}

export async function setLicenseCrmActive(
  containerId: string,
  active: boolean,
  workshop?: WorkshopHint | null,
): Promise<void> {
  if (isLicenseDeskPreview(workshop)) {
    try {
      localStorage.setItem(LOCAL_ACTIVE_KEY, JSON.stringify(active))
    } catch {
      /* ignore */
    }
    return
  }
  await invokeLicencias({ action: 'set-active', containerId, active })
}

export async function setLicenseViews(
  containerId: string,
  views: LicenseViewId[],
  workshop?: WorkshopHint | null,
): Promise<void> {
  if (isLicenseDeskPreview(workshop)) {
    try {
      localStorage.setItem(LOCAL_VIEWS_KEY, JSON.stringify({ routes: views }))
    } catch {
      /* ignore */
    }
    return
  }
  await invokeLicencias({
    action: 'set-views',
    containerId,
    views,
    configKey: CRM_VIEWS_CONFIG_KEY,
  })
}

export async function setLicenseWorkshopActive(opts: {
  idlicenciagrupo: string
  idtaller: string
  active: boolean
  workshop?: WorkshopHint | null
}): Promise<void> {
  if (isLicenseDeskPreview(opts.workshop)) {
    try {
      const flags = readJson<Record<string, boolean>>(LOCAL_SHOPS_KEY, {})
      flags[opts.idtaller] = opts.active
      localStorage.setItem(LOCAL_SHOPS_KEY, JSON.stringify(flags))
    } catch {
      /* ignore */
    }
    return
  }
  await invokeLicencias({
    action: 'set-workshop',
    idlicenciagrupo: opts.idlicenciagrupo,
    idtaller: opts.idtaller,
    active: opts.active,
  })
}

function localUsers(): LicenseDeskUser[] {
  return readJson<LicenseDeskUser[]>(LOCAL_USERS_KEY, [
    {
      id: 'local-user-carlos',
      email: 'carlos@gmail.com',
      name: 'Carlos',
      role: 'taller_admin',
      groupIds: ['local-preview'],
      licenseIds: ['local-preview'],
      centerIds: ['local-center-1', 'local-center-2'],
    },
  ])
}

export async function fetchLicenseUsers(workshop?: WorkshopHint | null): Promise<LicenseDeskUser[]> {
  if (isLicenseDeskPreview(workshop)) return localUsers()
  const payload = await invokeLicencias<{ users?: LicenseDeskUser[] }>({ action: 'list-users' })
  return Array.isArray(payload.users) ? payload.users : []
}

export async function setLicenseUserAccess(
  input: {
    email: string
    name?: string
    password?: string
    role: 'taller_admin' | 'asesor'
    groupIds: string[]
    licenseIds: string[]
    centerIds: string[]
  },
  workshop?: WorkshopHint | null,
): Promise<LicenseDeskUser> {
  if (isLicenseDeskPreview(workshop)) {
    const users = localUsers()
    const email = input.email.trim().toLowerCase()
    const next: LicenseDeskUser = {
      id: users.find((item) => item.email === email)?.id || `local-user-${Date.now()}`,
      email,
      name: input.name?.trim() || users.find((item) => item.email === email)?.name || email,
      role: input.role,
      groupIds: [...input.groupIds],
      licenseIds: [...input.licenseIds],
      centerIds: [...input.centerIds],
    }
    const list = [...users.filter((item) => item.email !== email), next]
    try {
      localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(list))
    } catch {
      /* ignore */
    }
    return next
  }
  await invokeLicencias({ action: 'set-user-access', ...input })
  return {
    id: input.email,
    email: input.email.trim().toLowerCase(),
    name: input.name?.trim() || input.email,
    role: input.role,
    groupIds: [...input.groupIds],
    licenseIds: [...input.licenseIds],
    centerIds: [...input.centerIds],
  }
}

export function viewsLabel(views: LicenseViewId[] | null): string {
  if (!views) return 'Todas las vistas'
  if (views.length === 0) return 'Ninguna vista'
  if (views.length === DEFAULT_LICENSE_VIEWS.length) return 'Todas las vistas'
  if (views.length === 1) return '1 vista activa'
  return `${views.length} vistas activas`
}
