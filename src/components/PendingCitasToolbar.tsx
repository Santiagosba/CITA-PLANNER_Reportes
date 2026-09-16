import { Download, Search } from 'lucide-react'
import { CALENDAR_SCALE_OPTIONS, type CalendarScale } from '../lib/calendarScale'
import { type DateRangePreset, type ResolvedDateRange } from '../lib/dateRangePresets'
import { CHANNEL_OPTIONS } from '../lib/tallerStations'
import type { PeticionesStats } from '../lib/peticionesPendientes'
import type { CitaLinkFilter } from '../lib/citaLinkFilter'
import type { AdvisorTeam } from '../lib/advisorWorkspace'
import type { OwnerScope } from '../lib/ownerScope'
import type { TeamFilterId } from '../lib/teamScope'
import Button from './ui/Button'
import CitaLinkFilterControl from './CitaLinkFilter'
import EstadoDoneFilter from './EstadoDoneFilter'
import OwnerScopeFilter from './OwnerScopeFilter'
import TeamFilter from './TeamFilter'
import type { EstadoFilter } from '../lib/doneFilter'

export type { EstadoFilter }

const PERIOD_CHIPS: { id: DateRangePreset; label: string }[] = [
  { id: 'semana', label: 'Semana' },
  { id: 'mes', label: 'Mes' },
  { id: 'trimestre', label: '3 meses' },
  { id: 'anio', label: 'Año' },
  { id: 'personalizada', label: 'Entre' },
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
  ownerScope: OwnerScope
  onOwnerScopeChange: (scope: OwnerScope) => void
  teams: AdvisorTeam[]
  teamFilter: TeamFilterId
  onTeamFilterChange: (filter: TeamFilterId) => void
  citaLink: CitaLinkFilter
  onCitaLinkChange: (filter: CitaLinkFilter) => void
  search: string
  onSearchChange: (value: string) => void
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
  ownerScope,
  onOwnerScopeChange,
  teams,
  teamFilter,
  onTeamFilterChange,
  citaLink,
  onCitaLinkChange,
  search,
  onSearchChange,
  onPresetChange,
  onCustomFromChange,
  onCustomToChange,
  onChannelChange,
  onSlaOnlyChange,
  onEstadoChange,
  calendarScale,
  onCalendarScaleChange,
  onGoToday,
  onRefresh: _onRefresh,
  onExport,
}: Props) {
  const pctDone = !loading && stats.total > 0 ? Math.round(stats.pctHechas) : null

  return (
    <header className="dashboard-header panel-stack">
      {view === 'tabla' ? (
        <div className="dashboard-header-top">
          <p className="section-subtitle">Exporta el periodo con todos los casos.</p>
          <Button variant="primary" onClick={onExport} disabled={!canExport}>
            <Download size={18} />
            Descargar
          </Button>
        </div>
      ) : null}

      <div className="elevator-filters glass glass-lite squircle flex flex-wrap items-end gap-x-5 gap-y-4 px-4 py-3.5">
        <EstadoDoneFilter value={estado} onChange={onEstadoChange} />
        <TeamFilter teams={teams} value={teamFilter} onChange={onTeamFilterChange} />
        <OwnerScopeFilter value={ownerScope} onChange={onOwnerScopeChange} label="Dueño" />
        <CitaLinkFilterControl value={citaLink} onChange={onCitaLinkChange} />
        <label className="filter-field queue-filter-search flex max-w-full flex-col justify-end gap-1.5">
          <span className="filter-field-label block min-h-[18px] text-[13px] font-semibold leading-tight text-avi-fog-strong">Buscar</span>
          <span className="relative">
            <Search size={16} className="field-input-icon" aria-hidden />
            <input
              type="search"
              className="field-input"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Cliente, teléfono, matrícula…"
              autoComplete="off"
            />
          </span>
        </label>
        <label className="filter-field flex max-w-full flex-col justify-end gap-1.5">
          <span className="filter-field-label block min-h-[18px] text-[13px] font-semibold leading-tight text-avi-fog-strong">Canal</span>
          <select className="field-select" value={channel} onChange={(e) => onChannelChange(e.target.value)}>
            {CHANNEL_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
        </label>
        {view === 'calendario' ? (
          <div className="filter-field flex max-w-full flex-col justify-end gap-1.5">
            <span className="filter-field-label block min-h-[18px] text-[13px] font-semibold leading-tight text-avi-fog-strong">Ver agenda</span>
            <div className="estado-filter inline-flex flex-wrap items-center gap-1.5" role="group" aria-label="Vista del calendario">
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
          <div className="filter-field flex max-w-full flex-col justify-end gap-1.5">
            <span className="filter-field-label block min-h-[18px] text-[13px] font-semibold leading-tight text-avi-fog-strong">Fechas · {dateRange.label}</span>
            <div className="estado-filter inline-flex flex-wrap items-center gap-1.5" role="group" aria-label="Rango de fechas">
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
        <div className="period-custom glass glass-lite squircle grid grid-cols-2 gap-3 px-4 py-3.5">
          <label className="filter-field flex flex-col justify-end gap-1.5">
            <span className="filter-field-label block min-h-[18px] text-[13px] font-semibold leading-tight text-avi-fog-strong">Desde</span>
            <input
              type="date"
              value={customFrom}
              onChange={(e) => onCustomFromChange(e.target.value)}
              className="field-input"
            />
          </label>
          <label className="filter-field flex flex-col justify-end gap-1.5">
            <span className="filter-field-label block min-h-[18px] text-[13px] font-semibold leading-tight text-avi-fog-strong">Hasta</span>
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
          <strong
            key={`${loading}-${stats.porHacer}`}
            className="metric-value-refresh"
            style={{ color: stats.porHacer > 0 ? 'var(--color-warning)' : 'var(--color-success)' }}
          >
            {loading ? '—' : stats.porHacer}
          </strong>
          <small>{loading ? '…' : stats.porHacer === 0 ? 'Todo al día' : 'Por terminar'}</small>
        </div>
        <div className="bento-cell glass glass-lite metric">
          <span>Hechas</span>
          <strong
            key={`${loading}-${stats.hechas}`}
            className="metric-value-refresh"
            style={{ color: 'var(--color-success)' }}
          >
            {loading ? '—' : stats.hechas}
          </strong>
          <small>{loading ? '…' : 'Bien cerradas'}</small>
        </div>
        <div className="bento-cell glass glass-lite metric">
          <span>Total</span>
          <strong key={`${loading}-${stats.total}`} className="metric-value-refresh">
            {loading ? '—' : stats.total}
          </strong>
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
