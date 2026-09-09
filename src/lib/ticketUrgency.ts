/**
 * Urgencia operativa de un ticket.
 * Puntuación 0–100: SLA + espera + palabras de riesgo + si falta cita.
 */

import { isPeticionPendiente, type PeticionPendiente } from './peticionesPendientes'
import { isSlaCritico } from './tallerStations'

export type BoardPriority = 'urgente' | 'alta' | 'media' | 'baja' | 'hecho'

export type UrgencyScore = {
  score: number
  priority: BoardPriority
  reasons: string[]
}

const KEYWORDS: { re: RegExp; weight: number; label: string }[] = [
  { re: /no arranca|inmoviliz|remolc|parado en (carretera|autov)/i, weight: 34, label: 'Vehículo inmovilizado' },
  { re: /siniestro|accidente|golpe fuerte/i, weight: 32, label: 'Siniestro' },
  { re: /urgent|prioridad|ya mismo|ahora mismo/i, weight: 28, label: 'Marcado urgente' },
  { re: /humo|fuego|quemad|fuga de (aceite|combustible)/i, weight: 26, label: 'Riesgo de seguridad' },
  { re: /sin frenos|frenos (fall|rot)/i, weight: 24, label: 'Frenos' },
  { re: /aver[ií]a grave|motor (roto|fundido|se ha parado)/i, weight: 22, label: 'Avería grave' },
  { re: /perit|mapfre|mutua|allianz/i, weight: 14, label: 'Peritaje / seguro' },
  { re: /ruido|vibrac|testigo|check engine|no enciende/i, weight: 10, label: 'Síntoma activo' },
  { re: /cita|revisi[oó]n|manten/i, weight: 5, label: 'Cita / revisión' },
]

function waitMinutes(iso: string | null | undefined, now: number): number | null {
  if (!iso) return null
  const start = new Date(iso).getTime()
  if (Number.isNaN(start)) return null
  return Math.max(0, (now - start) / 60_000)
}

function keywordScore(text: string): { points: number; labels: string[] } {
  const hits = KEYWORDS.filter((item) => item.re.test(text))
  if (!hits.length) return { points: 0, labels: [] }
  hits.sort((a, b) => b.weight - a.weight)
  const points = Math.min(40, hits[0].weight + hits.slice(1).reduce((sum, item) => sum + item.weight * 0.35, 0))
  return { points, labels: hits.slice(0, 2).map((item) => item.label) }
}

function scoreFromText(text: string, startedAt: string | null | undefined, now: number): Omit<UrgencyScore, 'priority'> {
  const reasons: string[] = []
  let score = 10

  const wait = waitMinutes(startedAt, now)
  if (wait != null) {
    if (isSlaCritico(startedAt, now) || wait <= 15) {
      const remaining = Math.max(0, 1 - wait / 15)
      score += 36 + remaining * 18
      reasons.push('SLA de contacto <15 min')
    } else {
      // Envejecimiento: crece en log para no saturar a las 48 h.
      const aging = Math.min(36, 16 + 14 * Math.log10(wait / 15 + 1))
      score += aging
      if (wait >= 180) reasons.push('Lleva horas esperando')
      else reasons.push('Fuera de SLA')
    }
  }

  const keywords = keywordScore(text)
  if (keywords.points > 0) {
    score += keywords.points
    reasons.push(...keywords.labels)
  }

  if (/voz|llamad|tel[eé]fono/i.test(text)) score += 4
  if (/whats?app/i.test(text)) score += 2

  return {
    score: Math.round(Math.min(100, Math.max(0, score))),
    reasons,
  }
}

function toPriority(score: number, done: boolean): BoardPriority {
  if (done) return 'hecho'
  if (score >= 72) return 'urgente'
  if (score >= 50) return 'alta'
  if (score >= 28) return 'media'
  return 'baja'
}

export function scoreTicketUrgency(item: PeticionPendiente, now = Date.now()): UrgencyScore {
  if (item.gestionado) {
    return { score: 0, priority: 'hecho', reasons: ['Ya está gestionado'] }
  }

  const text = `${item.tipopeticion || ''} ${item.descripcion || ''} ${item.cita?.asunto || ''} ${item.gestionobservaciones || ''}`
  const base = scoreFromText(text, item.fechainicio, now)
  if (isPeticionPendiente(item)) {
    base.score = Math.min(100, base.score + 8)
    base.reasons.push('Sin cita')
  }

  return {
    score: base.score,
    priority: toPriority(base.score, false),
    reasons: base.reasons,
  }
}

export function scoreManualUrgency(input: { title: string; note: string; createdAt: string }, now = Date.now()): UrgencyScore {
  const base = scoreFromText(`${input.title} ${input.note}`, input.createdAt, now)
  return {
    score: base.score,
    priority: toPriority(base.score, false),
    reasons: base.reasons,
  }
}

export function defaultBoardPriority(item: PeticionPendiente, now = Date.now()): BoardPriority {
  return scoreTicketUrgency(item, now).priority
}
