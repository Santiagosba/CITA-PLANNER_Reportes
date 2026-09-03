/**
 * Citas / peticiones ChatBot pendientes (aviold.chatbotpeticiones + citas).
 */

import { supabaseAviOld } from './supabase'
import { fetchAllSupabasePages } from './supabaseFetchAll'
import type { Workshop } from '../types'
import { fetchContainerRow, fetchLicenciaModuleTalleres } from './licenciaGrupo'
import {
  isSqlServerPeticionesSource,
  isSqlServerFallbackEnabled,
  SqlServerApiError,
  sqlFetchPendingPeticiones,
  sqlFetchTiposPeticion,
  sqlResolveTallerIds,
  type SqlResolvedTaller,
  sqlUpdatePeticionGestion,
} from './sqlServerApi'

export type { SqlResolvedTaller } from './sqlServerApi'

export type PeticionesDataSource = 'sqlserver' | 'supabase'

let lastResolvedSource: PeticionesDataSource = isSqlServerPeticionesSource() ? 'sqlserver' : 'supabase'
let lastSourceNotice: string | null = null
/** Tras fallo de login SQL, no reintentar en cada petición (evita 500 repetidos en consola). */
let sqlServerLoginBlocked = false

export function getPeticionesDataSource(): PeticionesDataSource {
  return lastResolvedSource
}

export function getPeticionesSourceNotice(): string | null {
  return lastSourceNotice
}

async function fetchTiposPeticionSupabase(): Promise<TipoPeticionRow[]> {
  return fetchAllSupabasePages<TipoPeticionRow>(() =>
    supabaseAviOld
      .from('chatbottipopeticiones')
      .select('idtipopeticion,tipopeticion')
      .order('tipopeticion'),
  )
}

async function withSqlFallback<T>(label: string, fn: () => Promise<T>, supabaseFn: () => Promise<T>): Promise<T> {
  if (!isSqlServerPeticionesSource() || sqlServerLoginBlocked) {
    if (isSqlServerPeticionesSource() && sqlServerLoginBlocked) {
      lastResolvedSource = 'supabase'
    } else {
      lastResolvedSource = 'supabase'
      lastSourceNotice = null
    }
    return supabaseFn()
  }
  try {
    const result = await fn()
    lastResolvedSource = 'sqlserver'
    lastSourceNotice = null
    sqlServerLoginBlocked = false
    return result
  } catch (e) {
    const apiDown =
      e instanceof SqlServerApiError &&
      (/no está en marcha|Falta MSSQL_PASSWORD|no responde/i.test(e.message) || /502|503/i.test(e.message))
    if (apiDown || !isSqlServerFallbackEnabled()) throw e
    if (e instanceof SqlServerApiError && /login sql server/i.test(e.message)) {
      sqlServerLoginBlocked = true
    }
    lastResolvedSource = 'supabase'
    lastSourceNotice =
      e instanceof SqlServerApiError
        ? `${e.message} Mostrando datos desde Supabase (copia) hasta corregir SQL Server.`
        : `No se pudo usar SQL Server (${label}). Mostrando datos desde Supabase.`
    if (!sqlServerLoginBlocked || label === 'peticiones') {
      console.warn('[peticionesPendientes]', lastSourceNotice)
    }
    return supabaseFn()
  }
}

export type TipoPeticionRow = {
  idtipopeticion: number
  tipopeticion: string
}

export type CitaResumen = {
  idcita: string
  fecha: string | null
  nombre: string | null
  apellidos: string | null
  telefono: string | null
  movil: string | null
  email: string | null
  matricula: string | null
  marca: string | null
  modelo: string | null
  asunto: string | null
}

export type PeticionPendiente = {
  idpeticion: string
  idtaller: string
  descripcion: string | null
  idtipopeticion: number | null
  tipopeticion: string | null
  fechainicio: string | null
  fechafin: string | null
  fechacreacion: string | null
  caller: string | null
  gestionado: boolean | null
  gestionemail: string | null
  gestionfecha: string | null
  gestionobservaciones: string | null
  idcita: string | null
  cita: CitaResumen | null
}

