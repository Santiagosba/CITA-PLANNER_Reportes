import type { CallNotesByPhone } from './cancelMotiveFromSpeech'
import type { Workshop } from '../types'

/**
 * Las notas de `llamadas_softphone` no se leen desde el navegador:
 * RLS de aviold responde 403 con la anon key. El motivo de cancelación
 * sale de las observaciones de la cita / AVIBOT.
 */
export async function fetchCallNotesByPhone(
  _workshop: Workshop,
  _range: { from?: string; to?: string },
): Promise<CallNotesByPhone> {
  return new Map()
}
