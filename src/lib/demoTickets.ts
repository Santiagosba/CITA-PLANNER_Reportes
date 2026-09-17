/**
 * Tickets ficticios para probar el equipo (35 por asesor de @taller.demo).
 * Solo viven en localStorage; no se escriben en SQL Server.
 */

import { DEMO_ASESORES } from './demoAsesores'
import type { CitaTaller } from './citasTaller'
import { toDateInputValue } from './dateRangePresets'
import { normalizeEmail, SHOWCASE_ADVISORS } from './advisorWorkspace'
import type { PeticionPendiente } from './peticionesPendientes'
import type { Workshop } from '../types'

export const DEMO_TICKETS_PER_ADVISOR = 35
export const DEMO_TICKET_PREFIX = 'demo-ticket-'
export const DEMO_CITA_PREFIX = 'demo-cita-'
export const LOCAL_INBOUND_PREFIX = 'inbound-local-'
export const DEMO_TICKETS_NOTICE =
  'Junto a los tickets reales de la API hay 35 de prueba por asesor (Recepción y Comercial), para demos. Se pueden pasar entre el equipo y no se guardan en el taller real.'

function demoTicketAdvisors(): { email: string }[] {
  return [
    ...DEMO_ASESORES.map((asesor) => ({ email: asesor.email })),
    ...SHOWCASE_ADVISORS.map((asesor) => ({ email: asesor.email })),
  ]
}

const STORE_PREFIX = 'avi_demo_tickets_v3:'

function seededShuffle<T>(items: T[], seed: number): T[] {
  const arr = [...items]
  let s = seed >>> 0
  for (let i = arr.length - 1; i > 0; i -= 1) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    const j = s % (i + 1)
    const current = arr[i]
    arr[i] = arr[j] as T
    arr[j] = current as T
  }
  return arr
}

const CLIENTS = [
  { nombre: 'Mariano', apellidos: 'Gil Soto', phone: '677120034' },
  { nombre: 'Lucía', apellidos: 'Herrera Pons', phone: '622845901' },
  { nombre: 'Haritz', apellidos: 'Etxebarria', phone: '688334210' },
  { nombre: 'Pilar', apellidos: 'Navarro Cruz', phone: '610992847' },
  { nombre: 'Jordi', apellidos: 'Serra Vila', phone: '699201156' },
  { nombre: 'Ainhoa', apellidos: 'López Iriondo', phone: '655018273' },
  { nombre: 'Roberto', apellidos: 'Cano Díaz', phone: '634770192' },
  { nombre: 'Elena', apellidos: 'Martín Soler', phone: '647883025' },
  { nombre: 'Xabier', apellidos: 'Mugica', phone: '666140398' },
  { nombre: 'Carmen', apellidos: 'Ortega Blasco', phone: '612559740' },
  { nombre: 'Diego', apellidos: 'Romero Paz', phone: '690331284' },
  { nombre: 'Nuria', apellidos: 'Ferrer Llopis', phone: '625774013' },
  { nombre: 'Andrés', apellidos: 'Vega Ríos', phone: '671208956' },
  { nombre: 'Sofía', apellidos: 'Méndez Lago', phone: '639445720' },
  { nombre: 'Iker', apellidos: 'Arriaga', phone: '658902341' },
]

const ISSUES = [
  { tipo: 'Voz Laura', desc: 'Ruido al arrancar en frío y testigo de motor.' },
  { tipo: 'WhatsApp', desc: 'Pide fecha para revisión de los 20.000 km.' },
  { tipo: 'Cita mecánica', desc: 'Frenos esponjosos después de un viaje largo.' },
  { tipo: 'Peritaje', desc: 'Golpe en aleta derecha, quiere perito esta semana.' },
  { tipo: 'Recambios', desc: 'Consulta de pastillas y disco para flota.' },
  { tipo: 'Seguimiento', desc: 'Llama para saber si ya llegó el recambio.' },
  { tipo: 'Voz Laura', desc: 'Aire acondicionado no enfría. Quiere hueco hoy.' },
  { tipo: 'WhatsApp', desc: 'Envía foto de testigo amarillo y matrícula.' },
  { tipo: 'Carrocería', desc: 'Rayón en puerta del conductor, pide presupuesto.' },
  { tipo: 'Cita mecánica', desc: 'Cambio de aceite y filtros, cliente de flota.' },
]

