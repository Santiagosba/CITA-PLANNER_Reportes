import type { Workshop } from '../types'
import { addLocalInboundTicket, LOCAL_INBOUND_PREFIX } from './demoTickets'
import { isLocalPreviewWorkshop } from './localPreview'
import {
  fetchTiposPeticion,
  resolveAvioldTallerIdsDetailed,
  type PeticionPendiente,
  type TipoPeticionRow,
} from './peticionesPendientes'
import { sqlCreateInboundPeticion } from './sqlServerApi'

export type InboundChannel = 'voz' | 'whatsapp'

export type InboundFormOptions = {
  centers: { idtaller: string; nombre: string }[]
  types: TipoPeticionRow[]
}

export type CreateInboundInput = {
  idtaller: string
  idtipopeticion: number
  tipoPeticion: string
  caller: string
  cliente: string
  matricula: string
  modelo: string
  descripcion: string
  canal: InboundChannel
  gestionemail?: string
}

const LOCAL_TYPES: TipoPeticionRow[] = [
  { idtipopeticion: 2, tipopeticion: 'Cita mecánica' },
  { idtipopeticion: 1, tipopeticion: 'Cita chapa' },
  { idtipopeticion: 4, tipopeticion: 'Contacto mecánica' },
  { idtipopeticion: 3, tipopeticion: 'Contacto chapa' },
  { idtipopeticion: 7, tipopeticion: 'Contacto recambios' },
  { idtipopeticion: 8, tipopeticion: 'Presupuesto chapa' },
  { idtipopeticion: 9, tipopeticion: 'Presupuesto mecánica' },
  { idtipopeticion: 21, tipopeticion: 'Solicitud de Contacto' },
]

export async function loadInboundFormOptions(workshop: Workshop): Promise<InboundFormOptions> {
  if (isLocalPreviewWorkshop(workshop)) {
    return {
      centers: [{ idtaller: String(workshop.id), nombre: 'Centro de demostración' }],
      types: LOCAL_TYPES,
    }
  }
  const [resolved, types] = await Promise.all([
    resolveAvioldTallerIdsDetailed(workshop),
    fetchTiposPeticion(),
  ])
  return {
    centers: resolved.talleres.length
      ? resolved.talleres
      : resolved.ids.map((idtaller) => ({ idtaller, nombre: workshop.name })),
    types,
  }
}

function localId(): string {
  const value = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
  return `${LOCAL_INBOUND_PREFIX}${value}`
}

function createLocalInbound(workshop: Workshop, input: CreateInboundInput): PeticionPendiente {
  const now = new Date().toISOString()
  const ticket: PeticionPendiente = {
    idpeticion: localId(),
    idtaller: input.idtaller,
    descripcion: input.descripcion,
    idtipopeticion: input.idtipopeticion,
    tipopeticion: input.tipoPeticion,
    fechainicio: now,
    fechafin: null,
    fechacreacion: now,
    caller: input.caller,
    gestionado: false,
    gestionemail: input.gestionemail || null,
    gestionfecha: null,
    gestionobservaciones: `Inbound manual · ${input.cliente || 'Sin nombre'}`,
    idcita: null,
    canalentrada: input.canal,
    cita: input.cliente || input.matricula || input.modelo
      ? {
        idcita: '',
        fecha: null,
        nombre: input.cliente || null,
        apellidos: null,
        telefono: input.caller,
        movil: input.caller,
        email: null,
        matricula: input.matricula || null,
        marca: null,
        modelo: input.modelo || null,
        asunto: input.descripcion,
      }
      : null,
  }
  return addLocalInboundTicket(workshop, ticket)
}

export async function createInboundPeticion(
  workshop: Workshop,
  input: CreateInboundInput,
): Promise<PeticionPendiente> {
  if (isLocalPreviewWorkshop(workshop)) return createLocalInbound(workshop, input)

  const resolved = await resolveAvioldTallerIdsDetailed(workshop)
  if (!resolved.ids.includes(input.idtaller)) {
    throw new Error('El centro elegido no pertenece a esta licencia.')
  }
  return sqlCreateInboundPeticion(input)
}
