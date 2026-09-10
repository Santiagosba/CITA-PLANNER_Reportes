/**
 * Cliente HTTP hacia la API Node (SQL Server aviapi).
 * Si la URL remota no es usable en el navegador (sslip.io sin certificado,
 * o HTTP desde una web HTTPS), se llama a /api del mismo origen y el proxy
 * de Vite/Vercel reenvía a CitaplannerServer.
 */

import type { GestionPatch, PeticionPendiente, PeticionesFilters, TipoPeticionRow } from './peticionesPendientes'
import type { CitaTaller } from './citasTaller'
import { supabase } from './supabase'
import { handleExpiredSession } from './sessionGuard'
import { fetchSqlResponse } from './sqlTransport'

function browserCannotCall(raw: string): boolean {
  try {
    const target = new URL(raw)
    if (target.hostname.endsWith('.sslip.io')) return true
    if (typeof window !== 'undefined' && window.location.protocol === 'https:' && target.protocol === 'http:') {
      return true
    }
  } catch {
    return false
  }
  return false
}

function apiBase(): string {
  const colleague = (import.meta.env.VITE_COLLEAGUE_API_URL as string | undefined)?.trim()
  if (colleague) return colleague.replace(/\/+$/, '')
  const raw = (import.meta.env.VITE_SQL_API_URL as string | undefined)?.trim()
  if (!raw || browserCannotCall(raw)) return ''
  return raw.replace(/\/+$/, '')
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

function apiDownMessage(): string {
  const base = apiBase()
  return base
    ? `No se pudo contactar con la API SQL (${base}). Puede estar apagada o rechazando el origen de esta web.`
    : 'No se pudo contactar con la API SQL. El servidor puede estar apagado o no responder.'
}

function applySqlAuth(headers: Headers, token: string | undefined) {
  if (!token || token.startsWith('demo-')) return
  headers.set('Authorization', `Bearer ${token}`)
  // Vercel a veces no reenvía Authorization hacia un origen HTTP.
  headers.set('X-Supabase-Auth', token)
}

async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  let sentToken: string | undefined
  const run = async () => {
    const headers = new Headers(init?.headers)
    const { data } = await supabase.auth.getSession()
    sentToken = data.session?.access_token
    const publicHealth = /\/api\/health(?:\/(?:live|config))?(?:\?|$)/.test(input)
    if (!publicHealth && (!sentToken || sentToken.startsWith('demo-'))) {
      throw new SqlServerApiError('Tu sesión ha caducado. Vuelve a entrar.', 'session-expired')
    }
    applySqlAuth(headers, sentToken)
    return fetchSqlResponse(input, { ...init, headers })
  }
  try {
    let res = await run()
    if (res.status === 401) {
      if (!(await handleExpiredSession(sentToken))) {
        throw new SqlServerApiError('Tu sesión ha caducado. Vuelve a entrar.', 'session-expired')
      }
      const { data } = await supabase.auth.getSession()
      // No repetir un token que el servidor ya ha rechazado.
      if (data.session?.access_token && data.session.access_token !== sentToken) res = await run()
    }
    return res
  } catch (error) {
    if (error instanceof SqlServerApiError) throw error
    throw new SqlServerApiError(apiDownMessage(), 'api-down')
  }
}

async function parseJson<T>(res: Response): Promise<T> {
  let body: { error?: string; ok?: boolean; code?: string } & T
  try {
    body = (await res.json()) as { error?: string; ok?: boolean; code?: string } & T
  } catch {
    if (res.status === 401) {
      throw new SqlServerApiError('Tu sesión ha caducado. Vuelve a entrar.', 'session-expired')
    }
    if (res.status === 502 || res.status === 500 || res.status === 503) {
      throw new SqlServerApiError(apiDownMessage(), 'api-down')
    }
    throw new SqlServerApiError(`Error API SQL (${res.status})`)
  }
  if (res.status === 401) {
    // La API no pudo validar el JWT (clave Supabase mal puesta en Dokploy).
    // No echar al usuario: es un fallo del servidor, no de su sesión.
    if (body.code === 'invalid-token' || body.code === 'no-token' || body.code === 'config') {
      throw new SqlServerApiError(
        body.error || 'La API SQL no pudo validar la sesión. Revisa SUPABASE_ANON_KEY en el servidor.',
        'api-down',
      )
    }
    throw new SqlServerApiError('Tu sesión ha caducado. Vuelve a entrar.', 'session-expired')
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
