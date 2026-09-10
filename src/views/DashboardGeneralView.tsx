import PaginatedItems from '../components/PaginatedItems'
import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowRight, CalendarCheck2, ClipboardList, Percent, Radio, Wrench } from 'lucide-react'
import ApiStatusBanner from '../components/ApiStatusBanner'
import {
  formatLauraPct,
  LauraChartCardHeader,
  LauraPareto,
  LauraRadar,
  LauraUprightPie,
  mixToPieSlices,
  mixToRadarAxes,
} from '../components/LauraCharts'
import OwnerScopeFilter from '../components/OwnerScopeFilter'
import TicketClientBlock from '../components/TicketClientBlock'
import TicketOwnerPicker from '../components/TicketOwnerPicker'
import { HexLoaderScreen } from '../components/ui/HexLoader'
import Card from '../components/ui/Card'
import VehiclePlate from '../components/ui/VehiclePlate'
import { useAdvisorWorkspace } from '../hooks/useAdvisorWorkspace'
import { useOperationalData } from '../hooks/useOperationalData'
import {
  CALENDAR_SCALE_OPTIONS,
  calendarPeriod,
  type CalendarScale,
} from '../lib/calendarScale'
import type { CrmAppRole } from '../lib/crmRoles'
import {
  advisorWorkload,
  channelMix,
  closedInRangeCount,
  filterReceivedInRange,
  mixChartTitle,
  typeMix,
  volumeChartTitle,
  volumeForScale,
} from '../lib/dashboardAnalytics'
import { resolveDateRange } from '../lib/dateRangePresets'
import {
  isTaskDueOnOrBefore,
  localTodayIso,
  type AdvisorWorkspace,
} from '../lib/advisorWorkspace'
import {
  compareTasksByOpenFirst,
  compareTicketsByOpenFirst,
} from '../lib/doneFilter'
import { buildOwnerScopeContext, matchesOwnerScope, matchesTaskOwnerScope, ownerScopeEmptyCopy, type OwnerScope } from '../lib/ownerScope'
import { isDemoTicketId } from '../lib/demoTickets'
import { computePeticionesStats, formatFecha, type PeticionPendiente } from '../lib/peticionesPendientes'
import { isSlaCritico } from '../lib/tallerStations'
import type { Workshop } from '../types'

type Props = {
  workshop: Workshop
  currentUser: { name: string; email: string }
  appRole: CrmAppRole
  onOpenTriage: () => void
  onOpenCalendar: () => void
  onOpenTodayTasks?: () => void
  onOpenLead?: (peticion: PeticionPendiente) => void
  refreshToken?: number
}