const CARS = [
  { marca: 'Seat', modelo: 'León', plate: '1234 BCD' },
  { marca: 'Volkswagen', modelo: 'Golf', plate: '4587 KLM' },
  { marca: 'Renault', modelo: 'Clio', plate: '2291 HNT' },
  { marca: 'Toyota', modelo: 'Yaris', plate: '7740 PRS' },
  { marca: 'Peugeot', modelo: '308', plate: '3365 VWX' },
  { marca: 'Ford', modelo: 'Focus', plate: '9012 CFL' },
  { marca: 'Hyundai', modelo: 'Tucson', plate: '5618 GJK' },
  { marca: 'Kia', modelo: 'Ceed', plate: '8843 MNP' },
]

export function isDemoTicketId(id: string | null | undefined): boolean {
  return String(id || '').startsWith(DEMO_TICKET_PREFIX)
}

export function isLocalInboundTicketId(id: string | null | undefined): boolean {
  return String(id || '').startsWith(LOCAL_INBOUND_PREFIX)
}

export function isDemoCitaId(id: string | null | undefined): boolean {
  return String(id || '').startsWith(DEMO_CITA_PREFIX)
}

export function demoAdvisorSlug(email: string): string {
  const key = normalizeEmail(email)
  if (key.startsWith('ana.')) return 'ana'
  if (key.startsWith('luis.')) return 'luis'
  if (key.startsWith('carmen.')) return 'carmen'
  if (key.startsWith('marta.')) return 'marta'
  if (key.startsWith('nuria.')) return 'nuria'
  return key.split('@')[0]?.replace(/[^a-z0-9]/g, '') || 'asesor'
}

function storeKey(workshop: Workshop): string {
  return `${STORE_PREFIX}${workshop.containerIdTaller || workshop.id || 'taller'}`
}

function localStamp(daysAgo: number, hour: number, minute: number): string {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  d.setHours(hour, minute, 0, 0)
  return d.toISOString()
}

function buildTicket(
  workshop: Workshop,
  advisorEmail: string,
  slug: string,
  idIndex: number,
  contentIndex: number,
): PeticionPendiente {
  const client = CLIENTS[contentIndex % CLIENTS.length]
  const issue = ISSUES[contentIndex % ISSUES.length]
  const car = CARS[contentIndex % CARS.length]
  const taller = String(workshop.containerIdTaller || workshop.id || 'demo-taller')
  const id = `${DEMO_TICKET_PREFIX}${slug}-${String(idIndex + 1).padStart(2, '0')}`
  const bucket = contentIndex % 10
  const daysAgo = bucket < 3 ? 0 : bucket < 6 ? 1 + (contentIndex % 5) : bucket < 8 ? 8 + (contentIndex % 14) : 40 + (contentIndex % 80)
  const hour = 8 + (contentIndex % 12)
  const minute = (contentIndex * 11) % 60
  const start = localStamp(daysAgo, hour, minute)
  // Solo 2 cerrados por asesor (los dos últimos) para poder filtrar «Hechas».
  // El resto quedan por hacer: si no, la bandeja de prueba sale toda cerrada.
  const done = idIndex >= DEMO_TICKETS_PER_ADVISOR - 2
  const hasCita = contentIndex % 4 === 0
  const plate = car.plate.replace(/\s/g, '').replace(/(\d{4})([A-Z]{3})/, '$1 $2')

  return {
    idpeticion: id,
    idtaller: taller,
    descripcion: issue.desc,
    idtipopeticion: null,
    tipopeticion: issue.tipo,
    fechainicio: start,
    fechafin: done ? localStamp(daysAgo, hour + 1, minute) : null,
    fechacreacion: start,
    caller: `+34 ${client.phone}`,
    gestionado: done,
    gestionemail: advisorEmail,
    gestionfecha: done ? localStamp(daysAgo, hour + 1, (minute + 12) % 60) : null,
    gestionobservaciones: 'Ticket de prueba del equipo. Se puede pasar a otro asesor.',
    idcita: hasCita ? `demo-cita-${slug}-${idIndex + 1}` : null,
    clienteNombre: `${client.nombre} ${client.apellidos}`,
    cita: hasCita
      ? {
          idcita: `demo-cita-${slug}-${idIndex + 1}`,
          fecha: localStamp(Math.max(0, daysAgo - 1), 10, 0),
          nombre: client.nombre,
          apellidos: client.apellidos,
          razonSocial: null,
          contacto: `${client.nombre} ${client.apellidos}`,
          telefono: client.phone,
          movil: client.phone,
          email: null,
          matricula: plate,
          marca: car.marca,
          modelo: car.modelo,
          asunto: issue.desc,
        }
      : null,
  }
}

