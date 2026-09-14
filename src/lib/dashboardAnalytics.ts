import {
  daysOfWeek,
  yearMonths,
  type CalendarScale,
} from './calendarScale'
import {
  callSpeechForPhones,
  inferCancelReasonFromSpeech,
  phoneKeysOf,
  speechFromStoredNotes,
  type CallNotesByPhone,
} from './cancelMotiveFromSpeech'
import { toDateInputValue } from './dateRangePresets'
import { inferPeticionTipo } from './interactionLabels'
import { normalizeEmail, type AdvisorPerson } from './advisorWorkspace'
import type { CitaTaller } from './citasTaller'
import type { PeticionPendiente } from './peticionesPendientes'

export type VolumePoint = {
  key: string
  label: string
  recibidas: number
  hechas: number
}

export type MixRow = {
  key: string
  label: string
  value: number
}

export type AdvisorLoadRow = {
  key: string
  label: string
  recibidas: number
  hechas: number
  pendientes: number
}

export type MotiveOutcomeRow = {
  key: string
  label: string
  realizadas: number
  canceladas: number
}

export type CitaOutcome = 'realizada' | 'cancelada'

/** CitaPlanner: Atendida, Vendido, CLOSED, INVOICED, COMPLETED, DELIVERED, WORKCOMPLETED */
const REALIZADA_IDS = new Set([4, 5, 16, 21, 22, 23, 26])
/** Cancelada, Cancelada Call, Cancelada Comercial */
const CANCELADA_IDS = new Set([3, 7, 8])

export function citaOutcome(cita: Pick<CitaTaller, 'idEstadoCita'>): CitaOutcome | null {
  const id = Number(cita.idEstadoCita)
  if (!Number.isFinite(id)) return null
  if (CANCELADA_IDS.has(id)) return 'cancelada'
  if (REALIZADA_IDS.has(id)) return 'realizada'
  return null
}

function clipMotive(label: string, max = 42): string {
  const safe = label.trim()
  return safe.length > max ? `${safe.slice(0, max - 1)}…` : safe
}

function inferMotiveFromText(text: string): string | null {
  const t = text.toLowerCase()
  if (!t.trim()) return null
  if (/cancel.*chapa|chapa.*cancel/.test(t)) return 'Cancelación cita chapa'
  if (/cancel.*mec|mec.*cancel/.test(t)) return 'Cancelación cita mecánica'
  if (/cita.*chapa|chapa.*cita|perit|ara[nñ]azo|golpe/.test(t)) return 'Cita chapa'
  if (/cita.*mec|mec.*cita|revisi[oó]n|manten|aceite|itv/.test(t)) return 'Cita mecánica'
  if (/presupuesto.*chapa|chapa.*presup/.test(t)) return 'Presupuesto chapa'
  if (/presupuesto/.test(t)) return 'Presupuesto mecánica'
  if (/estado.*chapa/.test(t)) return 'Estado chapa'
  if (/estado.*mec/.test(t)) return 'Estado mecánica'
  if (/recambio/.test(t)) return 'Contacto recambios'
  if (/\bvn\b/.test(t)) return 'Contacto VN'
  if (/\bvo\b/.test(t)) return 'Contacto VO'
  return null
}

function citaIdKey(id: string | null | undefined): string {
  return String(id || '').trim().toLowerCase()
}

export function consultaMotive(
  item: Pick<PeticionPendiente, 'tipopeticion' | 'idtipopeticion' | 'descripcion' | 'cita'>,
  tipos?: Map<number, string>,
): string {
  const typed = String(item.tipopeticion || '').trim()
  if (typed && !/^sin (tipo|petici[oó]n)$/i.test(typed)) return typed
  if (item.idtipopeticion != null && tipos) {
    const fromCat = tipos.get(Number(item.idtipopeticion))?.trim()
    if (fromCat && !/^sin (tipo|petici[oó]n)$/i.test(fromCat)) return fromCat
  }
  const asunto = String(item.cita?.asunto || '').trim()
  if (asunto) return clipMotive(asunto)
  const inferred = inferMotiveFromText(`${item.descripcion || ''} ${asunto}`)
  if (inferred) return inferred
  return typed || 'Sin motivo'
}

