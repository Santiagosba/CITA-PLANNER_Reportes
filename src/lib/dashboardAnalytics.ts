import {
  daysOfWeek,
  yearMonths,
  type CalendarScale,
} from './calendarScale'
import { toDateInputValue } from './dateRangePresets'
import { inferPeticionTipo } from './interactionLabels'
import { normalizeEmail, type AdvisorPerson } from './advisorWorkspace'
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

export function typeMix(items: PeticionPendiente[], limit = 6): MixRow[] {
  const map = new Map<string, number>()
  for (const item of items) {
    const label = (item.tipopeticion || 'Sin tipo').trim() || 'Sin tipo'
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
