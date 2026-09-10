import type { AssignedTask } from './advisorWorkspace'
import { isSlaCritico } from './tallerStations'
import type { PeticionPendiente } from './peticionesPendientes'

export type EstadoFilter = 'todas' | 'faltan' | 'hechas'

export const ESTADO_DONE_OPTIONS: { id: EstadoFilter; label: string }[] = [
  { id: 'faltan', label: 'No hechos' },
  { id: 'hechas', label: 'Hechos' },
  { id: 'todas', label: 'Todas' },
]

export function matchesEstadoDone(done: boolean, estado: EstadoFilter): boolean {
  if (estado === 'hechas') return done
  if (estado === 'faltan') return !done
  return true
}

export function compareTicketsByOpenFirst(a: PeticionPendiente, b: PeticionPendiente): number {
  const aOpen = a.gestionado ? 1 : 0
  const bOpen = b.gestionado ? 1 : 0
  if (aOpen !== bOpen) return aOpen - bOpen
  const aSla = !a.gestionado && (isSlaCritico(a.fechainicio) || isSlaCritico(a.cita?.fecha)) ? 0 : 1
  const bSla = !b.gestionado && (isSlaCritico(b.fechainicio) || isSlaCritico(b.cita?.fecha)) ? 0 : 1
  if (aSla !== bSla) return aSla - bSla
  return String(b.fechainicio || '').localeCompare(String(a.fechainicio || ''))
}

export function compareTasksByOpenFirst(a: AssignedTask, b: AssignedTask, today: string): number {
  const aDone = a.status === 'hecho' ? 1 : 0
  const bDone = b.status === 'hecho' ? 1 : 0
  if (aDone !== bDone) return aDone - bDone
  const aOver = a.status === 'pendiente' && a.dueDate < today ? 0 : 1
  const bOver = b.status === 'pendiente' && b.dueDate < today ? 0 : 1
  if (aOver !== bOver) return aOver - bOver
  return String(b.dueDate || '').localeCompare(String(a.dueDate || ''))
}
