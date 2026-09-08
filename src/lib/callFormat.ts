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

/** Convierte las notas guardadas («Asesor: … / Cliente: …») en líneas de transcripción. */
export function parseStoredTranscript(text: string | null | undefined): TranscriptLine[] {
  if (!text) return []
  const out: TranscriptLine[] = []
  const rows = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !/^transcripci[oó]n de la llamada$/i.test(line))
  rows.forEach((line, index) => {
    const match = /^(Asesor|Cliente):\s*(.*)$/i.exec(line)
    out.push({
      id: `s${index}`,
      speaker: match ? (match[1].toLowerCase() === 'asesor' ? 'asesor' : 'cliente') : 'cliente',
      text: match ? match[2] : line,
      final: true,
      at: '',
    })
  })
  return out
}

export function hasStoredTranscript(text: string | null | undefined): boolean {
  return /transcripci[oó]n/i.test(text || '') && /(Asesor|Cliente):/i.test(text || '')
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