export function generateDemoTickets(workshop: Workshop): PeticionPendiente[] {
  const rows: PeticionPendiente[] = []
  demoTicketAdvisors().forEach((asesor, advisorIndex) => {
    const slug = demoAdvisorSlug(asesor.email)
    const email = normalizeEmail(asesor.email)
    const contentOrder = seededShuffle(
      Array.from({ length: DEMO_TICKETS_PER_ADVISOR }, (_, i) => i),
      20260909 + advisorIndex * 97,
    )
    contentOrder.forEach((contentIndex, slot) => {
      rows.push(buildTicket(workshop, email, slug, slot, contentIndex))
    })
  })
  return seededShuffle(rows, 424242)
}

function ticketLocalDay(row: Pick<PeticionPendiente, 'fechainicio' | 'fechacreacion'>): string {
  const raw = row.fechainicio || row.fechacreacion
  if (!raw) return ''
  const date = new Date(raw)
  return Number.isNaN(date.getTime()) ? '' : toDateInputValue(date)
}

function shiftStamp(value: string | null | undefined, days: number): string | null {
  if (!value) return value ?? null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  date.setDate(date.getDate() + days)
  return date.toISOString()
}

/** Si el lote es de otro día, mueve las fechas a hoy para que el periodo (día/mes) las vea. */
export function refreshDemoTicketDates(rows: PeticionPendiente[]): PeticionPendiente[] {
  const today = toDateInputValue(new Date())
  const newest = rows.filter((row) => isDemoTicketId(row.idpeticion)).reduce((max, row) => {
    const key = ticketLocalDay(row)
    return key > max ? key : max
  }, '')
  if (!newest || newest >= today) return rows
  const days = Math.round(
    (new Date(`${today}T12:00:00`).getTime() - new Date(`${newest}T12:00:00`).getTime()) / 86_400_000,
  )
  if (days <= 0) return rows
  return rows.map((row) =>
    isDemoTicketId(row.idpeticion)
      ? {
        ...row,
        fechainicio: shiftStamp(row.fechainicio, days) ?? row.fechainicio,
        fechacreacion: shiftStamp(row.fechacreacion, days) ?? row.fechacreacion,
        fechafin: row.fechafin ? shiftStamp(row.fechafin, days) : row.fechafin,
        gestionfecha: row.gestionfecha ? shiftStamp(row.gestionfecha, days) : row.gestionfecha,
        cita: row.cita
          ? { ...row.cita, fecha: shiftStamp(row.cita.fecha, days) ?? row.cita.fecha }
          : row.cita,
      }
      : row,
  )
}

function demoTicketsNeedRebuild(rows: PeticionPendiente[]): boolean {
  const advisors = demoTicketAdvisors()
  const demos = rows.filter((row) => isDemoTicketId(row.idpeticion))
  if (demos.length !== advisors.length * DEMO_TICKETS_PER_ADVISOR) return true
  const have = new Set(demos.map((row) => normalizeEmail(row.gestionemail || '')).filter(Boolean))
  return advisors.some((asesor) => !have.has(normalizeEmail(asesor.email)))
}

export function loadDemoTickets(workshop: Workshop): PeticionPendiente[] {
  if (typeof localStorage === 'undefined') return generateDemoTickets(workshop)
  const key = storeKey(workshop)
  try {
    const raw = localStorage.getItem(key)
    if (raw) {
      const parsed = JSON.parse(raw) as unknown
      if (Array.isArray(parsed) && parsed.length) {
        const stored = parsed as PeticionPendiente[]
        if (!demoTicketsNeedRebuild(stored)) {
          const rows = refreshDemoTicketDates(stored)
          if (rows !== parsed) saveDemoTickets(workshop, rows)
          return rows
        }
        const rows = [
          ...stored.filter((row) => isLocalInboundTicketId(row.idpeticion)),
          ...generateDemoTickets(workshop),
        ]
        saveDemoTickets(workshop, rows)
        return rows
      }
    }
  } catch {
    /* ignore */
  }
  const rows = generateDemoTickets(workshop)
  saveDemoTickets(workshop, rows)
  return rows
}

