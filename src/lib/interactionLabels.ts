import type { CustomerCallItem } from './crmApi'
import type { PeticionPendiente } from './peticionesPendientes'
import { ticketClientLabel, ticketClientPhone } from './ticketClient'

export type InteractionTipo = CustomerCallItem['tipo']

const CLOSE_TAG_LABELS: Record<string, string> = {
  CONTACTADO: 'Cliente contestó',
  NO_CONTESTA: 'No contesta',
  TELEFONO_ERRONEO: 'Teléfono erróneo',
  CITA_CONSEGUIDA: 'Cita conseguida',
  POSPUESTA: 'Pospuesta',
  NO_INTERESA: 'No le interesa',
  RELLAMAR: 'Rellamada',
  GESTIONADO: 'Gestionado',
  CITA_NO_CONSEGUIDA: 'Cita no conseguida',
  NO_CONTACTADO: 'No contactado',
  BAJA_VEHICULO: 'Baja de vehículo',
  ENVIAR_WHATSAPP: 'Enviar WhatsApp',
}

export function channelLabel(tipo: InteractionTipo | string | null | undefined): string {
  switch (String(tipo || 'llamada')) {
    case 'whatsapp':
      return 'WhatsApp'
    case 'sms':
      return 'Mensaje'
    case 'email':
      return 'Email'
    default:
      return 'Llamada'
  }
}

export function channelTone(tipo: InteractionTipo | string | null | undefined): string {
  switch (String(tipo || 'llamada')) {
    case 'whatsapp':
      return 'tone-wa'
    case 'sms':
      return 'tone-neutral'
    case 'email':
      return 'tone-muted'
    default:
      return 'tone-neutral'
  }
}

export function closeTagLabel(code: string): string {
  const key = String(code || '').trim().toUpperCase()
  if (CLOSE_TAG_LABELS[key]) return CLOSE_TAG_LABELS[key]
  return key.replace(/_/g, ' ').toLowerCase()
}

export function closeLabels(item: CustomerCallItem): { text: string; tone: string }[] {
  const out: { text: string; tone: string }[] = []
  const tags = (item.tags || []).map((code) => closeTagLabel(code)).filter(Boolean)
  for (const text of tags) {
    out.push({ text, tone: /no |sin |erróneo|fall/i.test(text) ? 'tone-warning' : 'tone-positive' })
  }
  if (out.length > 0) return out

  const titular = String(item.titular || item.resumen || '').toLowerCase()
  if (item.tipo === 'whatsapp') {
    if (/no entreg/i.test(titular)) return [{ text: 'No entregado', tone: 'tone-negative' }]
    if (/sin respuesta/i.test(titular)) return [{ text: 'Sin respuesta', tone: 'tone-warning' }]
    if (item.entrante) return [{ text: 'Conversación', tone: 'tone-neutral' }]
    return [{ text: 'Enviado', tone: 'tone-muted' }]
  }
  if (item.tipo === 'sms') {
    return item.completada
      ? [{ text: 'Enviado', tone: 'tone-muted' }]
      : [{ text: 'Mensaje', tone: 'tone-neutral' }]
  }
  if (item.tipo === 'email') {
    return [{ text: 'Email', tone: 'tone-muted' }]
  }
  if (item.nocontesta) return [{ text: 'Sin respuesta', tone: 'tone-warning' }]
  if (item.completada) return [{ text: 'Atendida', tone: 'tone-positive' }]
  if (/rechaz/i.test(titular)) return [{ text: 'Rechazada', tone: 'tone-negative' }]
  if (/colg/i.test(titular)) return [{ text: 'Colgó', tone: 'tone-warning' }]
  return [{ text: 'En curso', tone: 'tone-muted' }]
}

export function inferPeticionTipo(tipopeticion: string | null | undefined): InteractionTipo {
  const raw = String(tipopeticion || '').toLowerCase()
  if (raw.includes('whatsapp') || raw.includes('whats')) return 'whatsapp'
  if (raw.includes('sms') || raw.includes('mensaje')) return 'sms'
  if (raw.includes('mail') || raw.includes('correo')) return 'email'
  return 'llamada'
}

export function peticionToHistoryItem(p: PeticionPendiente): CustomerCallItem {
  const tipo = inferPeticionTipo(p.tipopeticion)
  return {
    id: `peticion-${p.idpeticion}`,
    fecha: p.fechainicio || p.fechacreacion || new Date().toISOString(),
    completada: Boolean(p.gestionado),
    nocontesta: false,
    agente: p.gestionemail || 'Laura',
    agenteId: '',
    cliente: ticketClientLabel(p),
    telefono: ticketClientPhone(p),
    campana: p.tipopeticion || '',
    observaciones: p.gestionobservaciones || '',
    tieneCita: Boolean(p.cita?.fecha),
    resumen: p.descripcion || p.tipopeticion || '',
    titular: p.gestionado ? 'Ya está gestionado' : p.tipopeticion || 'Consulta abierta',
    duracionSeg: null,
    tipo,
    tags: p.gestionado ? ['GESTIONADO'] : [],
  }
}
