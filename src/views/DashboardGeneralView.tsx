import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowRight, CalendarCheck2, ClipboardList, Wrench } from 'lucide-react'
import ApiStatusBanner from '../components/ApiStatusBanner'
import { HexLoaderScreen } from '../components/ui/HexLoader'
import Card from '../components/ui/Card'
import VehiclePlate from '../components/ui/VehiclePlate'
import { resolveDateRange } from '../lib/dateRangePresets'
import { computePeticionesStats, formatFecha, type PeticionPendiente } from '../lib/peticionesPendientes'
import { isSlaCritico } from '../lib/tallerStations'
import { useOperationalData } from '../hooks/useOperationalData'
import { useAdvisorWorkspace } from '../hooks/useAdvisorWorkspace'
import { buildOwnerScopeContext, matchesOwnerScope, ownerScopeEmptyCopy, type OwnerScope } from '../lib/ownerScope'
import OwnerScopeFilter from '../components/OwnerScopeFilter'
import TicketClientBlock from '../components/TicketClientBlock'
import type { Workshop } from '../types'

type Props = {
  workshop: Workshop
  currentUser: { name: string; email: string }
  onOpenTriage: () => void
  onOpenCalendar: () => void
  onOpenLead?: (peticion: PeticionPendiente) => void
  refreshToken?: number
}

export default function DashboardGeneralView({
  workshop,
  currentUser,
  onOpenTriage,
  onOpenCalendar,
  onOpenLead,
  refreshToken = 0,
}: Props) {
  const range = resolveDateRange('mes', '', '')
  const { items, loading, error, sourceNotice, refresh } = useOperationalData(workshop, range)
  const workshopId = workshop.containerIdTaller || workshop.id
  const { workspace } = useAdvisorWorkspace(workshopId, currentUser, true)
  const [ownerScope, setOwnerScope] = useState<OwnerScope>('todas')
  const ownerCtx = useMemo(
    () => buildOwnerScopeContext(workspace, currentUser.email),
    [workspace, currentUser.email],
  )
  const scopedItems = useMemo(
    () => items.filter((item) => matchesOwnerScope(item.gestionemail, ownerScope, ownerCtx)),
    [items, ownerScope, ownerCtx],
  )

  useEffect(() => {
    if (refreshToken > 0) void refresh()
  }, [refreshToken, refresh])

  const stats = useMemo(() => computePeticionesStats(scopedItems), [scopedItems])
  const citasCount = useMemo(
    () => scopedItems.reduce((n, item) => n + (item.cita?.fecha ? 1 : 0), 0),
    [scopedItems],
  )
  const slaCount = useMemo(
    () =>
      scopedItems.reduce((n, item) => {
        if (item.gestionado) return n
        if (isSlaCritico(item.fechainicio) || isSlaCritico(item.cita?.fecha)) return n + 1
        return n
      }, 0),
    [scopedItems],
  )

  return (
    <div className="dashboard-page operational-dashboard">
      {error ? <ApiStatusBanner message={error} variant="error" /> : null}
      {sourceNotice && !error ? <ApiStatusBanner message={sourceNotice} variant="warning" /> : null}

      <div className="elevator-filters glass glass-lite">
        <OwnerScopeFilter value={ownerScope} onChange={setOwnerScope} label="Tickets" />
      </div>

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
          helper={`${citasCount} con cita en calendario`}
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
            ) : scopedItems.length === 0 ? (
              <p className="section-subtitle ops-empty">
                {items.length > 0 ? ownerScopeEmptyCopy(ownerScope) : 'No hay actividad en este periodo.'}
              </p>
            ) : (
              <ul className="ops-feed-list">
                {scopedItems.map((item) => {
                  const cita = item.cita
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
                          <TicketClientBlock peticion={item} size="sm" />
                          <span>{item.tipopeticion || 'Sin tipo'}</span>
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