function isCancelMotive(label: string): boolean {
  return /cancel/.test(label.toLowerCase())
}

/** Agrupa «Cancelación cita mecánica» con «Cita mecánica» para comparar azul/rojo. */
export function motiveFamilyLabel(label: string): string {
  const raw = label.trim() || 'Sin motivo'
  const k = motiveKey(raw)
  if (/^(sin motivo|sin tipo|sin peticion)$/.test(k)) return 'Sin motivo'
  if (!/cancel/.test(k)) return raw

  if (/chapa|carrocer|pint/.test(k)) return 'Cita chapa'
  if (/recambio/.test(k)) return 'Contacto recambios'
  if (/\bvn\b/.test(k)) return 'Contacto VN'
  if (/\bvo\b/.test(k)) return 'Contacto VO'
  if (/mec/.test(k)) return 'Cita mecánica'
  return 'Cancelación'
}

const CANCEL_MOTIVE_FALLBACK: Record<number, string> = {
  1: 'Precio elevado',
  7: 'No contesta',
  16: 'Reemplazo',
  21: 'Otros',
  26: 'Duplicada',
  27: 'Solicitud por error',
  31: 'Datos de contacto erróneos',
  32: 'Por precio',
  36: 'No asiste a la cita',
}

export function cancelMotiveOf(
  cita:
    | Pick<
        CitaTaller,
        'idMotivoCancelada' | 'idEstadoCita' | 'observaciones' | 'asunto' | 'telefono' | 'movil'
      >
    | undefined,
  item?: Pick<
    PeticionPendiente,
    'tipopeticion' | 'idtipopeticion' | 'descripcion' | 'gestionobservaciones' | 'cita' | 'caller'
  >,
  catalog?: Map<number, string>,
  tipos?: Map<number, string>,
  callNotes?: CallNotesByPhone,
): string {
  const id = cita?.idMotivoCancelada != null ? Number(cita.idMotivoCancelada) : NaN
  if (Number.isFinite(id)) {
    const fromCat = catalog?.get(id)?.trim() || CANCEL_MOTIVE_FALLBACK[id]
    if (fromCat) return fromCat
  }

  const phones = phoneKeysOf([
    cita?.telefono,
    cita?.movil,
    item?.caller,
    item?.cita?.telefono,
    item?.cita?.movil,
  ])
  const spoken = [
    callSpeechForPhones(phones, callNotes),
    speechFromStoredNotes(item?.gestionobservaciones),
    item?.descripcion,
    cita?.observaciones,
    cita?.asunto,
    item?.cita?.asunto,
  ]
    .filter(Boolean)
    .join('\n')

  const inferred = inferCancelReasonFromSpeech(spoken)
  if (inferred) return inferred

  if (item) {
    const tipo = consultaMotive(item, tipos)
    if (isCancelMotive(tipo) && !/^cancelado$/i.test(tipo)) return tipo
  }

  const estado = Number(cita?.idEstadoCita)
  if (estado === 7) return 'Cancelada en llamada'
  if (estado === 8) return 'Cancelada comercial'
  return 'No se dijo el motivo'
}

type CancelledHit = {
  key: string
  label: string
  at: Date | null
}

function collectCancelledHits(
  citas: CitaTaller[],
  peticiones: PeticionPendiente[] = [],
  catalog?: Map<number, string>,
  tipos?: Map<number, string>,
  callNotes?: CallNotesByPhone,
): CancelledHit[] {
  const citaById = new Map(citas.map((cita) => [citaIdKey(cita.idcita), cita]))
  const peticionByCita = new Map<string, PeticionPendiente>()
  for (const item of peticiones) {
    const id = citaIdKey(item.idcita)
    if (id && !peticionByCita.has(id)) peticionByCita.set(id, item)
  }
  const counted = new Set<string>()
  const hits: CancelledHit[] = []

  const push = (label: string, at: Date | null) => {
    const safe = label.trim() || 'No se dijo el motivo'
    hits.push({ key: motiveKey(safe), label: safe, at })
  }

  for (const cita of citas) {
    if (citaOutcome(cita) !== 'cancelada') continue
    const id = citaIdKey(cita.idcita)
    counted.add(id)
    push(cancelMotiveOf(cita, peticionByCita.get(id), catalog, tipos, callNotes), parseStamp(cita.fecha))
  }

  for (const item of peticiones) {
    const id = citaIdKey(item.idcita)
    if (id && counted.has(id)) continue
    if (!isCancelMotive(consultaMotive(item, tipos))) continue
    if (id) counted.add(id)
    push(cancelMotiveOf(id ? citaById.get(id) : undefined, item, catalog, tipos, callNotes), receivedAt(item))
  }
  return hits
}

