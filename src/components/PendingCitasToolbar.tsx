import { Download, RefreshCw } from 'lucide-react'
import {
  DATE_PRESET_OPTIONS,
  type DateRangePreset,
  type ResolvedDateRange,
} from '../lib/dateRangePresets'
import type { PeticionesStats } from '../lib/peticionesPendientes'
import Button from './ui/Button'

type Props = {
  view: 'kanban' | 'tabla' | 'calendario'
  preset: DateRangePreset
  customFrom: string
  customTo: string
  dateRange: ResolvedDateRange
  stats: PeticionesStats
  loading: boolean
  canExport: boolean
  onPresetChange: (preset: DateRangePreset) => void
  onCustomFromChange: (v: string) => void
  onCustomToChange: (v: string) => void
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
  onPresetChange,
  onCustomFromChange,
  onCustomToChange,
  onRefresh,
  onExport,
}: Props) {
  const pctDone =
    !loading && stats.total > 0 ? Math.round((stats.conCita / stats.total) * 100) : null

  const title =
    view === 'calendario'
      ? 'Calendario taller'
      : view === 'tabla'
        ? 'Vista tabla'
        : 'Triage operativo'

  const subtitle =
    view === 'calendario'
      ? 'Agenda de elevadores, boxes y carga horaria del taller.'
      : view === 'tabla'
        ? 'Todas las consultas del periodo seleccionado.'
        : 'Consultas del chatbot que aún no tienen cita en calendario.'

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

      {view === 'calendario' ? null : (
        <div className="bento-grid" aria-label="Resumen del periodo">
          <div className="bento-cell bento-cell-hero glass metric">
            <span>Por gestionar</span>
            <strong style={{ color: stats.pendientes > 0 ? 'var(--color-warning)' : 'var(--color-success)' }}>
              {loading ? '—' : stats.pendientes}
            </strong>
            <small>{loading ? '…' : stats.pendientes === 0 ? 'Cola vacía' : 'Pendientes'}</small>
          </div>
          <div className="bento-cell glass metric">
            <span>Con cita</span>
            <strong style={{ color: 'var(--color-success)' }}>{loading ? '—' : stats.conCita}</strong>
          </div>
          <div className="bento-cell glass metric">
            <span>Total</span>
            <strong>{loading ? '—' : stats.total}</strong>
          </div>
          <div className="bento-cell bento-cell-wide glass card-pad-sm">
            <p className="field-label mb-2">Periodo · {dateRange.label}</p>
            <div className="flex flex-wrap gap-2">
              {DATE_PRESET_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onPresetChange(opt.id)}
                  className={`preset-chip ${preset === opt.id ? 'is-active' : ''}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {preset === 'personalizada' ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="field-label">Desde</span>
                  <input
                    type="date"
                    value={customFrom}
                    onChange={(e) => onCustomFromChange(e.target.value)}
                    className="field-input"
                  />
                </label>
                <label className="block">
                  <span className="field-label">Hasta</span>
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
            {pctDone != null ? (
              <div
                className="progress-bar mt-3"
                role="progressbar"
                aria-valuenow={pctDone}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div className="progress-bar-fill" style={{ width: `${pctDone}%` }} />
                <span className="progress-bar-label">{pctDone}% con cita</span>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </header>
  )
}
