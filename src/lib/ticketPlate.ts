import type { PeticionPendiente } from './peticionesPendientes'

const MODERN_PLATE = /\b(\d{4})\s*[-\s.]?([BCDFGHJKLMNPRSTVWXYZ]{3})\b/i
const CLASSIC_PLATE = /\b([A-Z]{1,2})\s*[-\s.]?(\d{4})\s*[-\s.]?([A-Z]{2,3})\b/i

function compactPlate(raw: string): string {
  return raw.replace(/[\s.-]/g, '').toUpperCase()
}

export function extractPlateFromText(text: string | null | undefined): string {
  const raw = String(text || '')
  if (!raw.trim()) return ''
  const modern = raw.match(MODERN_PLATE)
  if (modern) return compactPlate(`${modern[1]}${modern[2]}`)
  const classic = raw.match(CLASSIC_PLATE)
  if (classic) return compactPlate(`${classic[1]}${classic[2]}${classic[3]}`)
  return ''
}

/** Matrícula visible: cita, texto de la consulta o notas. */
export function ticketPlate(item: {
  descripcion?: string | null
  gestionobservaciones?: string | null
  cita?: { matricula?: string | null; asunto?: string | null } | null
}): string {
  const fromCita = compactPlate(item.cita?.matricula || '')
  if (fromCita) return fromCita
  return (
    extractPlateFromText(item.descripcion) ||
    extractPlateFromText(item.gestionobservaciones) ||
    extractPlateFromText(item.cita?.asunto)
  )
}

export function ticketPlateOf(item: PeticionPendiente): string {
  return ticketPlate(item)
}