/** Cada motivo de cancelación del periodo, sin agrupar en «Otros». */
export function cancelMotiveMix(
  citas: CitaTaller[],
  peticiones: PeticionPendiente[] = [],
  catalog?: Map<number, string>,
  tipos?: Map<number, string>,
  callNotes?: CallNotesByPhone,
): MixRow[] {
  const map = new Map<string, MixRow>()
  for (const hit of collectCancelledHits(citas, peticiones, catalog, tipos, callNotes)) {
    const row = map.get(hit.key) ?? { key: hit.key, label: hit.label, value: 0 }
    row.value += 1
    map.set(hit.key, row)
  }
  return [...map.values()].sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, 'es'))
}

/** Motivos dichos o anotados al cancelar × tramo del periodo. Solo filas con alguna cancelada. */
export function cancelMotiveHeatmap(
  citas: CitaTaller[],
  peticiones: PeticionPendiente[] = [],
  catalog?: Map<number, string>,
  tipos?: Map<number, string>,
  scale: CalendarScale = 'dia',
  anchor: Date = new Date(),
  callNotes?: CallNotesByPhone,
): HeatMatrix {
  const cols = volumeForScale([], scale, anchor).map((point) => ({ key: point.key, label: point.label }))
  const colIndex = new Map(cols.map((col, index) => [col.key, index]))
  const hits = collectCancelledHits(citas, peticiones, catalog, tipos, callNotes)
  const rows: HeatMatrix['rows'] = []
  const index = new Map<string, number>()

  const ensure = (key: string, label: string) => {
    const current = index.get(key)
    if (current != null) return current
    const next = rows.length
    index.set(key, next)
    rows.push({ key, label })
    return next
  }

  for (const hit of hits) ensure(hit.key, hit.label)

  const values = rows.map(() => cols.map(() => 0))
  for (const hit of hits) {
    const ri = index.get(hit.key)
    if (ri == null || !hit.at) continue
    const colKey = bucketKeyOf(hit.at, scale, anchor)
    const ci = colKey ? colIndex.get(colKey) : undefined
    if (ci == null) continue
    values[ri][ci] += 1
  }

  const ranked = rows
    .map((row, rowIndex) => ({
      row,
      values: values[rowIndex],
      total: values[rowIndex].reduce((sum, value) => sum + value, 0),
    }))
    .sort((a, b) => b.total - a.total || a.row.label.localeCompare(b.row.label, 'es'))

  return {
    rows: ranked.map((item) => item.row),
    cols,
    values: ranked.map((item) => item.values),
  }
}

function addMotiveCount(
  map: Map<string, MotiveOutcomeRow>,
  label: string,
  outcome: CitaOutcome,
) {
  const safe = label.trim() || 'Sin motivo'
  const key = motiveKey(safe)
  const row = map.get(key) ?? { key, label: safe, realizadas: 0, canceladas: 0 }
  if (outcome === 'realizada') row.realizadas += 1
  else row.canceladas += 1
  map.set(key, row)
}

const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

export function parseStamp(iso: string | null | undefined): Date | null {
  if (!iso) return null
  const raw = String(iso).trim()
  if (!raw) return null
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw)
  if (dateOnly) {
    return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]), 0, 0, 0, 0)
  }
  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function receivedAt(item: PeticionPendiente): Date | null {
  return parseStamp(item.fechainicio) || parseStamp(item.fechacreacion)
}

export function closedAt(item: PeticionPendiente): Date | null {
  if (!item.gestionado) return null
  return parseStamp(item.gestionfecha) || parseStamp(item.fechafin) || receivedAt(item)
}

export function inLocalRange(date: Date | null, fromIso: string, toIso: string): boolean {
  if (!date) return false
  const key = toDateInputValue(date)
  return key >= fromIso && key <= toIso
}

