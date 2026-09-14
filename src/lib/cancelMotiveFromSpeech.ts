import { splitStoredNotes } from './callFormat'
import { phoneMatchKey } from './ticketClient'

export type CallNotesByPhone = Map<string, string>

const AVIBOT_MARK = /[-–—]?\s*Cancelaci[oó]n cita AVIBOT:\s*/i

/** Quita el sello de AVIBOT y deja el cuerpo + lo que se dijo al confirmar. */
export function splitAvibotNote(text: string): { body: string; confirmation: string } {
  const match = text.match(AVIBOT_MARK)
  if (!match || match.index == null) return { body: text.trim(), confirmation: '' }
  return {
    body: text.slice(0, match.index).trim(),
    confirmation: text.slice(match.index + match[0].length).trim(),
  }
}

/** Texto útil de una transcripción: primero el cliente, luego el resumen. */
export function speechFromStoredNotes(raw: string | null | undefined): string {
  const text = String(raw || '').trim()
  if (!text) return ''
  const { lines, summary } = splitStoredNotes(text)
  const client = lines
    .filter((line) => line.speaker === 'cliente')
    .map((line) => line.text)
    .join(' ')
  const dialog = lines.map((line) => line.text).join(' ')
  return [client, summary ?? '', dialog, lines.length ? '' : text]
    .filter((part) => part.trim())
    .join('\n')
}

export function phoneKeysOf(values: Array<string | null | undefined>): string[] {
  const keys = new Set<string>()
  for (const value of values) {
    const key = phoneMatchKey(value)
    if (key) keys.add(key)
  }
  return [...keys]
}

export function callSpeechForPhones(phones: string[], notes: CallNotesByPhone | undefined): string {
  if (!notes || !phones.length) return ''
  return phones
    .flatMap((phone) => {
      const text = notes.get(phone)
      return text ? [text] : []
    })
    .join('\n')
}

/**
 * Motivo que se oye o se anota en la llamada.
 * No usa el tipo de cita («Cita revisión») ni el sello «Confirmación cancelación AVIBOT».
 */
export function inferCancelReasonFromSpeech(text: string): string | null {
  const { body, confirmation } = splitAvibotNote(text)
  const t = `${body}\n${confirmation}`.toLowerCase()
  if (!t.trim()) return null

  if (/duplicad/.test(t)) return 'Duplicada'
  if (/no hueco|sin hueco|no hay hueco/.test(t)) return 'Sin hueco'
  if (/gestionamos desde|otro concesion|otra marca/.test(t)) return 'Gestionada en otro concesionario'
  if (/ha ido a la competencia|optando por la competencia|con la competencia/.test(t)) {
    return 'Ha ido a la competencia'
  }
  if (/necesita el coche (el )?mismo d[ií]a|necesita el coche hoy/.test(t)) {
    return 'Necesita el coche el mismo día'
  }
  if (/ya no (lo )?necesita|ya no necesita la visita|ya no lo necesita/.test(t)) {
    return 'Ya no lo necesita'
  }
  if (
    /no (puedo|pueda|puede) (ir|acudir|llevar|pasar)|me viene mal|no me (va|viene) bien|otro d[ií]a/.test(
      t,
    )
  ) {
    return 'No le viene bien la fecha'
  }
  if (/descontento con los precios|muy caro|precio elevado|por precio|los precios/.test(t)) {
    return 'Por precio'
  }
  if (/no asiste|no acude|no se presenta|no presentado|no voy a (ir|acudir)/.test(t)) {
    return 'No asiste a la cita'
  }
  if (/solicitud por error|pedida por error|creada por error|me he equivocado/.test(t)) {
    return 'Solicitud por error'
  }
  if (/telf.*erron|datos de contacto|n[uú]mero err/.test(t)) return 'Datos de contacto erróneos'
  if (/no contesta|ilocaliz|sin respuesta/.test(t)) return 'No contesta'
  if (
    /reemplazo|cambio de fecha|modificaci[oó]n de cita|confirmaci[oó]n modificaci[oó]n|mod d[ií]a|mod hora/.test(
      t,
    )
  ) {
    return 'Cambio de fecha'
  }
  if (/petici[oó]n del cliente|el cliente (pide|solicita|quiere) cancel/.test(t)) {
    return 'Cancelada por el cliente'
  }
  if (/client[ae].*cancel|cancel.*client|cancelada por (el |la )?client/.test(t)) {
    return 'Cancelada por el cliente'
  }
  return null
}
