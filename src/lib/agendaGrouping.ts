import type { PeticionPendiente } from './peticionesPendientes'

export type AgendaDayGroup = {
  label: string
  items: PeticionPendiente[]
}

type Bucket = 'today' | 'yesterday' | 'week' | 'older'

const BUCKET_LABELS: Record<Bucket, string> = {
  today: 'Hoy',
  yesterday: 'Ayer',
  week: 'Esta semana',
  older: 'Anteriores',
}

const BUCKET_ORDER: Bucket[] = ['today', 'yesterday', 'week', 'older']

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function startOfWeekMonday(d: Date): Date {
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const monday = new Date(d)
  monday.setDate(d.getDate() + diff)
  return startOfDay(monday)
}

function bucketForDate(iso: string | null): Bucket {
  if (!iso) return 'older'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'older'

  const now = new Date()
  const today = startOfDay(now)
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const weekStart = startOfWeekMonday(now)
  const itemDay = startOfDay(d)

  if (itemDay >= today) return 'today'
  if (itemDay >= yesterday) return 'yesterday'
  if (itemDay >= weekStart) return 'week'
  return 'older'
}

export function groupPeticionesByAgendaDay(items: PeticionPendiente[]): AgendaDayGroup[] {
  const buckets: Record<Bucket, PeticionPendiente[]> = {
    today: [],
    yesterday: [],
    week: [],
    older: [],
  }

  for (const item of items) {
    buckets[bucketForDate(item.fechainicio)].push(item)
  }

  return BUCKET_ORDER.filter((b) => buckets[b].length > 0).map((b) => ({
    label: BUCKET_LABELS[b],
    items: buckets[b],
  }))
}

export function formatAgendaTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return '—'
  }
}

export function formatAgendaDayHeader(iso: string | null | undefined): string | null {
  if (!iso) return null
  try {
    return new Date(iso).toLocaleDateString('es-ES', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    })
  } catch {
    return null
  }
}
