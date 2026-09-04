import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Clock3, RefreshCw } from 'lucide-react'
import ApiStatusBanner from '../components/ApiStatusBanner'
import VehiclePlate from '../components/ui/VehiclePlate'
import { toDateInputValue } from '../lib/dateRangePresets'
import { useCitasTaller } from '../hooks/useCitasTaller'
import type { CitaTaller } from '../lib/citasTaller'
import type { Workshop } from '../types'

type StationId = 'elev1' | 'elev2' | 'elev3' | 'paint' | 'peritaje'

type Station = {
  id: StationId
  label: string
  responsibles: string
  keywords: string[]
}

const STATIONS: Station[] = [
  {
    id: 'elev1',
    label: 'Elevador 1 - Mecánica Rápida',
    responsibles: 'Resp: Manuel Rivas (Oficial 1ª)',
    keywords: ['mec', 'rápid', 'rapid', 'manten', 'aceite', 'revisi', 'filtro', 'itv'],
  },
  {
    id: 'elev2',
    label: 'Elevador 2 - Diagnosis / Motor',
    responsibles: 'Resp: Alberto Cuesta (Master Tech)',
    keywords: ['diagn', 'motor', 'aver', 'ruido', 'inyec', 'turbo'],
  },
  {
    id: 'elev3',
    label: 'Elevador 3 - Híbridos / EV',
    responsibles: 'Resp: Sonia Gil (Certificada Alta Tensión)',
    keywords: ['híbrid', 'hibrid', 'ev', 'eléct', 'elect', 'bater', 'alta tensión'],
  },
  {
    id: 'paint',
    label: 'Cabina Pintura 1 & Secado',
    responsibles: 'Resp: Pedro Navas (Carrocero Pintor)',
    keywords: ['pint', 'chapa', 'carrocer', 'luna', 'golpe', 'cabina'],
  },
  {
    id: 'peritaje',
    label: 'Puesto Peritaje Seguros / ADAS',
    responsibles: 'Resp: Raúl Sanz (Perito Técnico)',
    keywords: ['perit', 'seguro', 'siniestro', 'adas', 'mapfre', 'mutua', 'allianz'],
  },
]

const BRANCH_OPTIONS = [
  { id: 'all', label: 'Todas las ramas' },
  ...STATIONS.map((station) => ({ id: station.id, label: station.label })),
]

const CHANNEL_OPTIONS = [
  { id: 'voz-wa', label: 'Voz & WhatsApp' },
  { id: 'voz', label: 'Solo voz' },
  { id: 'wa', label: 'Solo WhatsApp' },
]

const SLOT_START = 8 * 60
const SLOT_END = 19 * 60
const SLOT_STEP = 30

type Props = {
  workshop: Workshop
  embedded?: boolean
}

function minutesOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes()
}

