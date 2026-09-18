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
import PeriodFilter from '../components/PeriodFilter'
import TeamFilter from '../components/TeamFilter'
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
import { isPersonOnTeam, localTodayIso, type AdvisorWorkspace } from '../lib/advisorWorkspace'
import { compareTicketsByOpenFirst } from '../lib/doneFilter'
import { citaLinkEmptyCopy, matchesCitaLink, ticketHasCita, type CitaLinkFilter } from '../lib/citaLinkFilter'
import { buildOwnerScopeContext, matchesOwnerScope, ownerScopeEmptyCopy, type OwnerScope } from '../lib/ownerScope'
import {
  matchesTeamFilter,
  TEAM_FILTER_ALL,
  teamFilterEmptyCopy,
  teamWorkloadRows,
  visibleTeamsForUser,
  type TeamFilterId,
} from '../lib/teamScope'
import TicketTeamBadge from '../components/TicketTeamBadge'
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
  const [scale, setScale] = useState<CalendarScale>('mes')
  const [anchor, setAnchor] = useState(() => new Date(`${localTodayIso()}T12:00:00`))
  const [ownerScope, setOwnerScope] = useState<OwnerScope>(appRole === 'asesor' ? 'grupo' : 'todas')
  const [teamFilter, setTeamFilter] = useState<TeamFilterId>(TEAM_FILTER_ALL)
  const [citaLink, setCitaLink] = useState<CitaLinkFilter>('todas')
  const period = useMemo(() => calendarPeriod(scale, anchor), [scale, anchor])
  const fetchRange = useMemo(() => ({ from: period.from, to: period.to }), [period.from, period.to])
  const { items, tipos, loading, error, sourceNotice, refresh, refreshSilent } = useOperationalData(workshop, fetchRange)
  const { citas, loading: citasLoading, error: citasError } = useCitasTaller(workshop, fetchRange)
  const { byId: cancelMotivosById, loading: cancelMotivosLoading } = useMotivosCancelada()
  const tiposById = useMemo(
    () => new Map(tipos.map((tipo) => [tipo.idtipopeticion, tipo.tipopeticion])),
    [tipos],
  )
  const liveItems = items
  const ownerCtx = useMemo(
    () => buildOwnerScopeContext(workspace, currentUser.email),
    [workspace, currentUser.email],
  )
  const visibleTeams = useMemo(
    () => visibleTeamsForUser(workspace, currentUser.email, appRole),
    [workspace, currentUser.email, appRole],
  )
  const teamItems = useMemo(
    () =>
      liveItems.filter((item) =>
        matchesTeamFilter(workspace, item, teamFilter, appRole, currentUser.email),
      ),
    [liveItems, workspace, teamFilter, appRole, currentUser.email],
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
    }, 60_000)
    return () => window.clearInterval(timer)
  }, [refreshSilent])

  const periodItems = useMemo(
    () => filterReceivedInRange(teamItems, period.from, period.to),
    [teamItems, period.from, period.to],
  )
  const stats = useMemo(() => computePeticionesStats(periodItems), [periodItems])
  const closedNow = useMemo(
    () => closedInRangeCount(teamItems, period.from, period.to),
    [teamItems, period.from, period.to],
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

  const volume = useMemo(() => volumeForScale(teamItems, scale, anchor), [teamItems, scale, anchor])
  const mixRows = useMemo(
    () => (scale === 'dia' ? channelMix(periodItems) : typeMix(periodItems, tiposById)),
    [scale, periodItems, tiposById],
  )
  const teamMosaicRows = useMemo(
    () => (appRole === 'admin' ? teamWorkloadRows(periodItems, workspace, appRole, currentUser.email) : []),
    [appRole, periodItems, workspace, currentUser.email],
  )
  const advisorMosaicPeople = useMemo(() => {
    if (teamFilter === TEAM_FILTER_ALL) return workspace.people
    const team = workspace.teams.find((row) => row.id === teamFilter)
    if (!team) return workspace.people
    return workspace.people.filter((person) => isPersonOnTeam(workspace, team, person.id, person.email))
  }, [teamFilter, workspace])
  const advisorMosaicRows = useMemo(
    () =>
      appRole === 'admin'
        ? advisorWorkload(periodItems, advisorMosaicPeople)
            .filter((row) => row.recibidas > 0)
            .map((row) => ({ key: row.key, label: row.label, value: row.recibidas }))
        : [],
    [appRole, periodItems, advisorMosaicPeople],
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
      teamItems
        .filter((item) => matchesOwnerScope(item.gestionemail, ownerScope, ownerCtx))
        .filter((item) => matchesCitaLink(item, citaLink))
        .sort(compareTicketsByOpenFirst),
    [teamItems, ownerScope, ownerCtx, citaLink],
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
    tickets: liveItems,
  }

  const scaleLabel = CALENDAR_SCALE_OPTIONS.find((option) => option.id === scale)?.label ?? 'Periodo'
  const showRadar = scale !== 'dia' && radarAxes.length >= 3

  return (
    <div className="dashboard-page operational-dashboard dash-ops flex min-w-0 flex-col gap-4">
      {error ? <ApiStatusBanner message={error} variant="error" /> : null}
      {citasError ? <ApiStatusBanner message={citasError} variant="error" /> : null}
      {sourceNotice && !error ? <ApiStatusBanner message={sourceNotice} variant="warning" /> : null}

      <div className="glass glass-lite squircle flex flex-wrap items-center gap-2 px-3 py-2.5">
        <PeriodFilter scale={scale} anchor={anchor} onScaleChange={setScale} onAnchorChange={setAnchor} />
        <TeamFilter teams={visibleTeams} value={teamFilter} onChange={setTeamFilter} />
        <OwnerScopeFilter value={ownerScope} onChange={setOwnerScope} label="Dueño" />
        <CitaLinkFilterControl value={citaLink} onChange={setCitaLink} />
      </div>

      {!loading && slaCount > 0 ? (
        <aside
          className="glass glass-lite squircle flex flex-wrap items-center gap-x-[18px] gap-y-3.5 border border-[rgba(180,100,10,0.28)] bg-[rgba(245,158,11,0.1)] px-[18px] py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_8px_24px_rgba(180,100,10,0.08)] dark:border-[rgba(240,166,46,0.35)] dark:bg-[rgba(240,166,46,0.12)]"
          role="alert"
          aria-live="polite"
        >
          <div
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center bg-[rgba(245,158,11,0.18)] text-avi-warning dark:bg-[rgba(240,166,46,0.16)] dark:text-[#ffc158] [border-radius:var(--radius-md)] [corner-shape:squircle]"
            aria-hidden
          >
            <AlertTriangle size={22} />
          </div>
          <div className="flex min-w-0 flex-[1_1_240px] flex-col gap-1.5">
            <strong className="text-base font-bold leading-snug tracking-[-0.02em] text-[#92400e] dark:text-[#ffd78a]">
              {slaCount} consulta(s) de este periodo con SLA de contacto de menos de 15 min
            </strong>
            <p className="m-0 text-sm leading-normal text-[#a16207] dark:text-[#e0c08a]">
              Hay que validarlas en persona o con peritaje. No las dejes en la cola.
            </p>
          </div>
          <button
            type="button"
            className="client-submit ml-auto shrink-0 max-[720px]:ml-0 max-[720px]:w-full"
            onClick={onOpenTriage}
          >
            Ir al triage
            <ArrowRight size={16} />
          </button>
        </aside>
      ) : null}

      <section
        className="grid grid-cols-1 gap-2.5 min-[561px]:grid-cols-2 min-[901px]:grid-cols-4"
        aria-label="Indicadores del periodo"
      >
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
        <aside className="glass glass-lite squircle flex flex-wrap items-center gap-x-[18px] gap-y-3.5 px-[18px] py-4">
          <div
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center bg-avi-brand-soft text-avi-brand [border-radius:var(--radius-md)] [corner-shape:squircle]"
            aria-hidden
          >
            <Columns3 size={22} />
          </div>
          <div className="flex min-w-0 flex-[1_1_240px] flex-col gap-1.5">
            <p className="section-eyebrow">Herramienta principal</p>
            <strong className="text-base font-bold leading-snug tracking-[-0.02em] text-avi-fog-strong">
              Gestor de tableros
            </strong>
            <p className="m-0 text-sm leading-normal text-avi-muted">
              El trabajo de hoy del taller, por tipo de consulta.
            </p>
          </div>
          <button
            type="button"
            className="client-submit ml-auto shrink-0 max-[720px]:ml-0 max-[720px]:w-full"
            onClick={onOpenBoards}
          >
            Abrir tableros
            <ArrowRight size={16} />
          </button>
        </aside>
      ) : null}

      <Card className="min-w-0 overflow-hidden" padding="none">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-avi-line px-4 py-3.5 max-[720px]:w-full">
          <div>
            <p className="section-eyebrow">Bandeja</p>
            <h2 className="text-sm font-semibold tracking-[-0.015em] text-avi-fog-strong">Tickets</h2>
            <p className="section-subtitle">
              {appRole === 'asesor'
                ? `Bandeja de ${period.label}: pendientes a la izquierda, resueltos a la derecha.`
                : `Bandeja de ${period.label}: a la izquierda, tickets pendientes. A la derecha, los ya resueltos.`}
            </p>
          </div>
          <div
            className="flex flex-wrap items-center justify-end gap-2 max-[720px]:w-full max-[720px]:justify-start"
            aria-live="polite"
          >
            <span className="badge tone-neutral inline-flex items-center gap-1.5">
              <Radio size={14} className="animate-live-pulse" aria-hidden />
              En vivo
            </span>
            <span className={`badge ${lifetimeStats.porHacer > 0 ? 'tone-warning' : 'tone-positive'}`}>
              {loading ? '—' : lifetimeStats.porHacer} no hechos
            </span>
            <span className="badge tone-positive">{loading ? '—' : lifetimeStats.hechas} hechos</span>
          </div>
        </div>
        <div className="grid h-auto grid-cols-1 items-stretch overflow-hidden min-[1101px]:h-[min(56vh,580px)] min-[1101px]:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
          <DashTicketColumn
            title="Por hacer"
            empty={
              liveItems.length === 0
                ? 'Aún no hay tickets para hacer.'
                : historyTicketsAll.length === 0
                  ? citaLink !== 'todas'
                    ? citaLinkEmptyCopy(citaLink)
                    : teamFilter !== TEAM_FILTER_ALL
                      ? teamFilterEmptyCopy(teamFilter)
                      : ownerScopeEmptyCopy(ownerScope)
                  : 'No hay tickets por hacer.'
            }
            items={historyPendingTickets}
            loading={loading}
            resetKey={`${workshopId}-hist-pend-${ownerScope}-${citaLink}-${teamFilter}`}
            {...ticketRow}
          />
          <DashTicketColumn
            title="Hechos"
            empty={
              historyTicketsAll.length === 0
                ? citaLink !== 'todas'
                  ? citaLinkEmptyCopy(citaLink)
                  : teamFilter !== TEAM_FILTER_ALL
                    ? teamFilterEmptyCopy(teamFilter)
                    : ownerScopeEmptyCopy(ownerScope)
                : 'No hay tickets hechos.'
            }
            items={historyDoneTickets}
            loading={loading}
            done
            resetKey={`${workshopId}-hist-hechos-${ownerScope}-${citaLink}-${teamFilter}`}
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

      <section
        className="laura-split grid grid-cols-1 gap-3.5 min-[901px]:grid-cols-2"
        aria-label="Desglose del periodo"
      >
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
        <>
          <Card className="laura-panel" padding="md">
            <LauraChartCardHeader eyebrow="Equipos" title="Mosaico · Trabajo por equipo">
              <span className="badge tone-neutral">{scaleLabel}</span>
            </LauraChartCardHeader>
            {loading ? (
              <HexLoaderScreen size="md" label="Cargando el trabajo de los equipos…" />
            ) : (
              <LauraMosaic
                caption={`${period.label}. Cada pieza es un equipo que has creado.`}
                rows={teamMosaicRows}
                valueLabel="Consultas"
                helper="Pulsa un equipo arriba para ver solo sus tickets."
                empty="Crea equipos en Cuentas y equipos y asígnales asesores."
              />
            )}
          </Card>
          <Card className="laura-panel" padding="md">
            <LauraChartCardHeader eyebrow="Asesores" title="Mosaico · Trabajo por asesor">
              <span className="badge tone-neutral">{scaleLabel}</span>
            </LauraChartCardHeader>
            {loading ? (
              <HexLoaderScreen size="md" label="Cargando el trabajo del equipo…" />
            ) : (
              <LauraMosaic
                caption={`${period.label}. Cada pieza es una persona.`}
                rows={advisorMosaicRows}
                valueLabel="Consultas"
                helper="Cuanto más grande es la pieza, más consultas ha llevado esa persona."
                empty="Añade asesores en Equipos o espera a que gestionen consultas."
              />
            )}
          </Card>
        </>
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
  tickets: PeticionPendiente[]
}

