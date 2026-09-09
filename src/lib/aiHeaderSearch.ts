import { isPeticionPendiente, type PeticionPendiente } from './peticionesPendientes'
import { isSlaCritico } from './tallerStations'
import { ticketClientName, ticketClientPhone } from './ticketClient'

export type AiSearchHit = {
  item: PeticionPendiente
  score: number
  reason: string
}

const STOPWORDS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'un', 'una', 'y', 'o', 'en', 'con', 'por', 'para', 'al'])

function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function digits(value: string): string {
  return value.replace(/\D/g, '')
}

function plateKey(value: string): string {
  return value.replace(/[\s.-]/g, '').toUpperCase()
}

function haystack(item: PeticionPendiente): string {
  const cita = item.cita
  return [
    ticketClientName(item),
    item.descripcion,
    item.tipopeticion,
    item.caller,
    item.gestionemail,
    item.gestionobservaciones,
    cita?.nombre,
    cita?.apellidos,
    cita?.matricula,
    cita?.marca,
    cita?.modelo,
    cita?.asunto,
    cita?.telefono,
    cita?.movil,
    cita?.email,
  ]
    .filter(Boolean)
    .join(' ')
}

/** Interpreta la búsqueda como Laura: nombre, teléfono, matrícula, avería o aviso. */
export function searchPeticionesAi(items: PeticionPendiente[], raw: string): AiSearchHit[] {
  const query = raw.trim()
  if (!query) return []

  const folded = fold(query)
  const compact = plateKey(query)
  const phoneQ = digits(query)
  const tokens = folded
    .split(/[\s,;./+-]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !STOPWORDS.has(token))
  const wantSla = /sla|cr[ií]tico|critico|15\s*min/.test(folded)
  const wantUrgent = /urgent|aver[ií]a|averia|no arranca|parado|remolc|siniestro/.test(folded)
  const wantOpen = /faltan|pendiente|sin gestionar|abiert/.test(folded)
  const looksPlate =
    /^[0-9]{4}[BCDFGHJKLMNPRSTVWXYZ]{3}$/i.test(compact) || /^[A-Z]{1,2}[0-9]{4}[A-Z]{2,3}$/i.test(compact)

  const hits: AiSearchHit[] = []

  for (const item of items) {
    const text = fold(haystack(item))
    const name = fold(ticketClientName(item))
    const phone = digits(ticketClientPhone(item))
    const plate = plateKey(item.cita?.matricula || '')
    const pending = isPeticionPendiente(item)
    const sla = !item.gestionado && (isSlaCritico(item.fechainicio) || isSlaCritico(item.cita?.fecha))
    let score = 0
    let reason = 'Coincidencia'

    if (name) {
      if (name === folded) {
        score += 130
        reason = 'Cliente'
      } else if (name.includes(folded) || (folded.length >= 3 && folded.includes(name))) {
        score += 110
        reason = 'Cliente'
      }
    }

    if (phoneQ.length >= 3 && phone.includes(phoneQ)) {
      score += phoneQ.length >= 6 ? 120 : 70
      if (reason === 'Coincidencia') reason = 'Teléfono'
    }

    if (looksPlate && plate && (plate === compact || plate.includes(compact))) {
      score += 120
      reason = 'Matrícula'
    } else if (plate && compact.length >= 4 && plate.includes(compact)) {
      score += 80
      reason = 'Matrícula'
    }

    if (wantSla && sla) {
      score += 90
      reason = 'SLA crítico'
    }
    if (wantUrgent && /urgent|aver|siniestro|no arranca|parado|remolc/.test(text)) {
      score += 50
      if (reason === 'Coincidencia') reason = 'Urgente / avería'
    }
    if (wantOpen && pending) {
      score += 25
      if (reason === 'Coincidencia') reason = 'Pendiente'
    }

    let tokensHit = 0
    for (const token of tokens) {
      if (name.includes(token)) {
        score += 24
        tokensHit += 1
        if (reason === 'Coincidencia') reason = 'Cliente'
        continue
      }
      if (text.includes(token)) {
        score += token.length >= 4 ? 16 : 9
        tokensHit += 1
      }
    }
    if (tokens.length > 1 && tokensHit === tokens.length) score += 20

    if (folded.length >= 3 && text.includes(folded)) score += 12

    if (score <= 0) continue
    if (reason === 'Coincidencia' && item.descripcion && fold(item.descripcion).includes(folded)) {
      reason = 'Avería'
    }

    hits.push({ item, score, reason })
  }

  hits.sort((a, b) => b.score - a.score || String(b.item.fechainicio).localeCompare(String(a.item.fechainicio)))
  return hits
}

export function matchesTicketSearch(item: PeticionPendiente, raw: string): boolean {
  if (!raw.trim()) return true
  return searchPeticionesAi([item], raw).length > 0
}

export function headerNoticeItems(items: PeticionPendiente[]): PeticionPendiente[] {
  const sla: PeticionPendiente[] = []
  const pending: PeticionPendiente[] = []
  for (const item of items) {
    if (item.gestionado) continue
    if (isSlaCritico(item.fechainicio) || isSlaCritico(item.cita?.fecha)) sla.push(item)
    else if (isPeticionPendiente(item)) pending.push(item)
  }
  sla.sort((a, b) => String(b.fechainicio).localeCompare(String(a.fechainicio)))
  pending.sort((a, b) => String(b.fechainicio).localeCompare(String(a.fechainicio)))
  return [...sla, ...pending]
}
