import type { Workshop } from '../types'
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
  const resolved = await resolveAvioldTallerIdsDetailed(workshop)
  if (!resolved.ids.length) return []

  if (isSqlServerPeticionesSource()) {
    return sqlFetchCitas(resolved.ids, range)
  }

  const rows = (await fetchAllSupabasePages(() => {
    let query = supabaseAviOld
      .from('citas')
      .select(CITA_TALLER_SELECT)
      .in('idtaller', resolved.ids)
    if (range.from) query = query.gte('fecha', `${range.from}T00:00:00`)
    if (range.to) query = query.lte('fecha', `${range.to}T23:59:59`)
    return query.order('fecha', { ascending: true })
  })) as unknown as Record<string, unknown>[]

  return rows.map((row) => ({
    idcita: String(row.idcita),
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
    idCentro: emptyToNull(row.idcentro),
    idOperario: emptyToNull(row.idoperario),
    direccion: emptyToNull(row.direccion),
    poblacion: emptyToNull(row.poblacion),
    provincia: emptyToNull(row.provincia),
    contacto: emptyToNull(row.contacto),
  }))
}

function emptyToNull(v: unknown): string | null {
  if (v == null) return null
  const s = String(v).trim()
  return s || null
}
