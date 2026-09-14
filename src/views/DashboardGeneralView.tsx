import PaginatedItems from '../components/PaginatedItems'
import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowRight, ClipboardList, Columns3, History, Percent, Radio, Wrench } from 'lucide-react'
import ApiStatusBanner from '../components/ApiStatusBanner'
import {
  formatLauraPct,
  LauraChartCardHeader,
  LauraGroupedBars,
  LauraHeatmap,
  LauraMosaic,
  LauraPareto,
  LauraRadar,
  LauraUprightPie,
  mixToPieSlices,
  mixToRadarAxes,
} from '../components/LauraCharts'
import CitaLinkFilterControl from '../components/CitaLinkFilter'
import OwnerScopeFilter from '../components/OwnerScopeFilter'
import TicketClientBlock from '../components/TicketClientBlock'
import TicketOwnerPicker from '../components/TicketOwnerPicker'
import { HexLoaderScreen } from '../components/ui/HexLoader'
import Card from '../components/ui/Card'
import TicketPlate from '../components/TicketPlate'
import { useAdvisorWorkspace } from '../hooks/useAdvisorWorkspace'
import { useCitasTaller } from '../hooks/useCitasTaller'
import { useMotivosCancelada } from '../hooks/useMotivosCancelada'
import { useOperationalData } from '../hooks/useOperationalData'
import {
  CALENDAR_SCALE_OPTIONS,
  calendarPeriod,
  type CalendarScale,
} from '../lib/calendarScale'
import type { CrmAppRole } from '../lib/crmRoles'
import {
  advisorWorkload,
  cancelMotiveHeatmap,
  channelMix,
  closedInRangeCount,
  filterReceivedInRange,
  heatChartTitle,
  mixChartTitle,
  motiveOutcomeMix,
  typeMix,
  volumeChartTitle,
  volumeForScale,
} from '../lib/dashboardAnalytics'
import { localTodayIso, type AdvisorWorkspace } from '../lib/advisorWorkspace'
import { compareTicketsByOpenFirst } from '../lib/doneFilter'
import { citaLinkEmptyCopy, matchesCitaLink, ticketHasCita, type CitaLinkFilter } from '../lib/citaLinkFilter'
import { buildOwnerScopeContext, matchesOwnerScope, ownerScopeEmptyCopy, type OwnerScope } from '../lib/ownerScope'
import { isDemoCitaId, isDemoTicketId } from '../lib/demoTickets'
import { isLocalPreviewWorkshop } from '../lib/localPreview'
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
  onOpenBoards?: () => void
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
  onOpenBoards,
  onOpenLead,
  refreshToken = 0,
}: Props) {
  const workshopId = workshop.containerIdTaller || workshop.id
  const { workspace } = useAdvisorWorkspace(workshopId, currentUser, true)
  const [scale, setScale] = useState<CalendarScale>('dia')
  const [ownerScope, setOwnerScope] = useState<OwnerScope>(appRole === 'asesor' ? 'grupo' : 'todas')
  const [citaLink, setCitaLink] = useState<CitaLinkFilter>('todas')
  const today = localTodayIso()
  const anchor = useMemo(() => new Date(`${today}T12:00:00`), [today])
  const period = useMemo(() => calendarPeriod(scale, anchor), [scale, anchor])
  const fetchRange = useMemo(() => ({ from: period.from, to: period.to }), [period.from, period.to])
  const { items, tipos, loading, error, sourceNotice, refresh, refreshSilent } = useOperationalData(workshop, fetchRange)
  const { citas, loading: citasLoading, error: citasError } = useCitasTaller(workshop, fetchRange)
  const { byId: cancelMotivosById, loading: cancelMotivosLoading } = useMotivosCancelada()
  const tiposById = useMemo(
    () => new Map(tipos.map((tipo) => [tipo.idtipopeticion, tipo.tipopeticion])),
    [tipos],
  )
  const liveItems = useMemo(() => {
    if (isLocalPreviewWorkshop(workshop)) return items
    return items.filter((item) => !isDemoTicketId(item.idpeticion))
  }, [items, workshop])
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
    () => filterReceivedInRange(liveItems, period.from, period.to),
    [liveItems, period.from, period.to],
  )
  const stats = useMemo(() => computePeticionesStats(periodItems), [periodItems])
  const closedNow = useMemo(
    () => closedInRangeCount(liveItems, period.from, period.to),
    [liveItems, period.from, period.to],
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
    () => periodItems.reduce((n, item) => n + (ticketHasCita(item) ? 1 : 0), 0),
    [periodItems],
  )

  const volume = useMemo(() => volumeForScale(liveItems, scale, anchor), [liveItems, scale, anchor])
  const mixRows = useMemo(
    () => (scale === 'dia' ? channelMix(periodItems) : typeMix(periodItems, tiposById)),
    [scale, periodItems, tiposById],
  )
  const teamMosaicRows = useMemo(
    () =>
      appRole === 'admin'
        ? advisorWorkload(periodItems, workspace.people)
            .filter((row) => row.recibidas > 0)
            .map((row) => ({ key: row.key, label: row.label, value: row.recibidas }))
        : [],
    [appRole, periodItems, workspace.people],
  )
  const pieSlices = useMemo(() => mixToPieSlices(mixRows), [mixRows])
  const radarAxes = useMemo(() => mixToRadarAxes(mixRows), [mixRows])
  const volumeRows = useMemo(
    () => volume.map((point) => ({ key: point.key, label: point.label, value: point.recibidas })),
    [volume],
  )
  const liveCitas = useMemo(() => {
    if (isLocalPreviewWorkshop(workshop)) return citas
    return citas.filter((cita) => !isDemoCitaId(cita.idcita))
  }, [citas, workshop])
  const motiveRows = useMemo(
    () => motiveOutcomeMix(liveCitas, periodItems, tiposById),
    [liveCitas, periodItems, tiposById],
  )
  const motiveChartRows = useMemo(
    () => motiveRows.map((row) => ({ key: row.key, label: row.label, a: row.realizadas, b: row.canceladas })),
    [motiveRows],
  )
  const cancelHeat = useMemo(
    () =>
      cancelMotiveHeatmap(liveCitas, periodItems, cancelMotivosById, tiposById, scale, anchor),
    [liveCitas, periodItems, cancelMotivosById, tiposById, scale, anchor],
  )

  const historyTicketsAll = useMemo(
    () =>
      liveItems
        .filter((item) => matchesOwnerScope(item.gestionemail, ownerScope, ownerCtx))
        .filter((item) => matchesCitaLink(item, citaLink))
        .sort(compareTicketsByOpenFirst),
    [liveItems, ownerScope, ownerCtx, citaLink],
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
      {citasError ? <ApiStatusBanner message={citasError} variant="error" /> : null}
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
        <OwnerScopeFilter value={ownerScope} onChange={setOwnerScope} label="Tickets" />
        <CitaLinkFilterControl value={citaLink} onChange={setCitaLink} />
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
          icon={History}
          label="Historial"
          value={loading ? '—' : lifetimeStats.porHacer}
          helper={`${lifetimeStats.hechas} hechas · ${period.label}`}
          tone={lifetimeStats.porHacer > 0 ? 'warning' : 'brand'}
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

      {onOpenBoards ? (
        <aside className="dash-boards-jump glass glass-lite">
          <div className="dash-boards-jump-icon" aria-hidden>
            <Columns3 size={22} />
          </div>
          <div className="dash-boards-jump-copy">
            <p className="section-eyebrow">Herramienta principal</p>
            <strong>Gestor de tableros</strong>
            <p>Aquí se trabajan las consultas del taller, por operación y prioridad.</p>
          </div>
          <button type="button" className="client-submit dash-boards-jump-action" onClick={onOpenBoards}>
            Abrir tableros
            <ArrowRight size={16} />
          </button>
        </aside>
      ) : null}

      <Card className="dash-today dash-history" padding="none">
        <div className="ops-card-header">
          <div>
            <p className="section-eyebrow">Bandeja</p>
            <h2 className="ops-card-title">Tickets</h2>
            <p className="section-subtitle">
              {appRole === 'asesor'
                ? `Bandeja de ${period.label}: pendientes a la izquierda, resueltos a la derecha.`
                : `Bandeja de ${period.label}: a la izquierda, tickets pendientes. A la derecha, los ya resueltos.`}
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
              liveItems.length === 0
                ? 'Aún no hay tickets para hacer.'
                : historyTicketsAll.length === 0
                  ? citaLink !== 'todas'
                    ? citaLinkEmptyCopy(citaLink)
                    : ownerScopeEmptyCopy(ownerScope)
                  : 'No hay tickets por hacer.'
            }
            items={historyPendingTickets}
            loading={loading}
            listClassName="dash-history-list"
            resetKey={`${workshopId}-hist-pend-${ownerScope}-${citaLink}`}
            {...ticketRow}
          />
          <DashTicketColumn
            title="Hechos"
            empty={
              historyTicketsAll.length === 0
                ? citaLink !== 'todas'
                  ? citaLinkEmptyCopy(citaLink)
                  : ownerScopeEmptyCopy(ownerScope)
                : 'No hay tickets hechos.'
            }
            items={historyDoneTickets}
            loading={loading}
            done
            listClassName="dash-history-list"
            resetKey={`${workshopId}-hist-hechos-${ownerScope}-${citaLink}`}
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
                      { label: 'Hechas', value: formatLauraPct(stats.pctHechas), pct: stats.pctHechas, color: '#0a55b8', count: stats.hechas },
                      {
                        label: 'Por hacer',
                        value: formatLauraPct(Math.max(0, 100 - stats.pctHechas)),
                        pct: Math.max(0, 100 - stats.pctHechas),
                        color: '#f59e0b',
                        count: stats.porHacer,
                      },
                    ]
              }
            />
          )}
        </Card>
      </section>

      <Card className="laura-panel" padding="md">
        <LauraChartCardHeader
          eyebrow="Motivos de consulta"
          title="Barras agrupadas · Realizadas y canceladas por motivo"
        />
        {loading || citasLoading ? (
          <HexLoaderScreen size="md" label="Cargando el desglose…" />
        ) : (
          <LauraGroupedBars
            caption={`Tipo de consulta · realizadas frente a canceladas · ${period.label}.`}
            rows={motiveChartRows}
            empty="En este periodo no hay consultas con motivo. Prueba otro día, semana o mes."
          />
        )}
      </Card>

      <Card className="laura-panel" padding="md">
        <LauraChartCardHeader eyebrow="Canceladas" title={`Heat · Motivos ${heatChartTitle(scale)}`}>
          <span className="badge tone-neutral">{scaleLabel}</span>
        </LauraChartCardHeader>
        {loading || citasLoading || cancelMotivosLoading ? (
          <HexLoaderScreen size="md" label="Cargando los motivos de cancelación…" />
        ) : (
          <LauraHeatmap
            caption={`${period.label}. Cada fila es lo que se dijo o se anotó en la llamada al cancelar.`}
            rows={cancelHeat.rows}
            cols={cancelHeat.cols}
            values={cancelHeat.values}
            valueLabel="Canceladas"
            empty="En este periodo no hay citas canceladas."
          />
        )}
      </Card>

      {appRole === 'admin' ? (
        <Card className="laura-panel" padding="md">
          <LauraChartCardHeader eyebrow="Equipo" title="Mosaico · Trabajo por asesor">
            <span className="badge tone-neutral">{scaleLabel}</span>
          </LauraChartCardHeader>
          {loading ? (
            <HexLoaderScreen size="md" label="Cargando el trabajo del equipo…" />
          ) : (
            <LauraMosaic
              caption={`${period.label}. Cada pieza es una persona.`}
              rows={teamMosaicRows}
              valueLabel="Consultas"
              helper="Cuanto más grande es la pieza, más consultas ha llevado esa persona."
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
        <TicketPlate peticion={item} />
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