function formatSlot(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function buildSlots(): number[] {
  const slots: number[] = []
  for (let m = SLOT_START; m < SLOT_END; m += SLOT_STEP) slots.push(m)
  return slots
}

function assignStation(cita: CitaTaller): StationId {
  const text = `${cita.asunto || ''} ${cita.observaciones || ''} ${cita.marca || ''} ${cita.modelo || ''} ${cita.motor || ''}`.toLowerCase()
  const hit = STATIONS.find((station) => station.keywords.some((keyword) => text.includes(keyword)))
  if (hit) return hit.id
  // Reparto estable si no hay keyword clara
  const hash = [...String(cita.idcita)].reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
  return STATIONS[hash % STATIONS.length].id
}

function customerLabel(cita: CitaTaller): string {
  const person = [cita.nombre, cita.apellidos].filter(Boolean).join(' ')
  if (person) return person
  if (cita.razonSocial) return cita.razonSocial
  if (cita.contacto) return cita.contacto
  return 'Cliente'
}

function vehicleLabel(cita: CitaTaller): string {
  const parts = [cita.marca, cita.modelo, cita.motor].filter(Boolean)
  return parts.join(' ') || 'Vehículo sin detalle'
}

function matchesChannel(cita: CitaTaller, channel: string): boolean {
  const text = `${cita.asunto || ''} ${cita.observaciones || ''}`.toLowerCase()
  if (channel === 'voz') return /voz|llamad|tel[eé]fono|call/.test(text) || !/whats?app|wa\b/.test(text)
  if (channel === 'wa') return /whats?app|wa\b|mensaje/.test(text)
  return true
}

export default function CalendarTallerView({ workshop, embedded = false }: Props) {
  const [day, setDay] = useState(() => {
    const now = new Date()
    now.setHours(0, 0, 0, 0)
    return now
  })
  const [branch, setBranch] = useState('all')
  const [channel, setChannel] = useState('voz-wa')
  const [slaOnly, setSlaOnly] = useState(false)

  const dayKey = toDateInputValue(day)
  const range = { from: dayKey, to: dayKey }
  const { citas, loading, error, refresh } = useCitasTaller(workshop, range)
  const slots = useMemo(() => buildSlots(), [])

  const visibleStations = useMemo(
    () => (branch === 'all' ? STATIONS : STATIONS.filter((station) => station.id === branch)),
    [branch],
  )

  const dayCitas = useMemo(() => {
    const now = Date.now()
    return citas.filter((cita) => {
      if (!cita.fecha) return false
      const date = new Date(cita.fecha)
      if (Number.isNaN(date.getTime()) || toDateInputValue(date) !== dayKey) return false
      if (!matchesChannel(cita, channel)) return false
      if (slaOnly) {
        const waitMin = Math.abs(now - date.getTime()) / 60000
        if (waitMin > 15 && date.getTime() >= now) return false
        if (date.getTime() < now - 15 * 60000) return false
      }
      return true
    })
  }, [citas, dayKey, channel, slaOnly])

  const occupancy = useMemo(() => {
    const map: Record<StationId, number> = {
      elev1: 0,
      elev2: 0,
      elev3: 0,
      paint: 0,
      peritaje: 0,
    }
    for (const cita of dayCitas) map[assignStation(cita)] += 1
    const maxSlots = slots.length || 1
    return STATIONS.reduce(
      (acc, station) => {
        acc[station.id] = Math.min(98, Math.round((map[station.id] / maxSlots) * 100) || (map[station.id] > 0 ? 35 : 12))
        // Si hay citas, carga mínima visual; si no, carga base baja
        if (map[station.id] === 0) acc[station.id] = station.id === 'paint' ? 18 : 12
        else acc[station.id] = Math.min(95, 40 + map[station.id] * 12)
        return acc
      },
      {} as Record<StationId, number>,
    )
  }, [dayCitas, slots.length])

  const grid = useMemo(() => {
    const cells: Record<string, CitaTaller | null> = {}
    for (const station of visibleStations) {
      for (const slot of slots) cells[`${station.id}:${slot}`] = null
    }

    for (const cita of dayCitas) {
      const stationId = assignStation(cita)
      if (branch !== 'all' && stationId !== branch) continue
      const date = new Date(cita.fecha!)
      const minutes = minutesOfDay(date)
      const slot = Math.floor(minutes / SLOT_STEP) * SLOT_STEP
      if (slot < SLOT_START || slot >= SLOT_END) continue
      const key = `${stationId}:${slot}`
      if (!(key in cells)) continue
      // Si el hueco está ocupado, busca el siguiente libre de esa estación
      if (!cells[key]) {
        cells[key] = cita
        continue
      }
      for (let next = slot + SLOT_STEP; next < SLOT_END; next += SLOT_STEP) {
        const alt = `${stationId}:${next}`
        if (alt in cells && !cells[alt]) {
          cells[alt] = cita
          break
        }
      }
    }
    return cells
  }, [dayCitas, visibleStations, slots, branch])

  const dayLabel = day.toLocaleDateString('es-ES', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
  const isToday = dayKey === toDateInputValue(new Date())

  const shiftDay = (delta: number) => {
    setDay((prev) => {
      const next = new Date(prev)
      next.setDate(prev.getDate() + delta)
      return next
    })
  }

  return (
    <div className={embedded ? 'elevator-agenda' : 'dashboard-page elevator-agenda'}>
      {!embedded ? (
        <header className="dashboard-header-top">
          <div>
            <p className="section-eyebrow">Agenda del taller</p>
            <h1 className="section-title">Calendario taller</h1>
          </div>
        </header>
      ) : null}

      <div className="elevator-filters glass glass-lite">
        <label className="field-label">
          Rama
          <select className="field-select" value={branch} onChange={(e) => setBranch(e.target.value)}>
            {BRANCH_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
        </label>
        <label className="field-label">
          Canal
          <select className="field-select" value={channel} onChange={(e) => setChannel(e.target.value)}>
            {CHANNEL_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
        </label>
        <label className={`elevator-sla ${slaOnly ? 'is-active' : ''}`}>
          <input type="checkbox" checked={slaOnly} onChange={(e) => setSlaOnly(e.target.checked)} />
          SLA Crítico (&lt;15 min)
        </label>
        <div className="elevator-day-nav">
          <button type="button" className="ghost-button calendar-nav" onClick={() => shiftDay(-1)} aria-label="Día anterior">
            <ChevronLeft size={17} />
          </button>
          <button type="button" className="ghost-button" onClick={() => setDay(new Date(new Date().setHours(0, 0, 0, 0)))}>
            Hoy
          </button>
          <button type="button" className="ghost-button calendar-nav" onClick={() => shiftDay(1)} aria-label="Día siguiente">
            <ChevronRight size={17} />
          </button>
          <button type="button" className="ghost-button" onClick={() => void refresh()} disabled={loading}>
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {error ? <ApiStatusBanner message={error} variant="error" /> : null}

      <section className="elevator-hero glass glass-lite">
        <div>
          <p className="section-eyebrow">08:00 - 19:00</p>
          <h2 className="ops-card-title">Agenda de Taller y Puestos de Elevador</h2>
          <p className="section-subtitle">
            Gestión de boxes con asignación de operarios oficiales y control de carga horaria.
          </p>
        </div>
        <div className="elevator-hero-date">
          <Clock3 size={16} />
          <strong>{isToday ? 'Hoy, ' : ''}{dayLabel}</strong>
        </div>
      </section>

      <section className="elevator-load-grid" aria-label="Carga de puestos">
        {visibleStations.map((station) => {
          const pct = occupancy[station.id]
          return (
            <article key={station.id} className="elevator-load-card glass glass-lite">
              <div className="elevator-load-top">
                <strong>{station.label}</strong>
                <span>{pct}%</span>
              </div>
              <div className="elevator-load-bar" aria-hidden>
                <span style={{ width: `${pct}%` }} />
              </div>
              <p>{station.responsibles}</p>
            </article>
          )
        })}
      </section>

      <div className="elevator-schedule-wrap glass glass-lite custom-scrollbar-light">
        <table className="elevator-schedule">
          <thead>
            <tr>
              <th className="elevator-schedule-time">Hora</th>
              {visibleStations.map((station) => (
                <th key={station.id}>{station.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={visibleStations.length + 1} className="elevator-schedule-empty">
                  Cargando agenda del taller…
                </td>
              </tr>
            ) : (
              slots.map((slot) => (
                <tr key={slot}>
                  <th scope="row" className="elevator-schedule-time">{formatSlot(slot)}</th>
                  {visibleStations.map((station) => {
                    const cita = grid[`${station.id}:${slot}`]
                    if (!cita) {
                      return (
                        <td key={station.id}>
                          <div className="elevator-slot is-free">Libre</div>
                        </td>
                      )
                    }
                    return (
                      <td key={station.id}>
                        <div className="elevator-slot is-busy">
                          <strong>{vehicleLabel(cita)}</strong>
                          <span className="elevator-slot-customer">{customerLabel(cita)}</span>
                          {cita.matricula ? <VehiclePlate value={cita.matricula} compact /> : null}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