export default function DashboardGeneralView({
  workshop,
  currentUser,
  appRole,
  onOpenTriage,
  onOpenCalendar,
  onOpenTodayTasks,
  onOpenLead,
  refreshToken = 0,
}: Props) {
  const workshopId = workshop.containerIdTaller || workshop.id
  const { workspace } = useAdvisorWorkspace(workshopId, currentUser, true)
  const [scale, setScale] = useState<CalendarScale>('dia')
  const [ownerScope, setOwnerScope] = useState<OwnerScope>(appRole === 'asesor' ? 'grupo' : 'todas')
  const today = localTodayIso()
  const anchor = useMemo(() => new Date(`${today}T12:00:00`), [today])
  const period = useMemo(() => calendarPeriod(scale, anchor), [scale, anchor])
  const lifetimeRange = useMemo(() => resolveDateRange('todas', '', ''), [])
  const { items, loading, error, sourceNotice, refresh, refreshSilent } = useOperationalData(workshop, lifetimeRange)
  const ownerCtx = useMemo(
    () => buildOwnerScopeContext(workspace, currentUser.email),
    [workspace, currentUser.email],
  )

  useEffect(() => {
    setOwnerScope(appRole === 'asesor' ? 'grupo' : 'todas')
  }, [appRole])

  useEffect(() => {
    if (refreshToken > 0) void refresh()
  }, [refreshToken, refresh])

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refreshSilent()
    }, 20_000)
    return () => window.clearInterval(timer)
  }, [refreshSilent])

  const periodItems = useMemo(
    () => filterReceivedInRange(items, period.from, period.to),
    [items, period.from, period.to],
  )
  const stats = useMemo(() => computePeticionesStats(periodItems), [periodItems])
  const closedNow = useMemo(
    () => closedInRangeCount(items, period.from, period.to),
    [items, period.from, period.to],
  )
  const slaCount = useMemo(
    () =>
      periodItems.reduce((n, item) => {
        if (item.gestionado) return n
        if (isSlaCritico(item.fechainicio) || isSlaCritico(item.cita?.fecha)) return n + 1
        return n
      }, 0),
    [periodItems],
  )
  const citasCount = useMemo(
    () => periodItems.reduce((n, item) => n + (item.cita?.fecha ? 1 : 0), 0),
    [periodItems],
  )

  const volume = useMemo(() => volumeForScale(items, scale, anchor), [items, scale, anchor])
  const mixRows = useMemo(
    () => (scale === 'dia' ? channelMix(periodItems) : typeMix(periodItems)),
    [scale, periodItems],
  )
  const teamRows = useMemo(
    () => (appRole === 'admin' ? advisorWorkload(periodItems, workspace.people) : []),
    [appRole, periodItems, workspace.people],
  )
  const pieSlices = useMemo(() => mixToPieSlices(mixRows), [mixRows])
  const radarAxes = useMemo(() => mixToRadarAxes(mixRows), [mixRows])
  const volumeRows = useMemo(
    () => volume.map((point) => ({ key: point.key, label: point.label, value: point.recibidas })),
    [volume],
  )
  const teamParetoRows = useMemo(
    () =>
      teamRows
        .filter((row) => row.recibidas > 0)
        .map((row) => ({ key: row.key, label: row.label, value: row.recibidas })),
    [teamRows],
  )

  const todayTasksAll = useMemo(
    () =>
      workspace.tasks
        .filter((task) => {
          if (!matchesTaskOwnerScope(task, ownerScope, workspace, ownerCtx)) return false
          if (task.status === 'hecho') return task.dueDate === today
          return isTaskDueOnOrBefore(task, today)
        })
        .sort((a, b) => compareTasksByOpenFirst(a, b, today)),
    [workspace, ownerScope, ownerCtx, today],
  )
  const pendingTasks = todayTasksAll.filter((task) => task.status === 'pendiente')
  const overdueTasks = pendingTasks.filter((task) => task.dueDate < today)
  const historyTicketsAll = useMemo(
    () =>
      items
        .filter((item) => matchesOwnerScope(item.gestionemail, ownerScope, ownerCtx))
        .sort(compareTicketsByOpenFirst),
    [items, ownerScope, ownerCtx],
  )
  const historyPendingTickets = useMemo(
    () => historyTicketsAll.filter((item) => !item.gestionado),
    [historyTicketsAll],
  )
  const historyDoneTickets = useMemo(
    () => historyTicketsAll.filter((item) => item.gestionado),
    [historyTicketsAll],
  )
  const lifetimeStats = useMemo(() => computePeticionesStats(historyTicketsAll), [historyTicketsAll])
  const ticketRow = {
    workshop,
    workspace,
    currentUser,
    appRole,
    onOpenLead,
  }

  const scaleLabel = CALENDAR_SCALE_OPTIONS.find((option) => option.id === scale)?.label ?? 'Periodo'
  const showRadar = scale !== 'dia' && radarAxes.length >= 3

  return (
    <div className="dashboard-page operational-dashboard dash-ops">
      {error ? <ApiStatusBanner message={error} variant="error" /> : null}
      {sourceNotice && !error ? <ApiStatusBanner message={sourceNotice} variant="warning" /> : null}

      <div className="elevator-filters glass glass-lite">
        <div className="filter-field">
          <span className="filter-field-label">Periodo</span>
          <div className="estado-filter" role="group" aria-label="Periodo del dashboard">
            {CALENDAR_SCALE_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                className={`preset-chip ${scale === option.id ? 'is-active' : ''}`}
                onClick={() => setScale(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <OwnerScopeFilter value={ownerScope} onChange={setOwnerScope} label="Tickets y tareas" />
        <p className="dash-period-label">{period.label}</p>
      </div>

      {!loading && slaCount > 0 ? (
        <aside className="ops-sla-alert glass glass-lite" role="alert" aria-live="polite">
          <div className="ops-sla-alert-icon" aria-hidden>
            <AlertTriangle size={22} />
          </div>
          <div className="ops-sla-alert-copy">
            <strong>
              {slaCount} consulta(s) de este periodo con SLA de contacto de menos de 15 min
            </strong>
            <p>Hay que validarlas en persona o con peritaje. No las dejes en la cola.</p>
          </div>
          <button type="button" className="client-submit ops-sla-alert-action" onClick={onOpenTriage}>
            Ir al triage
            <ArrowRight size={16} />
          </button>
        </aside>
      ) : null}

      <section className="dash-kpi-grid" aria-label="Indicadores del periodo">
        <MetricCard
          icon={CalendarCheck2}
          label="Tareas de hoy"
          value={pendingTasks.length}
          helper={
            overdueTasks.length > 0
              ? `${overdueTasks.length} atrasada(s)`
              : `${todayTasksAll.length - pendingTasks.length} ya hechas`
          }
          tone={overdueTasks.length > 0 ? 'warning' : 'brand'}
          onClick={onOpenTodayTasks ?? onOpenTriage}
        />
        <MetricCard
          icon={ClipboardList}
          label="Consultas"
          value={loading ? '—' : stats.total}
          helper={`${citasCount} con cita · ${period.label}`}
          tone="brand"
          onClick={onOpenCalendar}
        />
        <MetricCard
          icon={Wrench}
          label="Por hacer"
          value={loading ? '—' : stats.porHacer}
          helper={`${closedNow} cierres en el periodo`}
          tone="warning"
          onClick={onOpenTriage}
        />
        <MetricCard
          icon={Percent}
          label="Hechas"
          value={loading ? '—' : `${Math.round(stats.pctHechas)}%`}
          helper={`${stats.hechas} de ${stats.total || 0} entradas`}
          tone="positive"
          onClick={onOpenTriage}
        />
      </section>

      <Card className="dash-today dash-history" padding="none">
        <div className="ops-card-header">
          <div>
            <p className="section-eyebrow">Bandeja</p>
            <h2 className="ops-card-title">Para hacer hoy</h2>
            <p className="section-subtitle">
              {appRole === 'asesor'
                ? 'Bandeja operativa: a la izquierda, tickets pendientes de gestión —asignados a usted, al equipo o sin responsable—. A la derecha se consolidan los tickets ya resueltos.'
                : 'Bandeja operativa del taller: a la izquierda, tickets pendientes de atención. A la derecha, tickets ya resueltos. El inventario se actualiza de forma automática al cambiar el estado.'}
            </p>
          </div>
          <div className="dash-history-live" aria-live="polite">
            <span className="badge tone-neutral dash-live-badge">
              <Radio size={14} aria-hidden />
              En vivo
            </span>
            <span className={`badge ${lifetimeStats.porHacer > 0 ? 'tone-warning' : 'tone-positive'}`}>
              {loading ? '—' : lifetimeStats.porHacer} no hechos
            </span>
            <span className="badge tone-positive">{loading ? '—' : lifetimeStats.hechas} hechos</span>
          </div>
        </div>
        <div className="dash-today-grid dash-ticket-cols dash-history-split">
          <DashTicketColumn
            title="Por hacer"
            empty={
              items.length === 0
                ? 'Aún no hay tickets para hacer.'
                : historyTicketsAll.length === 0
                  ? ownerScopeEmptyCopy(ownerScope)
                  : 'No hay tickets por hacer.'
            }
            items={historyPendingTickets}
            loading={loading}
            listClassName="dash-history-list"
            resetKey={`${workshopId}-hist-pend-${ownerScope}`}
            {...ticketRow}
          />
          <DashTicketColumn
            title="Hechos"
            empty={
              historyTicketsAll.length === 0
                ? ownerScopeEmptyCopy(ownerScope)
                : 'No hay tickets hechos.'
            }
            items={historyDoneTickets}
            loading={loading}
            done
            listClassName="dash-history-list"
            resetKey={`${workshopId}-hist-hechos-${ownerScope}`}
            {...ticketRow}
          />
        </div>
      </Card>

      <Card className="laura-panel" padding="md">
        {loading ? (
          <HexLoaderScreen size="md" label="Cargando el historial…" />
        ) : (
          <LauraPareto
            eyebrow={period.label}
            title={`Pareto · ${volumeChartTitle(scale)}`}
            legend={[scaleLabel]}
            rows={volumeRows}
            dense={scale === 'mes' || volumeRows.length > 12}
            barLabel="Entradas"
            lineLabel="Acumulado"
          />
        )}
      </Card>

      <section className="laura-split" aria-label="Desglose del periodo">
        <Card className="laura-panel" padding="md">
          <LauraChartCardHeader
            eyebrow={mixChartTitle(scale)}
            title={showRadar ? 'Radar 3D · Motivo de consulta' : 'Pastel vertical · Cómo llegan'}
          />
          {loading ? (
            <HexLoaderScreen size="md" label="Cargando el desglose…" />
          ) : showRadar ? (
            <LauraRadar caption={`Tipo de consulta · ${period.label}.`} axes={radarAxes} scaleMax={100} />
          ) : (
            <LauraUprightPie
              caption={`${mixChartTitle(scale)} · ${period.label}.`}
              slices={pieSlices}
              centerLabel={scale === 'dia' ? 'Canal' : 'Tipo'}
            />
          )}
        </Card>
        <Card className="laura-panel" padding="md">
          <LauraChartCardHeader
            eyebrow="Resolución"
            title="Pastel vertical · Hechas frente a por hacer"
          />
          {loading ? (
            <HexLoaderScreen size="md" label="Cargando la resolución…" />
          ) : (
            <LauraUprightPie
              caption={`Estado de las entradas · ${period.label}.`}
              centerLabel="Hechas"
              centerValue={`${Math.round(stats.pctHechas)}%`}
              slices={
                    stats.total === 0
                  ? []
                  : [
                      { label: 'Hechas', value: formatLauraPct(stats.pctHechas), pct: stats.pctHechas, color: '#0a55b8' },
                      {
                        label: 'Por hacer',
                        value: formatLauraPct(Math.max(0, 100 - stats.pctHechas)),
                        pct: Math.max(0, 100 - stats.pctHechas),
                        color: '#f59e0b',
                      },
                    ]
              }
            />
          )}
        </Card>
      </section>

      {appRole === 'admin' ? (
        <Card className="laura-panel" padding="md">
          {loading ? (
            <HexLoaderScreen size="md" label="Cargando el trabajo del equipo…" />
          ) : (
            <LauraPareto
              eyebrow="Equipo"
              title="Pareto · Trabajo por asesor"
              legend={[scaleLabel]}
              rows={teamParetoRows}
              sortByValue
              barLabel="Consultas"
              lineLabel="Acumulado"
              empty="Añade asesores en Equipos o espera a que gestionen consultas."
            />
          )}
        </Card>
      ) : null}
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

type DashTicketRowProps = {
  item: PeticionPendiente
  workshop: Workshop
  workspace: AdvisorWorkspace
  currentUser: { name: string; email: string }
  appRole: CrmAppRole
  onOpenLead?: (peticion: PeticionPendiente) => void
}

type DashTicketColumnProps = Omit<DashTicketRowProps, 'item'> & {
  title: string
  empty: string
  items: PeticionPendiente[]
  loading: boolean
  resetKey: string
  done?: boolean
  listClassName?: string
}

function DashTicketColumn({
  title,
  empty,
  items,
  loading,
  resetKey,
  done = false,
  listClassName,
  ...rowProps
}: DashTicketColumnProps) {
  return (
    <section className={`dash-today-col ${done ? 'is-quiet' : 'is-priority'}`} aria-label={title}>
      <div className="dash-today-col-head">
        <h3 className="ops-card-title">{title}</h3>
        <span className={`badge ${done ? 'tone-positive' : items.length > 0 ? 'tone-warning' : 'tone-positive'}`}>
          {items.length}
        </span>
      </div>
      <div className="dash-today-col-body">
        {loading ? (
          <HexLoaderScreen size="md" label="Cargando tickets…" />
        ) : items.length === 0 ? (
          <p className="section-subtitle ops-empty">{empty}</p>
        ) : (
          <PaginatedItems items={items} label={title} resetKey={resetKey}>
            {(visible) => (
              <ul className={`ops-feed-list dash-today-tickets${listClassName ? ` ${listClassName}` : ''}`}>
                {visible.map((item) => (
                  <DashTicketRow key={item.idpeticion} item={item} {...rowProps} />
                ))}
              </ul>
            )}
          </PaginatedItems>
        )}
      </div>
    </section>
  )
}

function MetricCard({ icon: Icon, label, value, helper, tone, onClick }: MetricProps) {
  return (
    <button type="button" className={`ops-kpi glass glass-lite tone-${tone}`} onClick={onClick}>
      <span className="ops-kpi-icon">
        <Icon size={17} />
      </span>
      <span className="ops-kpi-label">{label}</span>
      <strong>{value}</strong>
      <span className="ops-kpi-helper">{helper}</span>
      <ArrowRight size={15} className="ops-kpi-arrow" />
    </button>
  )
}

function DashTicketRow({ item, workshop, workspace, currentUser, appRole, onOpenLead }: DashTicketRowProps) {
  const sla = !item.gestionado && (isSlaCritico(item.fechainicio) || isSlaCritico(item.cita?.fecha))
  const cita = item.cita
  return (
    <li
      className={`ops-feed-row dash-ticket-row${item.gestionado ? ' is-done' : ''}`}
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
          <span>
            {item.tipopeticion || 'Sin tipo'}
            {isDemoTicketId(item.idpeticion) ? <span className="badge tone-info">Prueba</span> : null}
          </span>
        </div>
      </div>
      <div className="dash-ticket-meta">
        <TicketOwnerPicker
          workshop={workshop}
          workspace={workspace}
          currentUser={currentUser}
          appRole={appRole}
          peticion={item}
          compact
        />
        <span className={`badge ${item.gestionado ? 'tone-positive' : sla ? 'tone-negative' : 'tone-warning'}`}>
          {item.gestionado ? 'Hecho' : sla ? 'SLA' : 'No hecho'}
        </span>
        <time>{formatFecha(item.fechainicio)}</time>
      </div>
    </li>
  )
}
