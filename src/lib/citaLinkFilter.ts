import type { PeticionPendiente } from './peticionesPendientes'

export type CitaLinkFilter = 'todas' | 'con_cita' | 'sin_cita'

export const CITA_LINK_OPTIONS: { id: CitaLinkFilter; label: string }[] = [
  { id: 'todas', label: 'Todas' },
  { id: 'con_cita', label: 'Con cita' },
  { id: 'sin_cita', label: 'Sin cita' },
]

const EMPTY_UUID = /^0{8}-0{4}-0{4}-0{4}-0{12}$/i

function hasCitaId(value: string | null | undefined): boolean {
  const id = String(value || '').trim()
  return Boolean(id) && !EMPTY_UUID.test(id)
}

/**
 * Con cita = IDCita enlazado o fecha de calendario.
 * El ChatBot casi nunca escribe IDCita; el CRM cruza la cita por teléfono
 * y deja fecha/matrícula en `cita` sin rellenar el id.
 */
export function ticketHasCita(
  item: Pick<PeticionPendiente, 'idcita' | 'cita'>,
): boolean {
  return hasCitaId(item.idcita) || hasCitaId(item.cita?.idcita) || Boolean(item.cita?.fecha)
}

export function matchesCitaLink(
  item: Pick<PeticionPendiente, 'idcita' | 'cita'>,
  filter: CitaLinkFilter,
): boolean {
  if (filter === 'todas') return true
  const conCita = ticketHasCita(item)
  return filter === 'con_cita' ? conCita : !conCita
}

/** Entradas manuales del tablero no tienen cita vinculada. */
export function matchesManualCitaLink(filter: CitaLinkFilter): boolean {
  return filter !== 'con_cita'
}

export function citaLinkEmptyCopy(filter: CitaLinkFilter): string {
  if (filter === 'con_cita') return 'No hay tickets con cita.'
  if (filter === 'sin_cita') return 'No hay tickets sin cita.'
  return 'No hay tickets.'
}
