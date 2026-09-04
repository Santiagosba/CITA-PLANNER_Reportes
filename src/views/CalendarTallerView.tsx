import { useMemo } from 'react'
import { ChevronLeft, ChevronRight, Clock3, RefreshCw } from 'lucide-react'
import ApiStatusBanner from '../components/ApiStatusBanner'
import { HexLoaderScreen } from '../components/ui/HexLoader'
import VehiclePlate from '../components/ui/VehiclePlate'
import { toDateInputValue } from '../lib/dateRangePresets'
import {
  WEEKDAY_LABELS,
  calendarPeriod,
  daysOfWeek,
  monthCells,
  shiftCalendarAnchor,
  startOfCalendarDay,
  yearMonths,
  type CalendarScale,
} from '../lib/calendarScale'
import { useCitasTaller } from '../hooks/useCitasTaller'
import type { CitaTaller } from '../lib/citasTaller'
import { isSlaCritico, matchesChannelText } from '../lib/tallerStations'
import type { Workshop } from '../types'

const SLOT_START = 8 * 60
const SLOT_END = 19 * 60
const SLOT_STEP = 30

type Props = {
  workshop: Workshop
  embedded?: boolean
  channel: string
  slaOnly: boolean
  day: Date
  onDayChange: (day: Date) => void
  scale: CalendarScale
  onScaleChange: (scale: CalendarScale) => void
  onOpenCita?: (cita: CitaTaller) => void
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

function citaTime(cita: CitaTaller): string {
  if (!cita.fecha) return ''
  const date = new Date(cita.fecha)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
}

function slotOf(cita: CitaTaller): number {
  const date = new Date(cita.fecha!)
  let slot = Math.floor(minutesOfDay(date) / SLOT_STEP) * SLOT_STEP
  if (slot < SLOT_START) return SLOT_START
  if (slot >= SLOT_END) return SLOT_END - SLOT_STEP
  return slot
}

function CitaChip({
  cita,
  compact = false,
  onOpen,
}: {
  cita: CitaTaller
  compact?: boolean
  onOpen?: (cita: CitaTaller) => void
}) {
  const time = citaTime(cita)
  return (
    <button
      type="button"
      className={`calendar-chip${onOpen ? ' is-clickable' : ''}${compact ? ' is-compact' : ''}`}
      onClick={(e) => {
        e.stopPropagation()
        onOpen?.(cita)
      }}
    >
      {time ? <time>{time}</time> : null}
      {cita.matricula ? <VehiclePlate value={cita.matricula} compact /> : <strong>{vehicleLabel(cita)}</strong>}
      {compact ? null : (
        <>
          {cita.matricula ? <strong>{vehicleLabel(cita)}</strong> : null}
          <span>{customerLabel(cita)}</span>
        </>
      )}
    </button>
  )
}

export default function CalendarTallerView({
  workshop,
  embedded = false,
  channel,
  slaOnly,
  day,
  onDayChange,
  scale,
  onScaleChange,
  onOpenCita,
}: Props) {
  const period = useMemo(() => calendarPeriod(scale, day), [scale, day])
  const { citas, loading, error, refresh } = useCitasTaller(workshop, {
    from: period.from,
    to: period.to,
  })
  const slots = useMemo(() => buildSlots(), [])
  const todayKey = toDateInputValue(new Date())

  const visibleCitas = useMemo(() => {
    return citas.filter((cita) => {
      if (!cita.fecha) return false
      const date = new Date(cita.fecha)
      if (Number.isNaN(date.getTime())) return false
      const key = toDateInputValue(date)
      if (key < period.from || key > period.to) return false
      const text = `${cita.asunto || ''} ${cita.observaciones || ''}`
      if (!matchesChannelText(text, channel)) return false
      if (slaOnly && !isSlaCritico(cita.fecha)) return false
      return true
    })
  }, [citas, period.from, period.to, channel, slaOnly])

  const byDay = useMemo(() => {
    const map = new Map<string, CitaTaller[]>()
    for (const cita of visibleCitas) {
      const key = toDateInputValue(new Date(cita.fecha!))
      const list = map.get(key)
      if (list) list.push(cita)
      else map.set(key, [cita])
    }
    for (const list of map.values()) {
      list.sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)))
    }
    return map
  }, [visibleCitas])

  const gridDays = useMemo(() => (scale === 'semana' ? daysOfWeek(day) : [startOfCalendarDay(day)]), [scale, day])

  const byDaySlot = useMemo(() => {
    const map = new Map<string, Map<number, CitaTaller[]>>()
    for (const date of gridDays) {
      const slotsMap = new Map<number, CitaTaller[]>()
      for (const slot of slots) slotsMap.set(slot, [])
      map.set(toDateInputValue(date), slotsMap)
    }
    for (const cita of visibleCitas) {
      const key = toDateInputValue(new Date(cita.fecha!))
      map.get(key)?.get(slotOf(cita))?.push(cita)
    }
    return map
  }, [visibleCitas, gridDays, slots])

  const goToday = () => onDayChange(startOfCalendarDay(new Date()))
  const shift = (delta: number) => onDayChange(shiftCalendarAnchor(scale, day, delta))
  const openDay = (date: Date) => {
    onDayChange(startOfCalendarDay(date))
    onScaleChange('dia')
  }
  const openMonth = (date: Date) => {
    onDayChange(startOfCalendarDay(date))
    onScaleChange('mes')
  }

  const scaleHint =
    scale === 'dia' || scale === 'semana'
      ? '08:00 – 19:00 · cada cita en su hora'
      : scale === 'mes'
        ? 'Pulsa un día para ver la agenda por horas'
        : 'Pulsa un mes para ver el detalle'

  return (
    <div className={embedded ? 'calendar-agenda' : 'dashboard-page calendar-agenda'}>
      {!embedded ? (
        <header className="dashboard-header-top">
          <div>
            <p className="section-eyebrow">Agenda del taller</p>
            <h1 className="section-title">Calendario</h1>
          </div>
        </header>
      ) : null}

      {error ? <ApiStatusBanner message={error} variant="error" /> : null}

      <section className="calendar-agenda-head glass glass-lite">
        <div>
          <p className="section-eyebrow">{scaleHint}</p>
          <h2 className="ops-card-title">Agenda</h2>
          <p className="section-subtitle">
            {loading ? 'Cargando citas…' : `${visibleCitas.length} cita${visibleCitas.length === 1 ? '' : 's'} en este periodo.`}
          </p>
        </div>
        <div className="calendar-agenda-actions">
          <div className="elevator-day-nav">
            <button type="button" className="ghost-button calendar-nav" onClick={() => shift(-1)} aria-label="Periodo anterior">
              <ChevronLeft size={17} />
            </button>
            <button type="button" className="ghost-button" onClick={goToday}>
              Hoy
            </button>
            <button type="button" className="ghost-button calendar-nav" onClick={() => shift(1)} aria-label="Periodo siguiente">
              <ChevronRight size={17} />
            </button>
            <button type="button" className="ghost-button" onClick={() => void refresh()} disabled={loading}>
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
          <div className="calendar-day-date">
            <Clock3 size={16} />
            <strong>{period.label}</strong>
          </div>
        </div>
      </section>

      {scale === 'dia' || scale === 'semana' ? (
        <div className="calendar-schedule-wrap glass glass-lite custom-scrollbar-light">
          {loading ? (
            <HexLoaderScreen size="md" label="Cargando agenda del taller…" />
          ) : (
            <table className={`calendar-schedule${scale === 'semana' ? ' is-week' : ' is-day'}`}>
              <thead>
                <tr>
                  <th className="calendar-schedule-time">Hora</th>
                  {gridDays.map((date) => {
                    const key = toDateInputValue(date)
                    const count = byDay.get(key)?.length ?? 0
                    return (
                      <th key={key} className={key === todayKey ? 'is-today' : undefined}>
                        {scale === 'semana' ? (
                          <button type="button" className="calendar-schedule-day" onClick={() => openDay(date)}>
                            <span>{date.toLocaleDateString('es-ES', { weekday: 'short' })}</span>
                            <strong>{date.getDate()}</strong>
                            <small>{count}</small>
                          </button>
                        ) : (
                          <span className="calendar-schedule-day is-static">
                            <span>{date.toLocaleDateString('es-ES', { weekday: 'long' })}</span>
                            <strong>{date.getDate()}</strong>
                          </span>
                        )}
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {slots.map((slot) => (
                  <tr key={slot}>
                    <th className="calendar-schedule-time">{formatSlot(slot)}</th>
                    {gridDays.map((date) => {
                      const key = toDateInputValue(date)
                      const items = byDaySlot.get(key)?.get(slot) ?? []
                      return (
                        <td key={`${key}-${slot}`}>
                          {items.length === 0 ? (
                            <div className="calendar-slot is-free">Libre</div>
                          ) : (
                            items.map((cita) => (
                              <button
                                key={cita.idcita}
                                type="button"
                                className={`calendar-slot is-busy${onOpenCita ? ' is-clickable' : ''}`}
                                onClick={() => onOpenCita?.(cita)}
                              >
                                <strong>{vehicleLabel(cita)}</strong>
                                <span className="calendar-slot-customer">{customerLabel(cita)}</span>
                                {cita.matricula ? <VehiclePlate value={cita.matricula} compact /> : null}
                              </button>
                            ))
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : null}

      {scale === 'mes' && loading ? (
        <div className="calendar-month glass glass-lite">
          <HexLoaderScreen size="md" label="Cargando agenda del taller…" />
        </div>
      ) : null}

      {scale === 'mes' && !loading ? (
        <div className="calendar-month glass glass-lite">
          <div className="calendar-month-weekdays">
            {WEEKDAY_LABELS.map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>
          <div className="calendar-month-grid">
            {monthCells(day).map(({ date, inMonth }) => {
              const key = toDateInputValue(date)
              const items = byDay.get(key) ?? []
              const isToday = key === todayKey
              return (
                <article
                  key={key}
                  className={`calendar-month-cell${inMonth ? '' : ' is-outside'}${isToday ? ' is-today' : ''}`}
                >
                  <button type="button" className="calendar-month-cell-head" onClick={() => openDay(date)}>
                    <span>{date.getDate()}</span>
                    {items.length > 0 ? <small>{items.length}</small> : null}
                  </button>
                  <div className="calendar-month-events">
                    {items.slice(0, 3).map((cita) => (
                      <CitaChip key={cita.idcita} cita={cita} compact onOpen={onOpenCita} />
                    ))}
                    {items.length > 3 ? (
                      <button type="button" className="calendar-more" onClick={() => openDay(date)}>
                        +{items.length - 3} más
                      </button>
                    ) : null}
                  </div>
                </article>
              )
            })}
          </div>
        </div>
      ) : null}

      {scale === 'anio' && loading ? (
        <div className="calendar-month glass glass-lite">
          <HexLoaderScreen size="md" label="Cargando agenda del taller…" />
        </div>
      ) : null}

      {scale === 'anio' && !loading ? (
        <div className="calendar-year glass glass-lite">
          {yearMonths(day).map((monthDate) => {
            const month = monthDate.getMonth()
            const count = visibleCitas.filter((cita) => new Date(cita.fecha!).getMonth() === month).length
            const isCurrent =
              monthDate.getFullYear() === new Date().getFullYear() && month === new Date().getMonth()
            return (
              <section
                key={month}
                className={`calendar-year-month${isCurrent ? ' is-today' : ''}`}
              >
                <button type="button" className="calendar-year-month-head" onClick={() => openMonth(monthDate)}>
                  <span>{monthDate.toLocaleDateString('es-ES', { month: 'long' })}</span>
                  <small>{count} {count === 1 ? 'cita' : 'citas'}</small>
                </button>
                <div className="calendar-year-weekdays">
                  {WEEKDAY_LABELS.map((label) => (
                    <span key={label}>{label.slice(0, 1)}</span>
                  ))}
                </div>
                <div className="calendar-year-grid">
                  {monthCells(monthDate).map(({ date, inMonth }) => {
                    const key = toDateInputValue(date)
                    const items = byDay.get(key) ?? []
                    const isToday = key === todayKey
                    return (
                      <button
                        key={key}
                        type="button"
                        className={`calendar-year-day${inMonth ? '' : ' is-outside'}${isToday ? ' is-today' : ''}${items.length ? ' has-citas' : ''}`}
                        onClick={() => openDay(date)}
                      >
                        <span>{date.getDate()}</span>
                        {inMonth && items.length > 0 ? <small>{items.length}</small> : null}
                      </button>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
