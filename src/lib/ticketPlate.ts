import type { PeticionPendiente } from './peticionesPendientes'

const MODERN_LETTERS = 'BCDFGHJKLMNPRSTVWXYZ'
const MODERN_RE = new RegExp(`\\b(\\d{4})[\\s./-]*([${MODERN_LETTERS}]{3})\\b`, 'gi')
const CLASSIC_RE = /\b([A-Z]{1,2})[\s./-]*(\d{4})[\s./-]*([A-Z]{2,3})\b/i
const LOOSE_MODERN_RE = new RegExp(`(\\d{4})([${MODERN_LETTERS}]{3})`)
const LOOSE_CLASSIC_RE = /^([A-Z]{1,2})(\d{4})([A-Z]{2,3})$/
const FAKE_LETTER_BLOCKS = new Set(['BMW'])

export function compactPlate(raw: string): string {
  return String(raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase()
}

export function isCompletePlate(compact: string): boolean {
  const modern = compact.match(new RegExp(`^(\\d{4})([${MODERN_LETTERS}]{3})$`))
  if (modern) return !FAKE_LETTER_BLOCKS.has(modern[2])
  return LOOSE_CLASSIC_RE.test(compact)
}

/** Vale para pintar: tiene letras y números. Un "3" o un "9122" suelto no es una chapa. */
export function isUsablePlate(compact: string): boolean {
  if (FAKE_LETTER_BLOCKS.has(compact.slice(-3))) return false
  if (isCompletePlate(compact)) return true
  if (compact.length < 5 || compact.length > 10) return false
  return /[A-Z]/.test(compact) && /\d{2,}/.test(compact)
}

function prettyPlate(compact: string): string {
  const modern = compact.match(new RegExp(`^(\\d{4})([${MODERN_LETTERS}]{3})$`))
  if (modern) return `${modern[1]} ${modern[2]}`
  const classic = compact.match(/^([A-Z]{1,2})(\d{4})([A-Z]{2,3})$/)
  if (classic) return `${classic[1]} ${classic[2]} ${classic[3]}`
  return compact.replace(/([A-Z]+)(\d+)/g, '$1 $2').replace(/(\d+)([A-Z]+)/g, '$1 $2')
}

/** 1234ABC → 1234 ABC. Si el texto trae basura, se queda solo la chapa real. */
export function formatMatricula(raw: string): string {
  const extracted = extractPlateFromText(raw, { loose: String(raw || '').length <= 18 })
  if (extracted) return prettyPlate(extracted)
  const compact = compactPlate(raw)
  if (isUsablePlate(compact)) return prettyPlate(compact)
  return ''
}

export function extractPlateFromText(
  text: string | null | undefined,
  options: { loose?: boolean } = {},
): string {
  const raw = String(text || '')
  if (!raw.trim()) return ''

  for (const modern of raw.matchAll(MODERN_RE)) {
    if (modern[1] && modern[2] && !FAKE_LETTER_BLOCKS.has(modern[2].toUpperCase())) {
      return compactPlate(`${modern[1]}${modern[2]}`)
    }
  }

  const classic = raw.match(CLASSIC_RE)
  if (classic) return compactPlate(`${classic[1]}${classic[2]}${classic[3]}`)

  if (!options.loose) return ''
  const compact = compactPlate(raw)
  if (compact.length < 5 || compact.length > 14) return ''
  const looseModern = compact.match(LOOSE_MODERN_RE)
  if (
    looseModern &&
    !FAKE_LETTER_BLOCKS.has(looseModern[2]) &&
    isCompletePlate(`${looseModern[1]}${looseModern[2]}`)
  ) {
    return `${looseModern[1]}${looseModern[2]}`
  }
  const looseClassic = compact.match(LOOSE_CLASSIC_RE)
  if (looseClassic) return compact
  return ''
}

function plateBlobs(item: {
  descripcion?: string | null
  gestionobservaciones?: string | null
  cita?: { matricula?: string | null; asunto?: string | null } | null
}): string[] {
  return [
    item.cita?.matricula,
    item.descripcion,
    item.gestionobservaciones,
    item.cita?.asunto,
  ].filter((value): value is string => Boolean(value && String(value).trim()))
}

/** Matrícula visible: cita, texto de la consulta o notas. */
export function ticketPlate(item: {
  descripcion?: string | null
  gestionobservaciones?: string | null
  cita?: { matricula?: string | null; asunto?: string | null } | null
}): string {
  const blobs = plateBlobs(item)
  for (const blob of blobs) {
    const found = extractPlateFromText(blob, { loose: blob.length <= 18 })
    if (found && isCompletePlate(found)) return found
  }

  const stored = compactPlate(item.cita?.matricula || '')
  if (isUsablePlate(stored)) return stored

  for (const blob of blobs) {
    const found = extractPlateFromText(blob, { loose: blob.length <= 18 })
    if (found && isUsablePlate(found)) return found
  }
  return ''
}

export function ticketPlateOf(item: PeticionPendiente): string {
  return ticketPlate(item)
}
