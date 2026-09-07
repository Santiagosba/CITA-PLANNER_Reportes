import { isPeticionPendiente, type PeticionPendiente } from './peticionesPendientes'
import { isSlaCritico } from './tallerStations'

export type AiSearchHit = {
  item: PeticionPendiente
  score: number
  reason: string
}

function haystack(item: PeticionPendiente): string {
  const cita = item.cita
  return [
    item.descripcion,
    item.tipopeticion,
    item.caller,
    cita?.nombre,
    cita?.apellidos,
    cita?.matricula,
    cita?.marca,
    cita?.modelo,
    cita?.asunto,
    cita?.telefono,
    cita?.movil,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function plateKey(value: string): string {
  return value.replace(/[\s.-]/g, '').toUpperCase()
}

/** Interpreta la búsqueda como lo haría Laura: matrícula, cliente, avería o un aviso (SLA, urgente…). */
export function searchPeticionesAi(items: PeticionPendiente[], raw: string): AiSearchHit[] {
  const query = raw.trim()
  if (!query) return []

  const lower = query.toLowerCase()
  const compact = plateKey(query)
  const tokens = lower.split(/\s+/).filter((token) => token.length > 1)
  const wantSla = /sla|cr[ií]tico|critico|15\s*min/.test(lower)
  const wantUrgent = /urgent|aver[ií]a|no arranca|parado|remolc|siniestro/.test(lower)
  const wantOpen = /faltan|pendiente|sin gestionar|abiert/.test(lower)
  const looksPlate = /^[0-9]{4}[BCDFGHJKLMNPRSTVWXYZ]{3}$/i.test(compact) || /^[A-Z]{1,2}[0-9]{4}[A-Z]{2,3}$/i.test(compact)

  const hits: AiSearchHit[] = []

  for (const item of items) {
    const text = haystack(item)
    const plate = plateKey(item.cita?.matricula || '')
    const pending = isPeticionPendiente(item)
    const sla = !item.gestionado && (isSlaCritico(item.fechainicio) || isSlaCritico(item.cita?.fecha))
    let score = 0
    let reason = 'Coincidencia'

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
      reason = 'Urgente / avería'
    }
    if (wantOpen && pending) {
      score += 25
      reason = 'Pendiente'
    }

    for (const token of tokens) {
      if (text.includes(token)) score += token.length >= 4 ? 18 : 10
    }

    if (score <= 0) continue
    if (reason === 'Coincidencia' && item.cita?.nombre && text.includes(lower)) reason = 'Cliente'
    else if (reason === 'Coincidencia' && item.descripcion && item.descripcion.toLowerCase().includes(lower)) {
      reason = 'Avería'
    }

    hits.push({ item, score, reason })
  }

  hits.sort((a, b) => b.score - a.score || String(b.item.fechainicio).localeCompare(String(a.item.fechainicio)))
  return hits
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
