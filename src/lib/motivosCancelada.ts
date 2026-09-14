import { sqlFetchMotivosCancelada } from './sqlServerApi'

export type MotivoCanceladaRow = {
  idmotivocancelada: number
  motivocancelada: string
}

/**
 * El catálogo vive en SQL Server (`/api/motivos-cancelada`).
 * `aviold.motivoscancelada` no se lee desde el navegador: la anon key
 * responde 401 (permission denied).
 */
export async function fetchMotivosCancelada(): Promise<MotivoCanceladaRow[]> {
  try {
    return await sqlFetchMotivosCancelada()
  } catch {
    return []
  }
}

export function motivosCanceladaMap(rows: MotivoCanceladaRow[]): Map<number, string> {
  return new Map(
    rows
      .filter((row) => Number.isFinite(Number(row.idmotivocancelada)) && String(row.motivocancelada || '').trim())
      .map((row) => [Number(row.idmotivocancelada), String(row.motivocancelada).trim()]),
  )
}
