import { localTodayIso } from './advisorWorkspace'
import { resolveDateRange, toDateInputValue } from './dateRangePresets'
import type { PeticionPendiente } from './peticionesPendientes'

function shiftIso(iso: string, days: number): string {
  const date = new Date(`${iso}T12:00:00`)
  date.setDate(date.getDate() + days)
  return toDateInputValue(date)
}

export type BoardWorkLane = 'today' | 'atrasado' | 'proximo'

export type BoardWorkDayItem = {
  cita?: PeticionPendiente['cita']
  fechainicio?: string | null
  fechacreacion?: string | null
}

export function ticketWorkDay(item: BoardWorkDayItem): string {
  return String(item.cita?.fecha || item.fechainicio || item.fechacreacion || '').slice(0, 10)
}

export function boardWorkLane(item: BoardWorkDayItem, today = localTodayIso()): BoardWorkLane {
  const work = ticketWorkDay(item)
  if (!work || work === today) return 'today'
  return work < today ? 'atrasado' : 'proximo'
}

export function boardWorkLaneRank(lane: BoardWorkLane): number {
  if (lane === 'today') return 0
  if (lane === 'atrasado') return 1
  return 2
}

export function boardWorkLaneLabel(lane: BoardWorkLane): string {
  if (lane === 'today') return 'Hoy'
  if (lane === 'atrasado') return 'De días anteriores'
  return 'Próximos días'
}

/** Hoy primero, luego atrasados, luego lo que viene. Dentro del mismo tramo, la fecha más cercana. */
export function compareBoardWorkDay(a: BoardWorkDayItem, b: BoardWorkDayItem, today = localTodayIso()): number {
  const lane = boardWorkLaneRank(boardWorkLane(a, today)) - boardWorkLaneRank(boardWorkLane(b, today))
  if (lane !== 0) return lane
  return ticketWorkDay(a).localeCompare(ticketWorkDay(b))
}

/** Carga: un poco atrás por si la cita es hoy y la petición nació antes. */
export function boardLiveFetchRange(today = localTodayIso()): { from: string; to: string } {
  return { from: shiftIso(today, -90), to: today }
}

/** Cuentas y equipos: año en curso y, si hace falta, los 90 días anteriores. */
export function teamsDeskFetchRange(today = localTodayIso()): { from: string; to: string } {
  const year = resolveDateRange('anio')
  const live = boardLiveFetchRange(today)
  const from = [live.from, year.from].filter(Boolean).sort()[0] as string
  const days = [live.to, year.to].filter(Boolean).sort() as string[]
  const to = days[days.length - 1]
  return { from, to }
}

/** Solo el trabajo de hoy (cita o fecha de la consulta). */
export function isLiveBoardTicket(item: PeticionPendiente, today = localTodayIso()): boolean {
  return boardWorkLane(item, today) === 'today'
}

export function isTodayManualEntry(createdAt: string | null | undefined, today = localTodayIso()): boolean {
  const day = String(createdAt || '').slice(0, 10)
  return !day || day === today
}
