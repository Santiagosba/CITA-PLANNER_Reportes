export const TICKET_CLIENT_FALLBACK = 'Cliente sin nombre'

function clean(value: string | null | undefined): string {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

export function looksLikePhone(value: string): boolean {
  const compact = value.replace(/\s+/g, '')
  const digits = compact.replace(/\D/g, '')
  if (digits.length < 6) return false
  return digits.length / Math.max(compact.length, 1) >= 0.65
}

/** Últimos 9 dígitos: sirve para cruzar +34 677… con 677… */
export function phoneMatchKey(value: string | null | undefined): string {
  const digits = String(value || '').replace(/\D/g, '')
  if (digits.length < 9) return ''
  return digits.slice(-9)
}

export type ClientNameSource = {
  nombre?: string | null
  apellidos?: string | null
  razonSocial?: string | null
  contacto?: string | null
  telefono?: string | null
  movil?: string | null
  marca?: string | null
  modelo?: string | null
}

export type TicketClientInput = {
  caller?: string | null
  descripcion?: string | null
  gestionobservaciones?: string | null
  /** Nombre cruzado por teléfono con una cita (sin enlazar IDCita). */
  clienteNombre?: string | null
  cita?: ClientNameSource | null
}

export function personFromCitaFields(cita: ClientNameSource | null | undefined): string {
  if (!cita) return ''
  const fromName = [clean(cita.nombre), clean(cita.apellidos)].filter(Boolean).join(' ')
  if (fromName && !looksLikePhone(fromName)) return fromName
  const company = clean(cita.razonSocial)
  if (company && !looksLikePhone(company)) return company
  const contact = clean(cita.contacto)
  if (contact && !looksLikePhone(contact)) return contact
  return ''
}

function nameFromDescripcion(text: string | null | undefined): string {
  const raw = clean(text)
  if (!raw) return ''
  const patterns = [
    /(?:me llamo|soy)\s+([A-ZÁÉÍÓÚÑ][\p{L}'´]+(?:\s+[A-ZÁÉÍÓÚÑ][\p{L}'´]+){0,3})/iu,
    /cliente\s*[:\-]\s*([A-ZÁÉÍÓÚÑ][\p{L}'´]+(?:\s+[A-ZÁÉÍÓÚÑ][\p{L}'´]+){0,3})/iu,
    /nombre\s*[:\-]\s*([A-ZÁÉÍÓÚÑ][\p{L}'´]+(?:\s+[A-ZÁÉÍÓÚÑ][\p{L}'´]+){0,3})/iu,
  ]
  for (const re of patterns) {
    const hit = raw.match(re)
    const name = clean(hit?.[1] ?? '')
    if (name && !looksLikePhone(name) && name.length >= 3) return name
  }
  return ''
}

/** Nombre real del cliente. Nunca el teléfono. */
export function ticketClientName(p: TicketClientInput): string {
  const fromCita = personFromCitaFields(p.cita)
  if (fromCita) return fromCita

  const crossed = clean(p.clienteNombre)
  if (crossed && !looksLikePhone(crossed)) return crossed

  const obs = p.gestionobservaciones || ''
  const inbound = obs.match(/inbound\s+manual\s*[·•\-]\s*(.+)$/im)
  if (inbound?.[1]) {
    const name = clean(inbound[1].split('\n')[0])
    if (name && !looksLikePhone(name) && !/^sin nombre$/i.test(name)) return name
  }

  return nameFromDescripcion(p.descripcion)
}

export function ticketClientLabel(p: TicketClientInput): string {
  return ticketClientName(p) || TICKET_CLIENT_FALLBACK
}

export function ticketClientPhone(p: TicketClientInput): string {
  return clean(p.caller || p.cita?.movil || p.cita?.telefono)
}

export function ticketVehicleLabel(p: TicketClientInput): string {
  const cita = p.cita
  return [clean(cita?.marca), clean(cita?.modelo)].filter(Boolean).join(' ')
}
