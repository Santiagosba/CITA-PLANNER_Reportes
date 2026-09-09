/** Formato compartido por la app Teléfono: dinero, duración, causas de colgado y transcripciones. */

import type { TranscriptLine } from './softphone'

export function fmtMoney(amount: number, currency: string, opts: { precise?: boolean } = {}): string {
  const code = (currency || 'USD').toUpperCase()
  const abs = Math.abs(amount)
  // Las llamadas cuestan céntimos: con 2 decimales casi todo saldría «0,00».
  const digits = opts.precise || abs < 0.1 ? 4 : abs < 1 ? 3 : 2
  try {
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: code,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(amount)
  } catch {
    return `${amount.toFixed(digits)} ${code}`
  }
}

export function fmtSeconds(total: number | null | undefined): string {
  if (total == null || total < 0) return '—'
  const t = Math.floor(total)
  const h = Math.floor(t / 3600)
  const m = Math.floor((t % 3600) / 60)
  const s = t % 60
  const mm = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return h > 0 ? `${h}:${mm}` : mm
}

export function fmtDateTime(iso: string | number | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return `${d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })} · ${d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`
}

const HANGUP_LABELS: Record<string, string> = {
  normal_clearing: 'Colgado con normalidad',
  local_hangup: 'Colgaste tú',
  agent_hangup: 'Colgó el asesor',
  customer_hangup: 'Colgó el cliente',
  originator_cancel: 'Cancelada antes de contestar',
  call_rejected: 'Rechazada por el destino',
  user_busy: 'Comunicando',
  no_answer: 'Sin respuesta',
  timeout: 'Sin respuesta (tiempo agotado)',
  unallocated_number: 'Número inexistente',
  invalid_number_format: 'Número no válido',
  normal_unspecified: 'Terminada por la red',
  media_error: 'Sin micrófono / error de audio',
  client_disconnect: 'Teléfono desconectado',
  network_error: 'Error de red',
}

export function hangupLabel(cause: string | null | undefined): string {
  const key = String(cause || '').trim().toLowerCase()
  if (!key) return '—'
  if (HANGUP_LABELS[key]) return HANGUP_LABELS[key]
  return key.replace(/_/g, ' ')
}

export function estadoLabel(estado: string | null | undefined, answered: boolean): string {
  switch (String(estado || '').toLowerCase()) {
    case 'completed':
    case 'answered':
      return 'Atendida'
    case 'missed':
      return 'Perdida'
    case 'rejected':
      return 'Rechazada'
    case 'failed':
      return 'Fallida'
    case 'ringing':
    case 'in_progress':
    case 'initiated':
      return 'En curso'
    default:
      return answered ? 'Atendida' : 'Sin respuesta'
  }
}

const TRANSCRIPT_HEADING = /^transcripci[oó]n de la llamada$/i
const SUMMARY_HEADING = /^(resumen|titular)\b/i
const SPEAKER_LINE = /^(Asesor|Cliente):\s*(.*)$/i

/** Separa el diálogo (Asesor/Cliente) del párrafo de resumen que api-crm puede añadir. */
export function splitStoredNotes(text: string | null | undefined): {
  lines: TranscriptLine[]
  summary: string | null
} {
  if (!text?.trim()) return { lines: [], summary: null }
  const lines: TranscriptLine[] = []
  const summaryParts: string[] = []
  let inSummary = false
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || TRANSCRIPT_HEADING.test(line)) continue
    if (SUMMARY_HEADING.test(line) && lines.length > 0) {
      inSummary = true
      const rest = line.replace(SUMMARY_HEADING, '').replace(/^[:.\s-]+/, '').trim()
      if (rest) summaryParts.push(rest)
      continue
    }
    const match = SPEAKER_LINE.exec(line)
    if (match && !inSummary) {
      lines.push({
        id: `s${lines.length}`,
        speaker: match[1].toLowerCase() === 'asesor' ? 'asesor' : 'cliente',
        text: match[2],
        final: true,
        at: '',
      })
      continue
    }
    if (lines.length === 0 || inSummary) summaryParts.push(line)
  }
  const summary = summaryParts.join(' ').replace(/\s+/g, ' ').trim()
  return { lines, summary: summary || null }
}

/** Convierte las notas guardadas («Asesor: … / Cliente: …») en líneas de transcripción. */
export function parseStoredTranscript(text: string | null | undefined): TranscriptLine[] {
  return splitStoredNotes(text).lines
}

export function hasStoredTranscript(text: string | null | undefined): boolean {
  return splitStoredNotes(text).lines.length > 0
}

const PRODUCT_LABELS: Record<string, string> = {
  'call-control': 'Llamada (Call Control)',
  'sip-trunking': 'Llamada (SIP)',
  webrtc: 'Pata WebRTC (navegador)',
  recording: 'Grabación',
  'media-streaming': 'Streaming de audio (transcripción)',
  stt: 'Reconocimiento de voz',
}

export function productLabel(product: string): string {
  return PRODUCT_LABELS[product] || product
}