type DashTicketColumnProps = Omit<DashTicketRowProps, 'item'> & {
  title: string
  empty: string
  items: PeticionPendiente[]
  loading: boolean
  resetKey: string
  done?: boolean
}

const kpiIconTone = {
  brand: 'bg-avi-brand-soft text-avi-brand',
  warning: 'bg-[rgba(240,166,46,0.12)] text-avi-warning',
  positive: 'bg-[rgba(49,196,141,0.12)] text-avi-success',
} as const

function DashTicketColumn({
  title,
  empty,
  items,
  loading,
  resetKey,
  done = false,
  ...rowProps
}: DashTicketColumnProps) {
  return (
    <section
      className="flex min-h-0 min-w-0 flex-col overflow-hidden border-avi-line max-[1100px]:h-[min(42vh,380px)] max-[1100px]:border-b max-[1100px]:border-r-0 max-[1100px]:last:border-b-0 min-[1101px]:border-r min-[1101px]:last:border-r-0"
      aria-label={title}
    >
      <div className="flex min-h-tap flex-wrap items-center justify-between gap-2.5 border-b border-avi-line px-4 py-3">
        <h3 className="min-w-0 text-sm font-semibold tracking-[-0.015em] text-avi-fog-strong">{title}</h3>
        <span className={`badge ${done ? 'tone-positive' : items.length > 0 ? 'tone-warning' : 'tone-positive'}`}>
          {items.length}
        </span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col [&>div]:flex [&>div]:min-h-0 [&>div]:flex-1 [&>div]:flex-col [&_.hex-loader-screen]:flex-1 [&_nav]:shrink-0">
        {loading ? (
          <HexLoaderScreen size="md" label="Cargando tickets…" />
        ) : items.length === 0 ? (
          <p className="section-subtitle flex-1 px-4 py-7 text-center">{empty}</p>
        ) : (
          <PaginatedItems items={items} label={title} resetKey={resetKey}>
            {(visible) => (
              <ul className="ops-feed-list flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto">
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
    <button
      type="button"
      className={`ops-kpi glass glass-lite squircle relative min-h-[104px] px-[15px] py-3.5 text-left text-avi-fog-strong tone-${tone}`}
      onClick={onClick}
    >
      <span className={`inline-flex h-[30px] w-[30px] items-center justify-center [border-radius:var(--radius-xs)] [corner-shape:squircle] ${kpiIconTone[tone]}`}>
        <Icon size={17} />
      </span>
      <span className="mt-2.5 block text-[11px] font-semibold uppercase tracking-[0.045em] text-avi-muted">
        {label}
      </span>
      <strong className="mt-1 block text-[25px] font-semibold leading-none tracking-[-0.03em] text-avi-fog-strong">
        {value}
      </strong>
      <span className="mt-1.5 block text-[10px] text-avi-muted">{helper}</span>
      <ArrowRight size={15} className="absolute bottom-3.5 right-3.5 text-avi-muted" />
    </button>
  )
}

function DashTicketRow({ item, workshop, workspace, currentUser, appRole, onOpenLead, tickets }: DashTicketRowProps) {
  const sla = !item.gestionado && (isSlaCritico(item.fechainicio) || isSlaCritico(item.cita?.fecha))
  return (
    <li
      className={`ops-feed-row flex shrink-0 flex-col gap-2 overflow-hidden border-b border-avi-line px-4 py-3 last:border-b-0${item.gestionado ? ' is-done' : ''}`}
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
      <div className="flex min-w-0 items-start gap-3">
        <TicketPlate peticion={item} />
        <div className="ops-feed-identity min-w-0 flex-1">
          <TicketClientBlock peticion={item} size="sm" />
          <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="text-[12px] font-semibold text-avi-muted">{item.tipopeticion || 'Sin tipo'}</span>
            {isDemoTicketId(item.idpeticion) ? <span className="badge tone-info">Prueba</span> : null}
          </div>
        </div>
      </div>
      <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <TicketOwnerPicker
            workshop={workshop}
            workspace={workspace}
            currentUser={currentUser}
            appRole={appRole}
            peticion={item}
            tickets={tickets}
            compact
            showTeam={false}
          />
          <TicketTeamBadge workspace={workspace} ticket={item} />
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className={`badge ${item.gestionado ? 'tone-positive' : sla ? 'tone-negative' : 'tone-warning'}`}>
          {item.gestionado ? 'Hecho' : sla ? 'SLA' : 'No hecho'}
        </span>
        <time className="ml-auto whitespace-nowrap text-[12px] font-semibold text-avi-muted">
          {formatFecha(item.fechainicio)}
        </time>
        </div>
      </div>
    </li>
  )
}
