import { toDateInputValue } from './dateRangePresets'

export type CalendarScale = 'dia' | 'semana' | 'mes' | 'anio'

export const CALENDAR_SCALE_OPTIONS: { id: CalendarScale; label: string }[] = [
  { id: 'dia', label: 'Día' },
  { id: 'semana', label: 'Semana' },
  { id: 'mes', label: 'Mes' },
  { id: 'anio', label: 'Año' },
]

export const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

export function startOfCalendarDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

/** Semana ISO (lunes–domingo). */
export function startOfCalendarWeek(d: Date): Date {
  const x = startOfCalendarDay(d)
  const day = x.getDay()
  const diff = day === 0 ? -6 : 1 - day
  x.setDate(x.getDate() + diff)
  return x
}

export function daysOfWeek(anchor: Date): Date[] {
  const start = startOfCalendarWeek(anchor)
  return Array.from({ length: 7 }, (_, i) => {
    const next = new Date(start)
    next.setDate(start.getDate() + i)
    return next
  })
}

export function monthCells(anchor: Date): { date: Date; inMonth: boolean }[] {
  const first = startOfCalendarDay(new Date(anchor.getFullYear(), anchor.getMonth(), 1))
  const last = startOfCalendarDay(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0))
  const start = startOfCalendarWeek(first)
  const end = startOfCalendarWeek(last)
  end.setDate(end.getDate() + 6)

  const cells: { date: Date; inMonth: boolean }[] = []
  const cursor = new Date(start)
  while (cursor.getTime() <= end.getTime()) {
    const date = new Date(cursor)
    cells.push({ date, inMonth: date.getMonth() === anchor.getMonth() })
    cursor.setDate(cursor.getDate() + 1)
  }
  return cells
}

export function yearMonths(anchor: Date): Date[] {
  return Array.from({ length: 12 }, (_, month) =>
    startOfCalendarDay(new Date(anchor.getFullYear(), month, 1)),
  )
}

export function calendarPeriod(
  scale: CalendarScale,
  anchor: Date,
): { from: string; to: string; label: string } {
  const a = startOfCalendarDay(anchor)
  if (scale === 'dia') {
    const key = toDateInputValue(a)
    return {
      from: key,
      to: key,
      label: a.toLocaleDateString('es-ES', {
        weekday: 'long',
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      }),
    }
  }
  if (scale === 'semana') {
    const from = startOfCalendarWeek(a)
    const to = new Date(from)
    to.setDate(from.getDate() + 6)
    return {
      from: toDateInputValue(from),
      to: toDateInputValue(to),
      label: `${from.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} – ${to.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}`,
    }
  }
  if (scale === 'mes') {
    const from = new Date(a.getFullYear(), a.getMonth(), 1)
    const to = new Date(a.getFullYear(), a.getMonth() + 1, 0)
    return {
      from: toDateInputValue(from),
      to: toDateInputValue(to),
      label: a.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }),
    }
  }
  const from = new Date(a.getFullYear(), 0, 1)
  const to = new Date(a.getFullYear(), 11, 31)
  return {
    from: toDateInputValue(from),
    to: toDateInputValue(to),
    label: String(a.getFullYear()),
  }
}

export function shiftCalendarAnchor(scale: CalendarScale, anchor: Date, delta: number): Date {
  const next = startOfCalendarDay(anchor)
  if (scale === 'dia') next.setDate(next.getDate() + delta)
  else if (scale === 'semana') next.setDate(next.getDate() + delta * 7)
  else if (scale === 'mes') next.setMonth(next.getMonth() + delta)
  else next.setFullYear(next.getFullYear() + delta)
  return next
}
