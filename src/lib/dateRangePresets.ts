export type DateRangePreset = 'semana' | 'mes' | 'trimestre' | 'anio' | 'personalizada' | 'todas'

export type ResolvedDateRange = {
  from?: string
  to?: string
  label: string
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** YYYY-MM-DD en hora local (evita desfases UTC). */
export function toDateInputValue(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function endOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(23, 59, 59, 999)
  return x
}

/** Semana ISO (lunes–domingo). */
function startOfWeek(d: Date): Date {
  const x = startOfDay(d)
  const day = x.getDay()
  const diff = day === 0 ? -6 : 1 - day
  x.setDate(x.getDate() + diff)
  return x
}

function endOfWeek(d: Date): Date {
  const s = startOfWeek(d)
  const e = new Date(s)
  e.setDate(s.getDate() + 6)
  return endOfDay(e)
}

function startOfMonth(d: Date): Date {
  return startOfDay(new Date(d.getFullYear(), d.getMonth(), 1))
}

function endOfMonth(d: Date): Date {
  return endOfDay(new Date(d.getFullYear(), d.getMonth() + 1, 0))
}

function startOfQuarter(d: Date): Date {
  const q = Math.floor(d.getMonth() / 3) * 3
  return startOfDay(new Date(d.getFullYear(), q, 1))
}

function endOfQuarter(d: Date): Date {
  const q = Math.floor(d.getMonth() / 3) * 3 + 2
  return endOfDay(new Date(d.getFullYear(), q + 1, 0))
}

function startOfYear(d: Date): Date {
  return startOfDay(new Date(d.getFullYear(), 0, 1))
}

function endOfYear(d: Date): Date {
  return endOfDay(new Date(d.getFullYear(), 11, 31))
}

function formatLabel(from: Date, to: Date): string {
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }
  const a = from.toLocaleDateString('es-ES', opts)
  const b = to.toLocaleDateString('es-ES', opts)
  return a === b ? a : `${a} – ${b}`
}

export function resolveDateRange(
  preset: DateRangePreset,
  customFrom?: string,
  customTo?: string,
  refDate: Date = new Date(),
): ResolvedDateRange {
  switch (preset) {
    case 'semana': {
      const from = startOfWeek(refDate)
      const to = endOfWeek(refDate)
      return { from: toDateInputValue(from), to: toDateInputValue(to), label: `Semana · ${formatLabel(from, to)}` }
    }
    case 'mes': {
      const from = startOfMonth(refDate)
      const to = endOfMonth(refDate)
      return {
        from: toDateInputValue(from),
        to: toDateInputValue(to),
        label: from.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }),
      }
    }
    case 'trimestre': {
      const from = startOfQuarter(refDate)
      const to = endOfQuarter(refDate)
      const q = Math.floor(refDate.getMonth() / 3) + 1
      return {
        from: toDateInputValue(from),
        to: toDateInputValue(to),
        label: `T${q} ${refDate.getFullYear()} · ${formatLabel(from, to)}`,
      }
    }
    case 'anio': {
      const from = startOfYear(refDate)
      const to = endOfYear(refDate)
      return { from: toDateInputValue(from), to: toDateInputValue(to), label: String(refDate.getFullYear()) }
    }
    case 'personalizada': {
      const fromStr = customFrom?.trim()
      const toStr = customTo?.trim()
      if (!fromStr && !toStr) return { label: 'Rango personalizado' }
      if (fromStr && toStr) {
        const from = new Date(`${fromStr}T00:00:00`)
        const to = new Date(`${toStr}T00:00:00`)
        return { from: fromStr, to: toStr, label: formatLabel(from, to) }
      }
      if (fromStr) return { from: fromStr, label: `Desde ${fromStr}` }
      return { to: toStr, label: `Hasta ${toStr}` }
    }
    case 'todas':
    default:
      return { label: 'Todas las fechas' }
  }
}

export const DATE_PRESET_OPTIONS: { id: DateRangePreset; label: string }[] = [
  { id: 'semana', label: 'Esta semana' },
  { id: 'mes', label: 'Este mes' },
  { id: 'trimestre', label: 'Este trimestre' },
  { id: 'anio', label: 'Este año' },
  { id: 'personalizada', label: 'Elegir fechas' },
  { id: 'todas', label: 'Ver todo' },
]
