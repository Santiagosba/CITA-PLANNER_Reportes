import { speechFromStoredNotes, type CallNotesByPhone } from './cancelMotiveFromSpeech'
import { isLocalPreviewWorkshop } from './localPreview'
import { supabaseAviOld } from './supabase'
import { fetchAllSupabasePages } from './supabaseFetchAll'
import { phoneMatchKey } from './ticketClient'
import type { Workshop } from '../types'

type SoftphoneNoteRow = {
  telefono_destino?: string | null
  telefono_origen?: string | null
  notas?: string | null
  notas_titular?: string | null
  tags?: unknown
}

function shiftIso(iso: string | undefined, days: number): string | undefined {
  if (!iso) return undefined
  const date = new Date(`${iso}T12:00:00`)
  if (Number.isNaN(date.getTime())) return iso
  date.setDate(date.getDate() + days)
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function rowSpeech(row: SoftphoneNoteRow): string {
  const tags = Array.isArray(row.tags)
    ? row.tags.map((tag) => String(tag || '')).join(' ')
    : row.tags && typeof row.tags === 'object'
      ? JSON.stringify(row.tags)
      : ''
  return speechFromStoredNotes([row.notas, row.notas_titular, tags].filter(Boolean).join('\n'))
}

/** Transcripciones y resúmenes del softphone en el periodo, por teléfono. */
export async function fetchCallNotesByPhone(
  workshop: Workshop,
  range: { from?: string; to?: string },
): Promise<CallNotesByPhone> {
  if (isLocalPreviewWorkshop(workshop)) return new Map()

  const from = shiftIso(range.from, -7)
  const to = shiftIso(range.to, 2)
  if (!from && !to) return new Map()

  const map: CallNotesByPhone = new Map()

  const add = (phone: string | null | undefined, speech: string) => {
    const key = phoneMatchKey(phone)
    const text = speech.trim()
    if (!key || !text) return
    const prev = map.get(key)
    map.set(key, prev ? `${prev}\n${text}` : text)
  }

  try {
    const rows = await fetchAllSupabasePages<SoftphoneNoteRow>(() => {
      let query = supabaseAviOld
        .from('llamadas_softphone')
        .select('telefono_destino,telefono_origen,notas,notas_titular,tags')
      if (from) query = query.gte('fecha_inicio', `${from}T00:00:00`)
      if (to) query = query.lte('fecha_inicio', `${to}T23:59:59`)
      return query.order('fecha_inicio', { ascending: false })
    })
    for (const row of rows) {
      const speech = rowSpeech(row)
      add(row.telefono_destino, speech)
      add(row.telefono_origen, speech)
    }
  } catch {
    /* RLS o tabla no visible: seguimos con las notas de la cita */
  }

  try {
    const botRows = await fetchAllSupabasePages<{
      phone_called?: string | null
      summary?: string | null
      outcome_code?: string | null
      outcome_type?: string | null
      normalized_outcome_type?: string | null
    }>(() => {
      let query = supabaseAviOld
        .from('callbot_call_recordings')
        .select('phone_called,summary,outcome_code,outcome_type,normalized_outcome_type')
      if (from) query = query.gte('started_at', `${from}T00:00:00`)
      if (to) query = query.lte('started_at', `${to}T23:59:59`)
      return query.order('started_at', { ascending: false })
    })
    for (const row of botRows) {
      add(
        row.phone_called,
        [row.summary, row.normalized_outcome_type, row.outcome_type, row.outcome_code]
          .filter(Boolean)
          .join('\n'),
      )
    }
  } catch {
    /* sin callbot en este entorno */
  }

  return map
}