export function saveDemoTickets(workshop: Workshop, rows: PeticionPendiente[]): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(storeKey(workshop), JSON.stringify(rows))
  } catch {
    /* quota */
  }
}

export function addLocalInboundTicket(
  workshop: Workshop,
  ticket: PeticionPendiente,
): PeticionPendiente {
  const rows = loadDemoTickets(workshop).filter((row) => row.idpeticion !== ticket.idpeticion)
  saveDemoTickets(workshop, [ticket, ...rows])
  return ticket
}

export function patchDemoTicket(
  workshop: Workshop,
  idpeticion: string,
  patch: Partial<PeticionPendiente>,
): PeticionPendiente | null {
  const rows = loadDemoTickets(workshop)
  let next: PeticionPendiente | null = null
  const updated = rows.map((row) => {
    if (row.idpeticion !== idpeticion) return row
    next = { ...row, ...patch }
    return next
  })
  if (!next) return null
  saveDemoTickets(workshop, updated)
  return next
}

export function filterDemoTicketsByRange(
  rows: PeticionPendiente[],
  from?: string,
  to?: string,
): PeticionPendiente[] {
  if (!from && !to) return rows
  return rows.filter((row) => {
    const raw = row.fechainicio || row.fechacreacion
    if (!raw) return false
    const key = toDateInputValue(new Date(raw))
    if (from && key < from) return false
    if (to && key > to) return false
    return true
  })
}

export function mergeLiveAndDemoTickets(
  live: PeticionPendiente[],
  workshop: Workshop,
  range?: { from?: string; to?: string },
): PeticionPendiente[] {
  const liveOnly = live.filter((row) => !isDemoTicketId(row.idpeticion))
  const demo = filterDemoTicketsByRange(loadDemoTickets(workshop), range?.from, range?.to)
  return [...demo, ...liveOnly]
}

function citaInRange(fecha: string | null | undefined, from?: string, to?: string): boolean {
  if (!from && !to) return true
  if (!fecha) return false
  const key = toDateInputValue(new Date(fecha))
  if (from && key < from) return false
  if (to && key > to) return false
  return true
}

export function demoCitasFromTickets(workshop: Workshop, range?: { from?: string; to?: string }): CitaTaller[] {
  const taller = String(workshop.containerIdTaller || workshop.id || 'demo-taller')
  const rows: CitaTaller[] = []
  for (const ticket of loadDemoTickets(workshop)) {
    const cita = ticket.cita
    if (!cita?.idcita || !citaInRange(cita.fecha, range?.from, range?.to)) continue
    rows.push({
      idcita: cita.idcita,
      idtaller: taller,
      fecha: cita.fecha,
      asunto: cita.asunto,
      observaciones: ticket.descripcion,
      nombre: cita.nombre,
      apellidos: cita.apellidos,
      razonSocial: cita.razonSocial ?? null,
      telefono: cita.telefono,
      movil: cita.movil,
      email: cita.email,
      marca: cita.marca,
      modelo: cita.modelo,
      motor: null,
      matricula: cita.matricula,
      kilometros: null,
      idEstadoCita: rows.length % 5 === 0 ? 3 : 4,
      idMotivoCancelada: rows.length % 5 === 0 ? [36, 26, 27, 7][rows.length % 4] : null,
      idCentro: null,
      idOperario: null,
      direccion: null,
      poblacion: null,
      provincia: null,
      contacto: cita.contacto ?? null,
    })
  }
  return rows
}

export function mergeLiveAndDemoCitas(
  live: CitaTaller[],
  workshop: Workshop,
  range?: { from?: string; to?: string },
): CitaTaller[] {
  const liveOnly = live.filter((row) => !isDemoCitaId(row.idcita))
  return [...demoCitasFromTickets(workshop, range), ...liveOnly]
}
