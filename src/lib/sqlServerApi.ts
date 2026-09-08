/**
 * Cliente HTTP hacia la API Node (SQL Server aviapi).
 * En dev, Vite proxy redirige /api → localhost:3002 (CitaplannerServer).
 */

import type { GestionPatch, PeticionPendiente, PeticionesFilters, TipoPeticionRow } from './peticionesPendientes'
import type { CitaTaller } from './citasTaller'
import { supabase } from './supabase'
import { handleExpiredSession } from './sessionGuard'

function apiBase(): string {
  const colleague = (import.meta.env.VITE_COLLEAGUE_API_URL as string | undefined)?.trim()
  if (colleague) return colleague.replace(/\/+$/, '')
  const raw = (import.meta.env.VITE_SQL_API_URL as string | undefined)?.trim()
  return raw?.replace(/\/+$/, '') ?? ''
}

function url(path: string, params?: Record<string, string | string[] | undefined>): string {
  const base = apiBase()
  const full = `${base}${path.startsWith('/') ? path : `/${path}`}`
  if (!params) return full
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v == null) continue
    if (Array.isArray(v)) v.forEach((item) => qs.append(k, item))
    else qs.set(k, v)
  }
  const q = qs.toString()
  return q ? `${full}?${q}` : full
}

/**
 * Con `VITE_SQL_API_URL` la API es remota, así que pedir `npm run dev` no ayuda:
 * lo habitual es que esté apagada o que no acepte el origen de esta web (CORS,
 * que el navegador reporta como un fallo de red indistinguible de una caída).
 */
function apiDownMessage(): string {
  const base = apiBase()
  return base
    ? `No se pudo contactar con la API SQL (${base}). Puede estar apagada o rechazando el origen de esta web.`
    : 'La API SQL no está en marcha. Abre otra terminal, ve a CitaplannerServer y ejecuta npm run dev (o npm run dev:api desde el frontend).'
}

async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  try {
    const headers = new Headers(init?.headers)
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (token && !token.startsWith('demo-')) headers.set('Authorization', `Bearer ${token}`)
    return await fetch(input, { ...init, headers })
  } catch {
    throw new SqlServerApiError(apiDownMessage(), 'api-down')
  }
}

async function parseJson<T>(res: Response): Promise<T> {
  if (res.status === 401 && !(await handleExpiredSession())) {
    throw new SqlServerApiError('Tu sesión ha caducado. Vuelve a entrar.', 'session-expired')
  }

  let body: { error?: string; ok?: boolean } & T
  try {
    body = (await res.json()) as { error?: string; ok?: boolean } & T
  } catch {
    if (res.status === 502 || res.status === 500 || res.status === 503) {
      throw new SqlServerApiError(apiDownMessage(), 'api-down')
    }
    throw new SqlServerApiError(`Error API SQL (${res.status})`)
  }
  if (!res.ok || body.ok === false) {
    const msg = body.error || res.statusText || 'Error API SQL Server'
    if (/falta mssql_password/i.test(msg)) {
      throw new SqlServerApiError(
        'La API SQL no tiene configurada la contraseña de SQL Server (MSSQL_PASSWORD).',
        'api-down',
      )
    }
    if (/inicio de sesi/i.test(msg)) {
      throw new SqlServerApiError('Login SQL Server rechazado: revisa MSSQL_USER y MSSQL_PASSWORD.', 'api-down')
    }
    if (res.status === 502 || res.status === 503) {
      throw new SqlServerApiError(apiDownMessage(), 'api-down')
    }
    throw new SqlServerApiError(msg)
  }
  return body as T
}

export function isSqlServerPeticionesSource(): boolean {
  return (import.meta.env.VITE_PETICIONES_SOURCE as string | undefined)?.trim().toLowerCase() === 'sqlserver'
}

/** Si true, usa Supabase cuando la API SQL Server no responde o falla el login. */
export function isSqlServerFallbackEnabled(): boolean {
  const raw = (import.meta.env.VITE_PETICIONES_SQL_FALLBACK as string | undefined)?.trim().toLowerCase()
  return raw !== 'false' && raw !== '0'
}

export class SqlServerApiError extends Error {
  /**
   * `session-expired`: hay que volver al login, no caer al fallback de Supabase.
   * `api-down`: la API no responde o no puede consultar SQL Server.
   */
  code?: 'session-expired' | 'api-down'

  constructor(message: string, code?: 'session-expired' | 'api-down') {
    super(message)
    this.name = 'SqlServerApiError'
    this.code = code
  }
}

export async function sqlHealthCheck(): Promise<{ ok: boolean; error?: string }> {
  try {
    const data = await parseJson<{ ok: boolean }>(await apiFetch(url('/api/health')))
    return { ok: data.ok === true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export type SqlResolvedTaller = { idtaller: string; nombre: string }

export type SqlResolveTalleresResult = {
  ids: string[]
  talleres: SqlResolvedTaller[]
  via: 'direct' | 'nombre' | 'grupo' | 'none'
}

export async function sqlResolveTallerIds(input: {
  hubIds: string[]
  nombre?: string
  expandGrupo?: boolean
}): Promise<SqlResolveTalleresResult> {
  const params: Record<string, string | string[]> = {
    idTaller: input.hubIds.map((id) => id.trim().toLowerCase()).filter(Boolean),
  }
  if (input.nombre?.trim()) params.nombre = input.nombre.trim()
  if (input.expandGrupo) params.expandGrupo = '1'
  return parseJson<SqlResolveTalleresResult>(await apiFetch(url('/api/talleres/resolve', params)))
}

export async function sqlFetchTiposPeticion(): Promise<TipoPeticionRow[]> {
  return parseJson<TipoPeticionRow[]>(await apiFetch(url('/api/tipos-peticion')))
}

export async function sqlFetchPendingPeticiones(
  idTallerIds: string[],
  filters: PeticionesFilters = {},
): Promise<PeticionPendiente[]> {
  const params: Record<string, string | string[]> = {
    idTaller: idTallerIds,
  }
  if (filters.caller?.trim()) params.caller = filters.caller.trim()
  if (filters.tipoPeticionId != null) params.tipoPeticionId = String(filters.tipoPeticionId)
  if (filters.soloConCita) params.soloConCita = '1'
  if (filters.soloSesionAbierta) params.soloSesionAbierta = '1'
  if (filters.soloNoGestionadas) params.soloNoGestionadas = '1'
  if (filters.from?.trim()) params.from = filters.from.trim()
  if (filters.to?.trim()) params.to = filters.to.trim()
  return parseJson<PeticionPendiente[]>(await apiFetch(url('/api/peticiones-pendientes', params)))
}

export async function sqlFetchCitas(
  idTallerIds: string[],
  range: { from?: string; to?: string } = {},
): Promise<CitaTaller[]> {
  const params: Record<string, string | string[]> = {
    idTaller: idTallerIds,
  }
  if (range.from?.trim()) params.from = range.from.trim()
  if (range.to?.trim()) params.to = range.to.trim()
  return parseJson<CitaTaller[]>(await apiFetch(url('/api/citas', params)))
}

export async function sqlUpdatePeticionGestion(idpeticion: string, patch: GestionPatch): Promise<void> {
  await parseJson<{ ok: boolean }>(
    await apiFetch(url(`/api/peticiones/${encodeURIComponent(idpeticion)}/gestion`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }),
  )
}
