import { localTodayIso } from './advisorWorkspace'
import { toDateInputValue } from './dateRangePresets'
import type { PeticionPendiente } from './peticionesPendientes'

function shiftIso(iso: string, days: number): string {
  const date = new Date(`${iso}T12:00:00`)
  date.setDate(date.getDate() + days)
  return toDateInputValue(date)
}

function ticketWorkDay(
  item: Pick<PeticionPendiente, 'cita' | 'fechainicio' | 'fechacreacion'>,
): string {
  return String(item.cita?.fecha || item.fechainicio || item.fechacreacion || '').slice(0, 10)
}

/** Carga: un poco atrás para no perder abiertas, y un año hacia adelante. */
export function boardLiveFetchRange(today = localTodayIso()): { from: string; to: string } {
  return { from: shiftIso(today, -90), to: shiftIso(today, 366) }
}

/**
 * Tablero vivo: hoy y lo futuro.
 * Siguen las abiertas (trabajo actual, aunque llegaran antes) y las hechas de hoy.
 */
export function isLiveBoardTicket(item: PeticionPendiente, today = localTodayIso()): boolean {
  const work = ticketWorkDay(item)
  if (work >= today) return true
  if (!item.gestionado) return true
  const done = String(item.gestionfecha || '').slice(0, 10)
  return Boolean(done && done >= today)
}