export type PeticionesFilters = {
  caller?: string
  tipoPeticionId?: number | null
  soloConCita?: boolean
  /** ChatBot: sesión sin FechaFin (filtro opcional, no en SQL base) */
  soloSesionAbierta?: boolean
  /** Gestionado = false (filtro opcional, no en SQL base) */
  soloNoGestionadas?: boolean
  from?: string
  to?: string
}

export type PeticionesStats = {
  /** Total peticiones en el periodo filtrado */
  total: number
  /** Sin IDCita → aún pendientes de cita en calendario */
  pendientes: number
  /** Con IDCita → ya tienen cita, no pendientes */
  conCita: number
  pctPendientes: number
  pctConCita: number
  /** @deprecated usar pendientes */
  sinCita: number
  tipos: Record<string, number>
}

/** Pendiente = sin cita vinculada en ChatBotPeticiones.IDCita */
export function isPeticionPendiente(p: Pick<PeticionPendiente, 'idcita'>): boolean {
  return !p.idcita || String(p.idcita).trim() === ''
}

const PETICION_SELECT =
  'idpeticion,idtaller,descripcion,idtipopeticion,fechainicio,fechafin,fechacreacion,caller,gestionado,gestionemail,gestionfecha,gestionobservaciones,idcita'

const CITA_SELECT =
  'idcita,fecha,nombre,apellidos,telefono,movil,email,matricula,marca,modelo,asunto'

export type ResolvedTallerIds = {
  ids: string[]
  talleres: SqlResolvedTaller[]
  via: 'hub' | 'hub+sql' | 'sql'
}

/** UUID aviold.idtaller para consultas ChatBot (un solo taller). */
export function resolveAvioldTallerId(workshop: Workshop): string {
  return String(workshop.originalId || '').trim().toLowerCase()
}

async function resolveHubTallerIds(workshop: Workshop): Promise<string[]> {
  const original = String(workshop.originalId || '').trim().toLowerCase()
  const container = String(workshop.containerIdTaller || '').trim().toLowerCase()

  // Taller hijo de licencia: originalId ya es el aviold.idtaller (si Hub lo conoce)
  if (original && container && original !== container) {
    return [original]
  }

  const containerId = container || original
  if (containerId) {
    const row = await fetchContainerRow(containerId)
    if (row?.idlicenciagrupo) {
      const talleres = await fetchLicenciaModuleTalleres(row.idlicenciagrupo, workshop.hubWebId)
      const ids = talleres.map((t) => String(t.idtaller).trim().toLowerCase()).filter(Boolean)
      if (ids.length) return ids
    }
  }

  return original ? [original] : []
}

/**
 * Resuelve UUID CRM (tabla Talleres / ChatBotPeticiones.IDTaller).
 * 1) Hub licencia → talleres hijos
 * 2) SQL Server Talleres → valida UUID o busca por nombre / expande Grupo
 */
export async function resolveAvioldTallerIdsDetailed(workshop: Workshop): Promise<ResolvedTallerIds> {
  const hubIds = await resolveHubTallerIds(workshop)
  if (!hubIds.length) {
    return { ids: [], talleres: [], via: 'hub' }
  }

  const original = String(workshop.originalId || '').trim().toLowerCase()
  const container = String(workshop.containerIdTaller || '').trim().toLowerCase()
  const isContainer = Boolean(original && container && original === container)

  if (!isSqlServerPeticionesSource() || sqlServerLoginBlocked) {
    return {
      ids: hubIds,
      talleres: hubIds.map((id) => ({ idtaller: id, nombre: workshop.name })),
      via: 'hub',
    }
  }

  try {
    const sqlResolved = await sqlResolveTallerIds({
      hubIds,
      nombre: workshop.name,
      expandGrupo: isContainer,
    })
    if (sqlResolved.ids.length) {
      return {
        ids: sqlResolved.ids,
        talleres: sqlResolved.talleres,
        via: sqlResolved.via === 'direct' ? 'hub+sql' : 'sql',
      }
    }
  } catch (e) {
    console.warn('[peticionesPendientes] resolve SQL Talleres:', e)
  }

  return {
    ids: hubIds,
    talleres: hubIds.map((id) => ({ idtaller: id, nombre: workshop.name })),
    via: 'hub',
  }
}

