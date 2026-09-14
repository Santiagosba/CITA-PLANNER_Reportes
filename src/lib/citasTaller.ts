import type { Workshop } from '../types'
import { filterCrmUuids } from './crmUuid'
import { isLocalPreviewWorkshop } from './localPreview'
import { fetchAllSupabasePages } from './supabaseFetchAll'
import { supabaseAviOld } from './supabase'
import { resolveAvioldTallerIdsDetailed } from './peticionesPendientes'
import { isSqlServerPeticionesSource, sqlFetchCitas } from './sqlServerApi'

export type CitaTaller = {
  idcita: string
  idtaller: string
  fecha: string | null
  asunto: string | null
  observaciones: string | null
  nombre: string | null
  apellidos: string | null
  razonSocial: string | null
  telefono: string | null
  movil: string | null
  email: string | null
  marca: string | null
  modelo: string | null
  motor: string | null
  matricula: string | null
  kilometros: number | null
  idEstadoCita: number | null
  idMotivoCancelada: number | null
  idCentro: string | null
  idOperario: string | null
  direccion: string | null
  poblacion: string | null
  provincia: string | null
  contacto: string | null
}

const CITA_TALLER_SELECT = [
  'idcita',
  'idtaller',
  'fecha',
  'asunto',
  'observaciones',
  'razonsocial',
  'nombre',
  'apellidos',
  'telefono',
  'movil',
  'email',
  'marca',
  'modelo',
  'motor',
  'matricula',
  'kilometros',
  'idestadocita',
  'idmotivocancelada',
  'idcentro',
  'idoperario',
  'direccion',
  'poblacion',
  'provincia',
  'contacto',
].join(',')

export async function fetchCitasTaller(
  workshop: Workshop,
  range: { from?: string; to?: string },
): Promise<CitaTaller[]> {
  if (isLocalPreviewWorkshop(workshop)) return []

  const resolved = await resolveAvioldTallerIdsDetailed(workshop)
  const ids = filterCrmUuids(resolved.ids)
  if (!ids.length) return []

  if (isSqlServerPeticionesSource()) {
    return sqlFetchCitas(ids, range)
  }

  const rows = await fetchCitaRows(ids, range, CITA_TALLER_SELECT)
  return rows.map(mapCitaTallerRow)
}

const CITA_TALLER_SELECT_FALLBACK = CITA_TALLER_SELECT.replace(',idmotivocancelada', '')

async function fetchCitaRows(
  ids: string[],
  range: { from?: string; to?: string },
  columns: string,
): Promise<Record<string, unknown>[]> {
  try {
    return (await fetchAllSupabasePages(() => {
      let query = supabaseAviOld.from('citas').select(columns).in('idtaller', ids)
      if (range.from) query = query.gte('fecha', `${range.from}T00:00:00`)
      if (range.to) query = query.lte('fecha', `${range.to}T23:59:59`)
      return query.order('fecha', { ascending: true })
    })) as unknown as Record<string, unknown>[]
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (columns.includes('idmotivocancelada') && /idmotivocancelada/i.test(message)) {
      return fetchCitaRows(ids, range, CITA_TALLER_SELECT_FALLBACK)
    }
    throw error
  }
}

function mapCitaTallerRow(row: Record<string, unknown>): CitaTaller {
  return {
    idcita: String(row.idcita || '').toLowerCase(),
    idtaller: String(row.idtaller),
    fecha: (row.fecha as string | null) ?? null,
    asunto: emptyToNull(row.asunto),
    observaciones: emptyToNull(row.observaciones),
    razonSocial: emptyToNull(row.razonsocial),
    nombre: emptyToNull(row.nombre),
    apellidos: emptyToNull(row.apellidos),
    telefono: emptyToNull(row.telefono),
    movil: emptyToNull(row.movil),
    email: emptyToNull(row.email),
    marca: emptyToNull(row.marca),
    modelo: emptyToNull(row.modelo),
    motor: emptyToNull(row.motor),
    matricula: emptyToNull(row.matricula),
    kilometros: row.kilometros == null ? null : Number(row.kilometros),
    idEstadoCita: row.idestadocita == null ? null : Number(row.idestadocita),
    idMotivoCancelada: row.idmotivocancelada == null ? null : Number(row.idmotivocancelada),
    idCentro: emptyToNull(row.idcentro),
    idOperario: emptyToNull(row.idoperario),
    direccion: emptyToNull(row.direccion),
    poblacion: emptyToNull(row.poblacion),
    provincia: emptyToNull(row.provincia),
    contacto: emptyToNull(row.contacto),
  }
}

function emptyToNull(v: unknown): string | null {
  if (v == null) return null
  const s = String(v).trim()
  return s || null
}
