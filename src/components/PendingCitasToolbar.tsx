import { useState } from 'react'
import { CalendarDays, ChevronDown, ChevronUp, Download, Search, SlidersHorizontal, X } from 'lucide-react'
import { CALENDAR_SCALE_OPTIONS, type CalendarScale } from '../lib/calendarScale'
import { type DateRangePreset, type ResolvedDateRange } from '../lib/dateRangePresets'
import { CHANNEL_OPTIONS } from '../lib/tallerStations'
import type { PeticionesStats, TipoPeticionRow } from '../lib/peticionesPendientes'
import type { CitaLinkFilter } from '../lib/citaLinkFilter'
import type { AdvisorTeam } from '../lib/advisorWorkspace'
import type { OwnerScope } from '../lib/ownerScope'
import { TEAM_FILTER_ALL, type TeamFilterId } from '../lib/teamScope'
import type { EstadoFilter } from '../lib/doneFilter'
import Button from './ui/Button'
import CitaLinkFilterControl from './CitaLinkFilter'
import EstadoDoneFilter from './EstadoDoneFilter'
import FilterSelect from './FilterSelect'
import OwnerScopeFilter from './OwnerScopeFilter'
import SegmentedControl from './SegmentedControl'
import TeamFilter from './TeamFilter'

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
  tipos: TipoPeticionRow[]
  tipoFilter: number | ''
  onTipoFilterChange: (value: number | '') => void
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