export async function resolveAvioldTallerIds(workshop: Workshop): Promise<string[]> {
  const { ids } = await resolveAvioldTallerIdsDetailed(workshop)
  return ids
}

export async function fetchTiposPeticion(): Promise<TipoPeticionRow[]> {
  return withSqlFallback('tipos', () => sqlFetchTiposPeticion(), () => fetchTiposPeticionSupabase())
}

async function fetchCitasByIds(ids: string[]): Promise<Map<string, CitaResumen>> {
  const map = new Map<string, CitaResumen>()
  const unique = [...new Set(ids.filter(Boolean))]
  if (!unique.length) return map

  const chunkSize = 80
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize)
    try {
      const { data, error } = await supabaseAviOld.from('citas').select(CITA_SELECT).in('idcita', chunk)
      if (error) {
        console.warn('[peticionesPendientes] citas no accesibles:', error.message)
        return map
      }
      for (const row of (data ?? []) as CitaResumen[]) {
        map.set(String(row.idcita).toLowerCase(), row)
      }
    } catch (e) {
      console.warn('[peticionesPendientes] error cargando citas:', e)
      return map
    }
  }
  return map
}

function mapPeticionRow(
  row: Record<string, unknown>,
  tipos: Map<number, string>,
  citas: Map<string, CitaResumen>,
): PeticionPendiente {
  const idcita = row.idcita ? String(row.idcita).toLowerCase() : null
  const idTipo = row.idtipopeticion != null ? Number(row.idtipopeticion) : null
  return {
    idpeticion: String(row.idpeticion),
    idtaller: String(row.idtaller),
    descripcion: (row.descripcion as string | null) ?? null,
    idtipopeticion: idTipo,
    tipopeticion: idTipo != null ? tipos.get(idTipo) ?? null : null,
    fechainicio: (row.fechainicio as string | null) ?? null,
    fechafin: (row.fechafin as string | null) ?? null,
    fechacreacion: (row.fechacreacion as string | null) ?? null,
    caller: (row.caller as string | null) ?? null,
    gestionado: row.gestionado as boolean | null,
    gestionemail: (row.gestionemail as string | null) ?? null,
    gestionfecha: (row.gestionfecha as string | null) ?? null,
    gestionobservaciones: (row.gestionobservaciones as string | null) ?? null,
    idcita,
    cita: idcita ? citas.get(idcita) ?? null : null,
  }
}

export async function fetchPendingPeticiones(
  idtallerOrIds: string | string[],
  filters: PeticionesFilters = {},
): Promise<PeticionPendiente[]> {
  const ids = (Array.isArray(idtallerOrIds) ? idtallerOrIds : [idtallerOrIds])
    .map((id) => id.trim().toLowerCase())
    .filter(Boolean)
  if (!ids.length) return []

  return withSqlFallback(
    'peticiones',
    async () => {
      let rows = await sqlFetchPendingPeticiones(ids, filters)
      if (filters.soloConCita) rows = rows.filter((p) => Boolean(p.idcita))
      return rows
    },
    async () => fetchPendingPeticionesFromSupabase(ids, filters),
  )
}

