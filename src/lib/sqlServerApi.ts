/**
 * Cliente HTTP hacia la API Node (SQL Server aviapi).
 * En dev, Vite proxy redirige /api → localhost:3001.
 */

import type { GestionPatch, PeticionPendiente, PeticionesFilters, TipoPeticionRow } from './peticionesPendientes'

function apiBase(): string {
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

async function parseJson<T>(res: Response): Promise<T> {
  let body: { error?: string } & T
  try {
    body = (await res.json()) as { error?: string } & T
  } catch {
    throw new SqlServerApiError(
      res.status === 502 || res.status === 500
        ? 'La API SQL no responde. Ejecuta `npm run dev:api` en otra terminal y reinicia Vite.'
        : `Error API SQL (${res.status})`,
    )
  }
  if (!res.ok) {
    const msg = body.error || res.statusText || 'Error API SQL Server'
    if (/inicio de sesi/i.test(msg)) {
      throw new SqlServerApiError(
        'Login SQL Server rechazado para el usuario configurado. Revisa MSSQL_USER y MSSQL_PASSWORD en .env (prueba la conexión en SSMS).',
      )
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
  constructor(message: string) {
    super(message)
    this.name = 'SqlServerApiError'
  }
}

export async function sqlHealthCheck(): Promise<{ ok: boolean; error?: string }> {
  try {
    const data = await parseJson<{ ok: boolean }>(await fetch(url('/api/health')))
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
  return parseJson<SqlResolveTalleresResult>(await fetch(url('/api/talleres/resolve', params)))
}

export async function sqlFetchTiposPeticion(): Promise<TipoPeticionRow[]> {
  return parseJson<TipoPeticionRow[]>(await fetch(url('/api/tipos-peticion')))
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
  return parseJson<PeticionPendiente[]>(await fetch(url('/api/peticiones-pendientes', params)))
}

export async function sqlUpdatePeticionGestion(idpeticion: string, patch: GestionPatch): Promise<void> {
  await parseJson<{ ok: boolean }>(
    await fetch(url(`/api/peticiones/${encodeURIComponent(idpeticion)}/gestion`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }),
  )
}
