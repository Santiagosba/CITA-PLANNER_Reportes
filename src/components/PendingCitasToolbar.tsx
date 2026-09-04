import { Download, RefreshCw } from 'lucide-react'
import { CALENDAR_SCALE_OPTIONS, type CalendarScale } from '../lib/calendarScale'
import { type DateRangePreset, type ResolvedDateRange } from '../lib/dateRangePresets'
import { CHANNEL_OPTIONS } from '../lib/tallerStations'
import type { PeticionesStats } from '../lib/peticionesPendientes'
import Button from './ui/Button'

export type EstadoFilter = 'todas' | 'faltan' | 'hechas'

const PERIOD_CHIPS: { id: DateRangePreset; label: string }[] = [
  { id: 'semana', label: 'Semana' },
  { id: 'mes', label: 'Mes' },
  { id: 'trimestre', label: '3 meses' },
  { id: 'anio', label: 'Año' },
  { id: 'personalizada', label: 'Entre' },
  { id: 'todas', label: 'Todas' },
]

type Props = {
  view: 'kanban' | 'tabla' | 'calendario'
  preset: DateRangePreset
  customFrom: string
  customTo: string
  dateRange: ResolvedDateRange
  stats: PeticionesStats
  loading: boolean
  canExport: boolean
  channel: string
  slaOnly: boolean
  estado: EstadoFilter
  onPresetChange: (preset: DateRangePreset) => void
  onCustomFromChange: (v: string) => void
  onCustomToChange: (v: string) => void
  onChannelChange: (v: string) => void
  onSlaOnlyChange: (v: boolean) => void
  onEstadoChange: (v: EstadoFilter) => void
  calendarScale: CalendarScale
  onCalendarScaleChange: (v: CalendarScale) => void
  onGoToday: () => void
  onRefresh: () => void
  onExport: () => void
}

export default function PendingCitasToolbar({
  view,
  preset,
  customFrom,
  customTo,
  dateRange,
  stats,
  loading,
  canExport,
  channel,
  slaOnly,
  estado,
  onPresetChange,
  onCustomFromChange,
  onCustomToChange,
  onChannelChange,
  onSlaOnlyChange,
  onEstadoChange,
  calendarScale,
  onCalendarScaleChange,
  onGoToday,
  onRefresh,
  onExport,
}: Props) {
  const pctDone = !loading && stats.total > 0 ? Math.round(stats.pctHechas) : null

  const title =
    view === 'calendario'
      ? 'Calendario'
      : view === 'tabla'
        ? 'Listado de consultas'
        : 'Consultas pendientes'

  const subtitle =
    view === 'calendario'
      ? 'Agenda del taller por día, semana, mes o año.'
      : view === 'tabla'
        ? 'Todas las consultas del periodo seleccionado.'
        : 'Llamadas y tareas del chatbot: cuántas están hechas y cuántas faltan.'

  return (
    <header className="dashboard-header panel-stack">
      <div className="dashboard-header-top">
        <div>
          <h1 className="section-title">{title}</h1>
          <p className="section-subtitle mt-1">{subtitle}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={onRefresh} disabled={loading}>
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
            Actualizar
          </Button>
          {view === 'tabla' ? (
            <Button variant="primary" onClick={onExport} disabled={!canExport}>
              <Download size={18} />
              Descargar
            </Button>
          ) : null}
        </div>
      </div>

      <div className="elevator-filters glass glass-lite">
        <div className="filter-field">
          <span className="filter-field-label">Estado</span>
          <div className="estado-filter" role="group" aria-label="Estado de las consultas">
            <button
              type="button"
              className={`preset-chip ${estado === 'todas' ? 'is-active' : ''}`}
              onClick={() => onEstadoChange('todas')}
            >
              Todas
            </button>
            <button
              type="button"
              className={`preset-chip ${estado === 'faltan' ? 'is-active' : ''}`}
              onClick={() => onEstadoChange('faltan')}
            >
              Faltan
            </button>
            <button
              type="button"
              className={`preset-chip ${estado === 'hechas' ? 'is-active' : ''}`}
              onClick={() => onEstadoChange('hechas')}
            >
              Hechas
            </button>
          </div>
        </div>
        <label className="filter-field">
          <span className="filter-field-label">Canal</span>
          <select className="field-select" value={channel} onChange={(e) => onChannelChange(e.target.value)}>
            {CHANNEL_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
        </label>
        {view === 'calendario' ? (
          <div className="filter-field">
            <span className="filter-field-label">Ver agenda</span>
            <div className="estado-filter" role="group" aria-label="Vista del calendario">
              {CALENDAR_SCALE_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={`preset-chip ${calendarScale === opt.id ? 'is-active' : ''}`}
                  onClick={() => onCalendarScaleChange(opt.id)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="filter-field">
            <span className="filter-field-label">Fechas · {dateRange.label}</span>
            <div className="estado-filter" role="group" aria-label="Rango de fechas">
              {PERIOD_CHIPS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={`preset-chip ${preset === opt.id ? 'is-active' : ''}`}
                  onClick={() => onPresetChange(opt.id)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}
        <label className={`elevator-sla ${slaOnly ? 'is-active' : ''}`}>
          <input
            type="checkbox"
            checked={slaOnly}
            onChange={(e) => onSlaOnlyChange(e.target.checked)}
          />
          SLA Crítico (&lt;15 min)
        </label>
        <div className="elevator-day-nav">
          <button type="button" className="ghost-button" onClick={onGoToday}>
            Hoy
          </button>
        </div>
      </div>

      {preset === 'personalizada' ? (
        <div className="period-custom glass glass-lite">
          <label className="filter-field">
            <span className="filter-field-label">Desde</span>
            <input
              type="date"
              value={customFrom}
              onChange={(e) => onCustomFromChange(e.target.value)}
              className="field-input"
            />
          </label>
          <label className="filter-field">
            <span className="filter-field-label">Hasta</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => onCustomToChange(e.target.value)}
              min={customFrom || undefined}
              className="field-input"
            />
          </label>
        </div>
      ) : null}

      <div className="bento-grid is-kpis" aria-label="Resumen del periodo">
        <div className="bento-cell glass glass-lite metric">
          <span>Faltan</span>
          <strong style={{ color: stats.porHacer > 0 ? 'var(--color-warning)' : 'var(--color-success)' }}>
            {loading ? '—' : stats.porHacer}
          </strong>
          <small>{loading ? '…' : stats.porHacer === 0 ? 'Todo al día' : 'Por terminar'}</small>
        </div>
        <div className="bento-cell glass glass-lite metric">
          <span>Hechas</span>
          <strong style={{ color: 'var(--color-success)' }}>{loading ? '—' : stats.hechas}</strong>
          <small>{loading ? '…' : 'Bien cerradas'}</small>
        </div>
        <div className="bento-cell glass glass-lite metric">
          <span>Total</span>
          <strong>{loading ? '—' : stats.total}</strong>
          <small>{loading ? '…' : dateRange.label}</small>
        </div>
      </div>

      {pctDone != null ? (
        <div className="avance-strip glass glass-lite" aria-label="Avance de las consultas">
          <span className="avance-side is-done">{stats.hechas} hechas</span>
          <div
            className="avance-bar"
            role="progressbar"
            aria-valuenow={pctDone}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <span className="avance-fill" style={{ width: `${pctDone}%` }} />
          </div>
          <strong className="avance-pct">{pctDone}%</strong>
          <span className="avance-side is-todo">{stats.porHacer} faltan</span>
        </div>
      ) : null}
    </header>
  )
}
