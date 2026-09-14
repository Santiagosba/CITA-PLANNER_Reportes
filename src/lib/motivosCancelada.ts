import { supabaseAviOld } from './supabase'
import { fetchAllSupabasePages } from './supabaseFetchAll'
import { isSqlServerPeticionesSource, sqlFetchMotivosCancelada } from './sqlServerApi'

export type MotivoCanceladaRow = {
  idmotivocancelada: number
  motivocancelada: string
}

async function fetchMotivosCanceladaSupabase(): Promise<MotivoCanceladaRow[]> {
  return fetchAllSupabasePages<MotivoCanceladaRow>(() =>
    supabaseAviOld.from('motivoscancelada').select('idmotivocancelada,motivocancelada').order('motivocancelada'),
  )
}

export async function fetchMotivosCancelada(): Promise<MotivoCanceladaRow[]> {
  if (isSqlServerPeticionesSource()) {
    try {
      return await sqlFetchMotivosCancelada()
    } catch {
      return fetchMotivosCanceladaSupabase()
    }
  }
  return fetchMotivosCanceladaSupabase()
}

export function motivosCanceladaMap(rows: MotivoCanceladaRow[]): Map<number, string> {
  return new Map(
    rows
      .filter((row) => Number.isFinite(Number(row.idmotivocancelada)) && String(row.motivocancelada || '').trim())
      .map((row) => [Number(row.idmotivocancelada), String(row.motivocancelada).trim()]),
  )
}
