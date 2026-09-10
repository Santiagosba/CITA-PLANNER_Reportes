import PaginatedItems from '../components/PaginatedItems'
import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowRight, CalendarCheck2, CheckCircle2, ClipboardList, Percent, Radio, Wrench } from 'lucide-react'
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
import EstadoDoneFilter from '../components/EstadoDoneFilter'
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
  receivedAt,
  typeMix,
  volumeChartTitle,
  volumeForScale,
} from '../lib/dashboardAnalytics'
import { resolveDateRange, toDateInputValue } from '../lib/dateRangePresets'
import {
  catalogName,
  isTaskDueOnOrBefore,
  localTodayIso,
  personById,
  type AdvisorWorkspace,
} from '../lib/advisorWorkspace'
import {
  compareTasksByOpenFirst,
  compareTicketsByOpenFirst,
  matchesEstadoDone,
  type EstadoFilter,
} from '../lib/doneFilter'
import { teammatesForReassign } from '../lib/ticketOps'
import { buildOwnerScopeContext, matchesOwnerScope, matchesTaskOwnerScope, ownerScopeEmptyCopy, type OwnerScope } from '../lib/ownerScope'
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
  const { workspace, setTaskStatus, setTaskAssignee } = useAdvisorWorkspace(workshopId, currentUser, true)
  const [scale, setScale] = useState<CalendarScale>('dia')
  const [ownerScope, setOwnerScope] = useState<OwnerScope>(appRole === 'asesor' ? 'grupo' : 'todas')
  const [estado, setEstado] = useState<EstadoFilter>('faltan')
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
  const todayTasks = useMemo(
    () => todayTasksAll.filter((task) => matchesEstadoDone(task.status === 'hecho', estado)),
    [todayTasksAll, estado],
  )
  const pendingTasks = todayTasksAll.filter((task) => task.status === 'pendiente')
  const overdueTasks = pendingTasks.filter((task) => task.dueDate < today)
  const todayTicketsAll = useMemo(() => {
    return items
      .filter((item) => {
        const received = receivedAt(item)
        if (!received || toDateInputValue(received) !== today) return false
        return matchesOwnerScope(item.gestionemail, ownerScope, ownerCtx)
      })
      .sort(compareTicketsByOpenFirst)
  }, [items, today, ownerScope, ownerCtx])
  const todayTickets = useMemo(
    () => todayTicketsAll.filter((item) => matchesEstadoDone(Boolean(item.gestionado), estado)),
    [todayTicketsAll, estado],
  )
  const openTodayTickets = todayTicketsAll.filter((item) => !item.gestionado)

  const historyTicketsAll = useMemo(
    () =>
      items
        .filter((item) => matchesOwnerScope(item.gestionemail, ownerScope, ownerCtx))
        .sort(compareTicketsByOpenFirst),
    [items, ownerScope, ownerCtx],
  )
  const historyTickets = useMemo(
    () => historyTicketsAll.filter((item) => matchesEstadoDone(Boolean(item.gestionado), estado)),
    [historyTicketsAll, estado],
  )
  const lifetimeStats = useMemo(() => computePeticionesStats(historyTicketsAll), [historyTicketsAll])

  const openLinked = (peticionId: string | null) => {
    if (!peticionId) return
    const item = items.find((row) => row.idpeticion === peticionId)
    if (item) onOpenLead?.(item)
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
        <EstadoDoneFilter value={estado} onChange={setEstado} label="Hechos o no" />
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

      <Card className="dash-today" padding="none">
        <div className="ops-card-header">
          <div>
            <p className="section-eyebrow">Hoy</p>
            <h2 className="ops-card-title">Tareas y tickets de este día</h2>
            <p className="section-subtitle">
              {appRole === 'admin'
                ? 'Primero lo que falta: tareas asignadas y consultas de hoy. El filtro de arriba cambia entre no hechos y hechos.'
                : 'Primero lo que falta en tu equipo. Si un compañero está de baja o el cliente lo atendió otro, pásaselo.'}
            </p>
          </div>
          <div className="dash-today-links">
            {onOpenTodayTasks ? (
              <button type="button" className="ops-text-action" onClick={onOpenTodayTasks}>
                Ver bandeja <ArrowRight size={14} />
              </button>
            ) : null}
            <button type="button" className="ops-text-action" onClick={onOpenTriage}>
              Ir al triage <ArrowRight size={14} />
            </button>
          </div>
        </div>
        <div className="dash-today-grid">
          <section className="dash-today-col" aria-label="Tareas de hoy">
            <div className="dash-today-col-head">
              <h3 className="ops-card-title">Tareas de hoy</h3>
              <span className="badge tone-warning">{pendingTasks.length} pendientes</span>
            </div>
            {todayTasks.length === 0 ? (
              <p className="section-subtitle ops-empty">
                {todayTasksAll.length > 0
                  ? estado === 'hechas'
                    ? 'Hoy no hay tareas hechas con este filtro.'
                    : 'Hoy no hay tareas por hacer. Mira «Hechos» o «Todas».'
                  : workspace.tasks.length > 0
                    ? ownerScope === 'mias'
                      ? 'Hoy no tienes tareas.'
                      : ownerScopeEmptyCopy(ownerScope)
                    : 'Hoy no hay tareas.'}
              </p>
            ) : (
              <PaginatedItems items={todayTasks} label="Tareas de hoy" resetKey={workshopId + ownerScope + estado}>
{(visible) => (<ul className="dash-task-list">
                {visible.map((task) => {
                  const overdue = task.status === 'pendiente' && task.dueDate < today
                  const owner = personById(workspace, task.assigneeId)
                  const linked = task.peticionId ? items.find((row) => row.idpeticion === task.peticionId) : undefined
                  return (
                    <li key={task.id} className="dash-task-row">
                      <div className="dash-task-copy">
                        <p className="list-row-title">{task.title}</p>
                        <p className="list-row-meta">
                          {catalogName(workspace.taskTypes, task.taskTypeId)}
                          {task.boardId ? ` · ${catalogName(workspace.boards, task.boardId)}` : ''}
                          {` · ${owner?.name || 'Sin dueño'}`}
                          {overdue ? ' · Atrasada' : ''}
                        </p>
                        {linked ? <TicketClientBlock peticion={linked} size="sm" /> : null}
                      </div>
                      <div className="dash-task-actions">
                        <label className="ticket-owner-picker is-compact" onClick={(e) => e.stopPropagation()}>
                          <span className="sr-only">Pasar tarea</span>
                          <select
                            className="field-select"
                            value={task.assigneeId}
                            aria-label="Pasar tarea a otro asesor"
                            onChange={(e) => setTaskAssignee(task.id, e.target.value)}
                          >
                            <option value="">Sin dueño</option>
                            {teammatesForReassign(workspace, currentUser.email, appRole).map((person) => (
                              <option key={person.id} value={person.id}>
                                {person.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <span className={`badge ${task.status === 'hecho' ? 'tone-positive' : overdue ? 'tone-negative' : 'tone-warning'}`}>
                          {task.status === 'hecho' ? 'Hecha' : overdue ? 'Atrasada' : 'Pendiente'}
                        </span>
                        {task.peticionId ? (
                          <button type="button" className="ghost-button" onClick={() => openLinked(task.peticionId)}>
                            Abrir ficha
                          </button>
                        ) : null}
                        {task.status === 'pendiente' ? (
                          <button type="button" className="client-submit" onClick={() => setTaskStatus(task.id, 'hecho')}>
                            <CheckCircle2 size={16} aria-hidden />
                            Ya está hecha
                          </button>
                        ) : (
                          <button type="button" className="ghost-button" onClick={() => setTaskStatus(task.id, 'pendiente')}>
                            Reabrir
                          </button>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>)}
</PaginatedItems>
            )}
          </section>
          <section className="dash-today-col" aria-label="Tickets de hoy">
            <div className="dash-today-col-head">
              <h3 className="ops-card-title">Tickets de hoy</h3>
              <span className={`badge ${openTodayTickets.length > 0 ? 'tone-warning' : 'tone-positive'}`}>
                {openTodayTickets.length} por hacer
              </span>
            </div>
            {loading ? (
              <HexLoaderScreen size="md" label="Cargando tickets…" />
            ) : todayTickets.length === 0 ? (
              <p className="section-subtitle ops-empty">
                {todayTicketsAll.length > 0
                  ? estado === 'hechas'
                    ? 'Hoy no hay tickets hechos con este filtro.'
                    : 'Hoy no hay tickets por hacer. Mira «Hechos» o «Todas».'
                  : items.length > 0
                    ? ownerScopeEmptyCopy(ownerScope)
                    : 'Hoy no han entrado tickets.'}
              </p>
            ) : (
              <PaginatedItems items={todayTickets} label="Tickets de hoy" resetKey={workshopId + ownerScope + estado}>
{(visible) => (<ul className="ops-feed-list dash-today-tickets">
                {visible.map((item) => (
                  <DashTicketRow
                    key={item.idpeticion}
                    item={item}
                    workshop={workshop}
                    workspace={workspace}
                    currentUser={currentUser}
                    appRole={appRole}
                    onOpenLead={onOpenLead}
                  />
                ))}
              </ul>)}
</PaginatedItems>
            )}
          </section>
        </div>
      </Card>

      <Card className="dash-today dash-history" padding="none">
        <div className="ops-card-header">
          <div>
            <p className="section-eyebrow">Historial</p>
            <h2 className="ops-card-title">Hechos y no hechos · todo el tiempo</h2>
            <p className="section-subtitle">
              Conteos de todo el histórico. Se actualiza al marcar un ticket y periódicamente mientras esta pestaña está visible.
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
        {loading ? (
          <HexLoaderScreen size="md" label="Cargando el historial…" />
        ) : historyTickets.length === 0 ? (
          <p className="section-subtitle ops-empty dash-history-empty">
            {historyTicketsAll.length > 0
              ? estado === 'hechas'
                ? 'No hay tickets hechos con este filtro.'
                : 'No hay tickets por hacer. Mira «Hechos» o «Todas».'
              : items.length > 0
                ? ownerScopeEmptyCopy(ownerScope)
                : 'Aún no hay tickets en el historial.'}
          </p>
        ) : (
          <PaginatedItems items={historyTickets} label="Historial" resetKey={workshopId + ownerScope + estado}>
{(visible) => (<ul className="ops-feed-list dash-today-tickets dash-history-list">
            {visible.map((item) => (
              <DashTicketRow
                key={item.idpeticion}
                item={item}
                workshop={workshop}
                workspace={workspace}
                currentUser={currentUser}
                appRole={appRole}
                onOpenLead={onOpenLead}
              />
            ))}
          </ul>)}
</PaginatedItems>
        )}
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

type DashTicketRowProps = {
  item: PeticionPendiente
  workshop: Workshop
  workspace: AdvisorWorkspace
  currentUser: { name: string; email: string }
  appRole: CrmAppRole
  onOpenLead?: (peticion: PeticionPendiente) => void
}

function DashTicketRow({ item, workshop, workspace, currentUser, appRole, onOpenLead }: DashTicketRowProps) {
  const sla = !item.gestionado && (isSlaCritico(item.fechainicio) || isSlaCritico(item.cita?.fecha))
  const cita = item.cita
  return (
    <li
      className="ops-feed-row dash-ticket-row"
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