function titleCaseEs(value: string) {
  return value ? value.charAt(0).toLocaleUpperCase('es-ES') + value.slice(1) : value
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
  tipos,
  tipoFilter,
  onTipoFilterChange,
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
  const [showMoreFilters, setShowMoreFilters] = useState(false)
  const pctDone = !loading && stats.total > 0 ? Math.round(stats.pctHechas) : null
  const tipoOptions = [
    { id: '', label: 'Todas' },
    ...tipos.map((tipo) => ({ id: String(tipo.idtipopeticion), label: tipo.tipopeticion })),
  ]
  const extraFilterCount = [
    teamFilter !== TEAM_FILTER_ALL,
    ownerScope !== 'todas',
    citaLink !== 'todas',
    tipoFilter !== '',
    channel !== 'voz-wa',
  ].filter(Boolean).length

  const resetExtraFilters = () => {
    onTeamFilterChange(TEAM_FILTER_ALL)
    onOwnerScopeChange('todas')
    onCitaLinkChange('todas')
    onTipoFilterChange('')
    onChannelChange('voz-wa')
  }

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

      <div className="glass glass-lite squircle flex flex-col gap-3 p-3">
        <div className="flex flex-wrap items-center gap-3">
          <label className="queue-filter-search relative min-w-[16rem] flex-[1_1_24rem]">
            <Search size={16} className="field-input-icon" aria-hidden />
            <input
              type="search"
              className="field-input min-h-[52px] w-full max-w-none pr-12 text-base"
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Busca un nombre, teléfono o matrícula"
              autoComplete="off"
              aria-label="Buscar cliente"
            />
            {search ? (
              <button
                type="button"
                className="absolute right-1.5 top-1/2 inline-flex min-h-tap min-w-tap -translate-y-1/2 items-center justify-center rounded-pill text-avi-muted hover:bg-avi-surface"
                onClick={() => onSearchChange('')}
                aria-label="Borrar búsqueda"
              >
                <X size={18} />
              </button>
            ) : null}
          </label>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-avi-fog-strong">Mostrar</span>
            <EstadoDoneFilter value={estado} onChange={onEstadoChange} />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-avi-line pt-3">
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-avi-fog-strong">
            <CalendarDays size={17} className="text-avi-brand" aria-hidden />
            Periodo
          </span>
          {view === 'calendario' ? (
            <SegmentedControl
              value={calendarScale}
              options={CALENDAR_SCALE_OPTIONS}
              onChange={onCalendarScaleChange}
              ariaLabel="Vista del calendario"
              className="max-[480px]:grid max-[480px]:w-full max-[480px]:grid-cols-2 max-[480px]:rounded-md"
            />
          ) : (
            <SegmentedControl
              value={preset}
              options={PERIOD_CHIPS}
              onChange={onPresetChange}
              ariaLabel="Rango de fechas"
              className="max-[480px]:grid max-[480px]:w-full max-[480px]:grid-cols-3 max-[480px]:rounded-md"
            />
          )}
          <div className="flex min-w-0 items-center gap-1">
            <p className="m-0 min-w-0 truncate px-1 text-sm font-semibold text-avi-fog-strong">
              {titleCaseEs(dateRange.label)}
            </p>
            <button type="button" className="ghost-button min-h-tap px-3" onClick={onGoToday}>
              Hoy
            </button>
          </div>
          <button
            type="button"
            className={`inline-flex min-h-tap items-center gap-2 rounded-pill border px-3.5 text-sm font-semibold ${
              slaOnly
                ? 'border-[rgba(180,35,24,0.45)] bg-[rgba(180,35,24,0.12)] text-avi-danger'
                : 'border-avi-line bg-avi-surface-solid text-avi-fog-strong'
            }`}
            aria-pressed={slaOnly}
            onClick={() => onSlaOnlyChange(!slaOnly)}
          >
            Solo urgentes
          </button>
          <button
            type="button"
            className={`ghost-button ml-auto min-h-tap gap-2 px-3.5 ${showMoreFilters ? 'border-avi-brand text-avi-brand' : ''}`}
            aria-expanded={showMoreFilters}
            onClick={() => setShowMoreFilters((current) => !current)}
          >
            <SlidersHorizontal size={17} aria-hidden />
            Más filtros
            {extraFilterCount > 0 ? (
              <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-pill bg-avi-brand px-1.5 text-xs font-bold text-white">
                {extraFilterCount}
              </span>
            ) : null}
            {showMoreFilters ? <ChevronUp size={16} aria-hidden /> : <ChevronDown size={16} aria-hidden />}
          </button>
        </div>
        {view !== 'calendario' && preset === 'personalizada' ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-avi-line pt-3">
            <label className="inline-flex min-h-tap items-center gap-2 rounded-md border border-avi-line bg-avi-surface-solid px-3 shadow-glass">
              <span className="text-sm text-avi-muted">Desde</span>
              <input
                type="date"
                value={customFrom}
                onChange={(event) => onCustomFromChange(event.target.value)}
                className="min-h-tap border-0 bg-transparent text-sm font-semibold text-avi-fog-strong outline-none"
              />
            </label>
            <label className="inline-flex min-h-tap items-center gap-2 rounded-md border border-avi-line bg-avi-surface-solid px-3 shadow-glass">
              <span className="text-sm text-avi-muted">Hasta</span>
              <input
                type="date"
                value={customTo}
                onChange={(event) => onCustomToChange(event.target.value)}
                min={customFrom || undefined}
                className="min-h-tap border-0 bg-transparent text-sm font-semibold text-avi-fog-strong outline-none"
              />
            </label>
          </div>
        ) : null}
        {showMoreFilters ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-avi-line pt-3">
            <span className="mr-1 text-sm font-semibold text-avi-fog-strong">Filtrar por</span>
            <TeamFilter teams={teams} value={teamFilter} onChange={onTeamFilterChange} />
            <OwnerScopeFilter value={ownerScope} onChange={onOwnerScopeChange} label="Dueño" />
            <CitaLinkFilterControl value={citaLink} onChange={onCitaLinkChange} />
            <FilterSelect
              label="Tipo"
              value={tipoFilter === '' ? '' : String(tipoFilter)}
              options={tipoOptions}
              onChange={(value) => onTipoFilterChange(value === '' ? '' : Number(value))}
            />
            <FilterSelect label="Canal" value={channel} options={CHANNEL_OPTIONS} onChange={onChannelChange} />
            {extraFilterCount > 0 ? (
              <button type="button" className="ghost-button min-h-tap px-3" onClick={resetExtraFilters}>
                Restablecer
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

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
