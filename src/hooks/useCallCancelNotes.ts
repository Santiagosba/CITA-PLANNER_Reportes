import type { CallNotesByPhone } from '../lib/cancelMotiveFromSpeech'
import type { Workshop } from '../types'

type Range = { from?: string; to?: string }

const empty: CallNotesByPhone = new Map()

/**
 * No consulta `llamadas_softphone` desde el navegador: RLS de aviold
 * responde 403 con la anon key. El motivo de cancelación sale de las
 * observaciones de la cita / AVIBOT.
 */
export function useCallCancelNotes(_workshop: Workshop, _range: Range) {
  return { notesByPhone: empty, loading: false }
}