export function filterReceivedInRange(
  items: PeticionPendiente[],
  fromIso: string,
  toIso: string,
): PeticionPendiente[] {
  return items.filter((item) => inLocalRange(receivedAt(item), fromIso, toIso))
}

export function closedInRangeCount(items: PeticionPendiente[], fromIso: string, toIso: string): number {
  return items.reduce((n, item) => n + (inLocalRange(closedAt(item), fromIso, toIso) ? 1 : 0), 0)
}

export function volumeChartTitle(scale: CalendarScale): string {
  switch (scale) {
    case 'dia':
      return 'Entradas por hora'
    case 'semana':
      return 'Entradas por día'
    case 'mes':
      return 'Entradas por día del mes'
    case 'anio':
      return 'Entradas por mes'
  }
}

export function mixChartTitle(scale: CalendarScale): string {
  return scale === 'dia' ? 'Canal de entrada' : 'Tipo de consulta'
}

export function heatChartTitle(scale: CalendarScale): string {
  switch (scale) {
    case 'dia':
      return 'por hora'
    case 'semana':
      return 'por día'
    case 'mes':
      return 'por día del mes'
    case 'anio':
      return 'por mes'
  }
}

export type HeatMatrix = {
  rows: { key: string; label: string }[]
  cols: { key: string; label: string }[]
  values: number[][]
}