async function fetchPendingPeticionesFromSupabase(
  ids: string[],
  filters: PeticionesFilters = {},
): Promise<PeticionPendiente[]> {
  const rows = (await fetchAllSupabasePages(() => {
    let q = supabaseAviOld
      .from('chatbotpeticiones')
      .select(PETICION_SELECT)
      .in('idtaller', ids)

    if (filters.soloSesionAbierta) q = q.is('fechafin', null)
    if (filters.soloNoGestionadas) q = q.or('gestionado.is.null,gestionado.eq.false')

    const caller = filters.caller?.trim()
    if (caller) q = q.ilike('caller', `%${caller}%`)

    if (filters.tipoPeticionId != null) q = q.eq('idtipopeticion', filters.tipoPeticionId)

    if (filters.from) q = q.gte('fechainicio', filters.from)
    if (filters.to) q = q.lte('fechainicio', `${filters.to}T23:59:59`)

    return q.order('fechainicio', { ascending: false })
  })) as Record<string, unknown>[]
  const [tiposRows, citaIds] = await Promise.all([
    fetchTiposPeticionSupabase(),
    Promise.resolve(rows.map((r) => (r.idcita ? String(r.idcita) : '')).filter(Boolean)),
  ])

  const tipos = new Map(tiposRows.map((t) => [t.idtipopeticion, t.tipopeticion]))
  const citas = await fetchCitasByIds(citaIds)

  let mapped = rows.map((r) => mapPeticionRow(r, tipos, citas))
  if (filters.soloConCita) mapped = mapped.filter((p) => Boolean(p.idcita))
  return mapped
}

export function computePeticionesStats(items: PeticionPendiente[]): PeticionesStats {
  const tipos: Record<string, number> = {}
  let conCita = 0
  for (const p of items) {
    const label = p.tipopeticion || 'Sin tipo'
    tipos[label] = (tipos[label] ?? 0) + 1
    if (!isPeticionPendiente(p)) conCita++
  }
  const total = items.length
  const pendientes = total - conCita
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 1000) / 10 : 0)
  return {
    total,
    pendientes,
    conCita,
    pctPendientes: pct(pendientes),
    pctConCita: pct(conCita),
    sinCita: pendientes,
    tipos,
  }
}

export type GestionPatch = {
  gestionado: boolean
  gestionobservaciones?: string
  gestionemail?: string
}

export async function updatePeticionGestion(idpeticion: string, patch: GestionPatch): Promise<void> {
  if (isSqlServerPeticionesSource() && lastResolvedSource === 'sqlserver') {
    await sqlUpdatePeticionGestion(idpeticion, patch)
    return
  }
  const now = new Date().toISOString()
  const { error } = await supabaseAviOld
    .from('chatbotpeticiones')
    .update({
      gestionado: patch.gestionado,
      gestionobservaciones: patch.gestionobservaciones ?? '',
      gestionemail: patch.gestionemail ?? '',
      gestionfecha: patch.gestionado ? now : null,
      fechamodificacion: now,
    })
    .eq('idpeticion', idpeticion)

  if (error) throw new Error(error.message)
}

function csvEscape(v: string): string {
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`
  return v
}

export function buildPeticionesCsv(items: PeticionPendiente[], tallerNombre: string): string {
  const headers = [
    'Taller',
    'Estado',
    'ID Petición',
    'Teléfono',
    'Tipo',
    'Descripción',
    'Inicio sesión',
    'Cita programada',
    'Cliente',
    'Matrícula',
    'Vehículo',
    'Gestionado',
    'Observaciones gestión',
  ]
  const lines = [headers.join(',')]
  for (const p of items) {
    const c = p.cita
    const cliente = c ? [c.nombre, c.apellidos].filter(Boolean).join(' ') : ''
    const vehiculo = c ? [c.marca, c.modelo].filter(Boolean).join(' ') : ''
    lines.push(
      [
        tallerNombre,
        isPeticionPendiente(p) ? 'Pendiente' : 'Con cita',
        p.idpeticion,
        p.caller ?? '',
        p.tipopeticion ?? '',
        p.descripcion ?? '',
        p.fechainicio ?? '',
        c?.fecha ?? '',
        cliente,
        c?.matricula ?? '',
        vehiculo,
        p.gestionado ? 'Sí' : 'No',
        p.gestionobservaciones ?? '',
      ]
        .map((v) => csvEscape(String(v)))
        .join(','),
    )
  }
  return lines.join('\n')
}

export function downloadCsv(content: string, filename: string): void {
  const blob = new Blob(['\ufeff', content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function formatFecha(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('es-ES', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}
