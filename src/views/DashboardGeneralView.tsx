import { useEffect } from 'react'
import { AlertTriangle, ArrowRight, CalendarCheck2, ClipboardList, RefreshCw, Wrench } from 'lucide-react'
import ApiStatusBanner from '../components/ApiStatusBanner'
import { HexLoaderScreen } from '../components/ui/HexLoader'
import Card from '../components/ui/Card'
import VehiclePlate from '../components/ui/VehiclePlate'
import { resolveDateRange } from '../lib/dateRangePresets'
import { computePeticionesStats, formatFecha, type PeticionPendiente } from '../lib/peticionesPendientes'
import { isSlaCritico } from '../lib/tallerStations'
import { useOperationalData } from '../hooks/useOperationalData'
import type { Workshop } from '../types'

type Props = {
  workshop: Workshop
  onOpenTriage: () => void
  onOpenCalendar: () => void
  onOpenLead?: (peticion: PeticionPendiente) => void
  refreshToken?: number
}

export default function DashboardGeneralView({
  workshop,
  onOpenTriage,
  onOpenCalendar,
  onOpenLead,
  refreshToken = 0,
}: Props) {
  const range = resolveDateRange('mes', '', '')
  const { items, loading, error, sourceNotice, refresh } = useOperationalData(workshop, range)

  useEffect(() => {
    if (refreshToken > 0) void refresh()
  }, [refreshToken, refresh])

  const stats = computePeticionesStats(items)
  const citas = items.filter((item) => Boolean(item.cita?.fecha))
  const slaCriticos = items.filter(
    (item) =>
      !item.gestionado && (isSlaCritico(item.fechainicio) || isSlaCritico(item.cita?.fecha)),
  )
  const slaCount = slaCriticos.length

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

      {!loading && slaCount > 0 ? (
        <aside className="ops-sla-alert glass glass-lite" role="alert" aria-live="polite">
          <div className="ops-sla-alert-icon" aria-hidden>
            <AlertTriangle size={22} />
          </div>
          <div className="ops-sla-alert-copy">
            <strong>
              Atención: {slaCount} consulta(s) pendiente(s) con SLA de contacto &lt;15 min
            </strong>
            <p>
              La centralita de voz de Laura ha derivado estos casos que requieren validación presencial o
              pericial inmediata.
            </p>
          </div>
          <button type="button" className="client-submit ops-sla-alert-action" onClick={onOpenTriage}>
            Ir al triage
            <ArrowRight size={16} />
          </button>
        </aside>
      ) : null}

      <section className="ops-kpi-grid" aria-label="Indicadores operativos">
        <MetricCard
          icon={ClipboardList}
          label="Faltan"
          value={loading ? '—' : stats.porHacer}
          helper="Llamadas o tareas por terminar"
          tone="warning"
          onClick={onOpenTriage}
        />
        <MetricCard
          icon={Wrench}
          label="Hechas"
          value={loading ? '—' : stats.hechas}
          helper="Bien cerradas"
          tone="positive"
          onClick={onOpenTriage}
        />
        <MetricCard
          icon={CalendarCheck2}
          label="Total del mes"
          value={loading ? '—' : stats.total}
          helper={`${citas.length} con cita en calendario`}
          tone="brand"
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
              <HexLoaderScreen size="md" label="Cargando actividad…" />
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
                    <li
                      key={item.idpeticion}
                      className="ops-feed-row"
                      role={onOpenLead ? 'button' : undefined}
                      tabIndex={onOpenLead ? 0 : undefined}
                      onClick={() => onOpenLead?.(item)}
                      onKeyDown={(e) => {
                        if (!onOpenLead) return
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          onOpenLead(item)
                        }
                      }}
                    >
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
                      <span className={`badge ${item.gestionado ? 'tone-positive' : 'tone-warning'}`}>
                        {item.gestionado ? 'Hecha' : 'Falta'}
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
            <strong>{loading ? '—' : `${Math.round(stats.pctHechas)}%`}</strong>
            <span>hechas y terminadas</span>
          </div>
          <div className="progress-bar" role="progressbar" aria-valuenow={Math.round(stats.pctHechas)} aria-valuemin={0} aria-valuemax={100}>
            <div className="progress-bar-fill" style={{ width: `${stats.pctHechas}%` }} />
          </div>
          <dl className="ops-summary-list">
            <div><dt>Total recibido</dt><dd>{stats.total}</dd></div>
            <div><dt>Faltan</dt><dd>{stats.porHacer}</dd></div>
            <div><dt>Hechas</dt><dd>{stats.hechas}</dd></div>
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
    <button type="button" className={`ops-kpi glass glass-lite tone-${tone}`} onClick={onClick}>
      <span className="ops-kpi-icon"><Icon size={17} /></span>
      <span className="ops-kpi-label">{label}</span>
      <strong>{value}</strong>
      <span className="ops-kpi-helper">{helper}</span>
      <ArrowRight size={15} className="ops-kpi-arrow" />
    </button>
  )
}