function bucketKeyOf(date: Date, scale: CalendarScale, anchor: Date): string | null {
  if (scale === 'dia') {
    if (toDateInputValue(date) !== toDateInputValue(anchor)) return null
    return String(date.getHours())
  }
  if (scale === 'semana' || scale === 'mes') return toDateInputValue(date)
  if (date.getFullYear() !== anchor.getFullYear()) return null
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

/** Consultas recibidas por asesor y tramo del periodo. */
export function advisorHeatmap(
  items: PeticionPendiente[],
  people: AdvisorPerson[],
  scale: CalendarScale,
  anchor: Date,
): HeatMatrix {
  const cols = volumeForScale([], scale, anchor).map((point) => ({ key: point.key, label: point.label }))
  const rows = people.map((person) => ({ key: normalizeEmail(person.email), label: person.name }))
  const colIndex = new Map(cols.map((col, index) => [col.key, index]))
  const rowIndex = new Map(rows.map((row, index) => [row.key, index]))
  const values = rows.map(() => cols.map(() => 0))
  const loose = cols.map(() => 0)

  for (const item of items) {
    const received = receivedAt(item)
    if (!received) continue
    const colKey = bucketKeyOf(received, scale, anchor)
    const ci = colKey ? colIndex.get(colKey) : undefined
    if (ci == null) continue
    const email = normalizeEmail(item.gestionemail || '')
    const ri = rowIndex.get(email)
    if (ri == null) loose[ci] += 1
    else values[ri][ci] += 1
  }

  const keptRows: HeatMatrix['rows'] = []
  const keptValues: number[][] = []
  rows.forEach((row, index) => {
    if (values[index].some((value) => value > 0)) {
      keptRows.push(row)
      keptValues.push(values[index])
    }
  })
  if (loose.some((value) => value > 0)) {
    keptRows.push({ key: 'sin-dueno', label: 'Sin dueño' })
    keptValues.push(loose)
  }
  return { rows: keptRows, cols, values: keptValues }
}

export function volumeForScale(
  items: PeticionPendiente[],
  scale: CalendarScale,
  anchor: Date,
): VolumePoint[] {
  if (scale === 'dia') return volumeByHour(items, toDateInputValue(anchor))
  if (scale === 'semana') return volumeByWeekday(items, anchor)
  if (scale === 'mes') return volumeByMonthDay(items, anchor)
  return volumeByCalendarMonth(items, anchor)
}

function volumeByHour(items: PeticionPendiente[], dayIso: string): VolumePoint[] {
  const byHour = new Map<number, VolumePoint>()
  const ensure = (hour: number) => {
    let row = byHour.get(hour)
    if (!row) {
      row = {
        key: String(hour),
        label: `${String(hour).padStart(2, '0')}h`,
        recibidas: 0,
        hechas: 0,
      }
      byHour.set(hour, row)
    }
    return row
  }
  for (let hour = 8; hour <= 21; hour += 1) ensure(hour)
  for (const item of items) {
    const received = receivedAt(item)
    if (received && toDateInputValue(received) === dayIso) {
      ensure(received.getHours()).recibidas += 1
    }
    const closed = closedAt(item)
    if (closed && toDateInputValue(closed) === dayIso) {
      ensure(closed.getHours()).hechas += 1
    }
  }
  return [...byHour.keys()].sort((a, b) => a - b).map((hour) => byHour.get(hour)!)
}

function volumeByWeekday(items: PeticionPendiente[], anchor: Date): VolumePoint[] {
  const days = daysOfWeek(anchor)
  const rows = days.map((day, index) => ({
    key: toDateInputValue(day),
    label: WEEKDAY_LABELS[index] ?? '',
    recibidas: 0,
    hechas: 0,
  }))
  const index = new Map(rows.map((row) => [row.key, row]))
  for (const item of items) {
    const received = receivedAt(item)
    if (received) {
      const row = index.get(toDateInputValue(received))
      if (row) row.recibidas += 1
    }
    const closed = closedAt(item)
    if (closed) {
      const row = index.get(toDateInputValue(closed))
      if (row) row.hechas += 1
    }
  }
  return rows
}

function volumeByMonthDay(items: PeticionPendiente[], anchor: Date): VolumePoint[] {
  const year = anchor.getFullYear()
  const month = anchor.getMonth()
  const last = new Date(year, month + 1, 0).getDate()
  const rows = Array.from({ length: last }, (_, i) => {
    const day = i + 1
    const date = new Date(year, month, day)
    return {
      key: toDateInputValue(date),
      label: String(day),
      recibidas: 0,
      hechas: 0,
    }
  })
  const index = new Map(rows.map((row) => [row.key, row]))
  for (const item of items) {
    const received = receivedAt(item)
    if (received) {
      const row = index.get(toDateInputValue(received))
      if (row) row.recibidas += 1
    }
    const closed = closedAt(item)
    if (closed) {
      const row = index.get(toDateInputValue(closed))
      if (row) row.hechas += 1
    }
  }
  return rows
}

function volumeByCalendarMonth(items: PeticionPendiente[], anchor: Date): VolumePoint[] {
  const rows = yearMonths(anchor).map((monthDate, index) => ({
    key: `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}`,
    label: MONTH_LABELS[index] ?? '',
    recibidas: 0,
    hechas: 0,
  }))
  const index = new Map(rows.map((row) => [row.key, row]))
  const take = (date: Date | null, field: 'recibidas' | 'hechas') => {
    if (!date || date.getFullYear() !== anchor.getFullYear()) return
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    const row = index.get(key)
    if (row) row[field] += 1
  }
  for (const item of items) {
    take(receivedAt(item), 'recibidas')
    take(closedAt(item), 'hechas')
  }
  return rows
}

export function channelMix(items: PeticionPendiente[]): MixRow[] {
  const counts = { llamada: 0, whatsapp: 0, otro: 0 }
  for (const item of items) {
    const tipo = inferPeticionTipo(item.tipopeticion)
    if (tipo === 'whatsapp') counts.whatsapp += 1
    else if (tipo === 'sms' || tipo === 'email') counts.otro += 1
    else counts.llamada += 1
  }
  return [
    { key: 'llamada', label: 'Llamada', value: counts.llamada },
    { key: 'whatsapp', label: 'WhatsApp', value: counts.whatsapp },
    { key: 'otro', label: 'Otros', value: counts.otro },
  ].filter((row) => row.value > 0)
}

export function typeMix(
  items: PeticionPendiente[],
  tipos?: Map<number, string>,
  limit = 6,
): MixRow[] {
  const map = new Map<string, number>()
  for (const item of items) {
    const label = consultaMotive(item, tipos)
    map.set(label, (map.get(label) ?? 0) + 1)
  }
  const sorted = [...map.entries()].sort((a, b) => b[1] - a[1])
  const head = sorted.slice(0, limit).map(([label, value]) => ({ key: label, label, value }))
  const rest = sorted.slice(limit).reduce((sum, [, value]) => sum + value, 0)
  if (rest > 0) head.push({ key: 'otros', label: 'Otros', value: rest })
  return head
}

export function advisorWorkload(items: PeticionPendiente[], people: AdvisorPerson[]): AdvisorLoadRow[] {
  const byEmail = new Map<string, { recibidas: number; hechas: number }>()
  for (const item of items) {
    const email = normalizeEmail(item.gestionemail || '')
    const prev = byEmail.get(email) ?? { recibidas: 0, hechas: 0 }
    prev.recibidas += 1
    if (item.gestionado) prev.hechas += 1
    byEmail.set(email, prev)
  }

  const rows = people.map((person) => {
    const stats = byEmail.get(normalizeEmail(person.email)) ?? { recibidas: 0, hechas: 0 }
    return {
      key: person.id,
      label: person.name,
      recibidas: stats.recibidas,
      hechas: stats.hechas,
      pendientes: Math.max(0, stats.recibidas - stats.hechas),
    }
  })
  rows.sort((a, b) => b.recibidas - a.recibidas || a.label.localeCompare(b.label, 'es'))

  const loose = byEmail.get('')
  if (loose && loose.recibidas > 0) {
    rows.push({
      key: 'sin-dueno',
      label: 'Sin dueño',
      recibidas: loose.recibidas,
      hechas: loose.hechas,
      pendientes: Math.max(0, loose.recibidas - loose.hechas),
    })
  }
  return rows
}

function motiveKey(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
}

function citaMotiveLabel(
  cita: CitaTaller,
  tipoByCita: Map<string, string>,
): string {
  const linked = tipoByCita.get(citaIdKey(cita.idcita))?.trim()
  if (linked && !/^sin (motivo|tipo|petici[oó]n)$/i.test(linked)) return linked
  const fromNotes = inferMotiveFromText(`${cita.observaciones || ''} ${cita.asunto || ''}`)
  if (fromNotes) return fromNotes
  const asunto = String(cita.asunto || '').trim()
  if (asunto && !/^llamada entrante/i.test(asunto)) return clipMotive(asunto)
  return linked || 'Sin tipo'
}

/** Cada fila es un motivo (tipo de consulta). Azul = realizadas; rojo = canceladas. */
export function motiveOutcomeMix(
  citas: CitaTaller[],
  peticiones: PeticionPendiente[] = [],
  tipos?: Map<number, string>,
  limit = 10,
): MotiveOutcomeRow[] {
  const tipoByCita = new Map<string, string>()
  const citaById = new Map<string, CitaTaller>()
  for (const cita of citas) citaById.set(citaIdKey(cita.idcita), cita)
  for (const item of peticiones) {
    const id = citaIdKey(item.idcita)
    if (id && !tipoByCita.has(id)) tipoByCita.set(id, consultaMotive(item, tipos))
  }

  const map = new Map<string, MotiveOutcomeRow>()
  const countedCitas = new Set<string>()

  for (const item of peticiones) {
    const citaId = citaIdKey(item.idcita)
    const linked = citaId ? citaById.get(citaId) : undefined
    const fromCita = linked ? citaOutcome(linked) : null
    const raw = consultaMotive(item, tipos)
    const cancelled = isCancelMotive(raw) || fromCita === 'cancelada'
    if (citaId) countedCitas.add(citaId)
    addMotiveCount(map, motiveFamilyLabel(raw), cancelled ? 'cancelada' : 'realizada')
  }

  for (const cita of citas) {
    const id = citaIdKey(cita.idcita)
    if (countedCitas.has(id)) continue
    const outcome = citaOutcome(cita)
    if (!outcome) continue
    const raw = citaMotiveLabel(cita, tipoByCita)
    addMotiveCount(map, motiveFamilyLabel(raw), outcome)
  }

  const sorted = [...map.values()].sort(
    (a, b) => b.realizadas + b.canceladas - (a.realizadas + a.canceladas) || a.label.localeCompare(b.label, 'es'),
  )
  const head = sorted.slice(0, limit)
  const rest = sorted.slice(limit)
  if (rest.length > 0) {
    head.push({
      key: 'otros',
      label: 'Otros',
      realizadas: rest.reduce((sum, row) => sum + row.realizadas, 0),
      canceladas: rest.reduce((sum, row) => sum + row.canceladas, 0),
    })
  }
  return head
}
