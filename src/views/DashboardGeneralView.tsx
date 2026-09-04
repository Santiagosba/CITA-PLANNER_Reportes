import { ArrowRight, CalendarCheck2, ClipboardList, RefreshCw, Wrench } from 'lucide-react'
import ApiStatusBanner from '../components/ApiStatusBanner'
import Card from '../components/ui/Card'
import VehiclePlate from '../components/ui/VehiclePlate'
import { resolveDateRange } from '../lib/dateRangePresets'
import { computePeticionesStats, formatFecha, isPeticionPendiente } from '../lib/peticionesPendientes'
import { useOperationalData } from '../hooks/useOperationalData'
import type { Workshop } from '../types'

type Props = {
  workshop: Workshop
  onOpenTriage: () => void
  onOpenCalendar: () => void
}

export default function DashboardGeneralView({ workshop, onOpenTriage, onOpenCalendar }: Props) {
  const range = resolveDateRange('mes', '', '')
  const { items, loading, error, sourceNotice, refresh } = useOperationalData(workshop, range)
  const stats = computePeticionesStats(items)
  const porGestionar = items.filter((item) => isPeticionPendiente(item) && !item.gestionado)
  const enGestion = items.filter((item) => isPeticionPendiente(item) && item.gestionado)
  const citas = items.filter((item) => Boolean(item.cita?.fecha))

  return (
    <div className="dashboard-page operational-dashboard">
      <header className="dashboard-header-top">
        <div>
          <p className="section-eyebrow">Control operativo</p>
          <h1 className="section-title">Dashboard general</h1>
          <p className="section-subtitle mt-1">
            Resumen de actividad de {workshop.name} durante {range.label.toLowerCase()}.
          </p>
        </div>
        <button type="button" className="ghost-button" onClick={() => void refresh()} disabled={loading}>
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          Actualizar
        </button>
      </header>

      {error ? <ApiStatusBanner message={error} variant="error" /> : null}
      {sourceNotice && !error ? <ApiStatusBanner message={sourceNotice} variant="warning" /> : null}

      <section className="ops-kpi-grid" aria-label="Indicadores operativos">
        <MetricCard
          icon={ClipboardList}
          label="Pendientes de triage"
          value={loading ? '—' : porGestionar.length}
          helper="Requieren gestión"
          tone="warning"
          onClick={onOpenTriage}
        />
        <MetricCard
          icon={Wrench}
          label="En gestión"
          value={loading ? '—' : enGestion.length}
          helper="Contactadas sin cita"
          tone="brand"
          onClick={onOpenTriage}
        />
        <MetricCard
          icon={CalendarCheck2}
          label="Citas sincronizadas"
          value={loading ? '—' : citas.length}
          helper={`${stats.total} consultas totales`}
          tone="positive"
          onClick={onOpenCalendar}
        />
      </section>

      <section className="ops-dashboard-grid">
        <Card className="ops-feed" padding="none">
          <div className="ops-card-header">
            <div>
              <p className="section-eyebrow">Actividad reciente</p>
              <h2 className="ops-card-title">Entradas del chatbot</h2>
            </div>
            <button type="button" className="ops-text-action" onClick={onOpenTriage}>
              Ver triage <ArrowRight size={14} />
            </button>
          </div>
          <div className="ops-feed-scroll custom-scrollbar-light">
            {loading ? (
              <p className="section-subtitle ops-empty">Cargando actividad…</p>
            ) : items.length === 0 ? (
              <p className="section-subtitle ops-empty">No hay actividad en este periodo.</p>
            ) : (
              <ul className="ops-feed-list">
                {items.map((item) => {
                  const cita = item.cita
                  const cliente = cita
                    ? [cita.nombre, cita.apellidos].filter(Boolean).join(' ')
                    : ''
                  return (
                    <li key={item.idpeticion} className="ops-feed-row">
                      <div className="ops-feed-identity">
                        {cita?.matricula ? (
                          <VehiclePlate value={cita.matricula} compact />
                        ) : cita ? (
                          <span className="ops-feed-placeholder">SIN MATRÍCULA</span>
                        ) : (
                          <span className="ops-feed-placeholder is-muted">SIN CITA</span>
                        )}
                        <div>
                          <strong>{cliente || item.caller || 'Consulta sin nombre'}</strong>
                          <span>{item.tipopeticion || 'Sin tipo'} · {item.caller || 'Sin teléfono'}</span>
                        </div>
                      </div>
                      <span className={`badge ${isPeticionPendiente(item) ? 'tone-warning' : 'tone-positive'}`}>
                        {isPeticionPendiente(item) ? 'Pendiente' : 'Con cita'}
                      </span>
                      <time>{formatFecha(item.fechainicio)}</time>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </Card>

        <Card className="ops-summary" padding="md">
          <p className="section-eyebrow">Rendimiento</p>
          <h2 className="ops-card-title">Resolución del periodo</h2>
          <div className="ops-resolution">
            <strong>{loading ? '—' : `${stats.pctConCita}%`}</strong>
            <span>con cita vinculada</span>
          </div>
          <div className="progress-bar" role="progressbar" aria-valuenow={stats.pctConCita} aria-valuemin={0} aria-valuemax={100}>
            <div className="progress-bar-fill" style={{ width: `${stats.pctConCita}%` }} />
          </div>
          <dl className="ops-summary-list">
            <div><dt>Total recibido</dt><dd>{stats.total}</dd></div>
            <div><dt>Sin cita</dt><dd>{stats.pendientes}</dd></div>
            <div><dt>Con cita</dt><dd>{stats.conCita}</dd></div>
          </dl>
          <button type="button" className="client-submit" onClick={onOpenTriage}>
            Abrir cola operativa
          </button>
        </Card>
      </section>
    </div>
  )
}

type MetricProps = {
  icon: typeof ClipboardList
  label: string
  value: number | string
  helper: string
  tone: 'warning' | 'brand' | 'positive'
  onClick: () => void
}

function MetricCard({ icon: Icon, label, value, helper, tone, onClick }: MetricProps) {
  return (
    <button type="button" className={`ops-kpi glass tone-${tone}`} onClick={onClick}>
      <span className="ops-kpi-icon"><Icon size={17} /></span>
      <span className="ops-kpi-label">{label}</span>
      <strong>{value}</strong>
      <span className="ops-kpi-helper">{helper}</span>
      <ArrowRight size={15} className="ops-kpi-arrow" />
    </button>
  )
}
