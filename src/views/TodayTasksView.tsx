import { useMemo, useState } from 'react'
import { ArrowUpRight, CalendarDays, CarFront, History, Search, UserRound, UsersRound, X } from 'lucide-react'
import ApiStatusBanner from '../components/ApiStatusBanner'
import { HexLoaderScreen } from '../components/ui/HexLoader'
import Card from '../components/ui/Card'
import PaginatedItems from '../components/PaginatedItems'
import TicketClientBlock from '../components/TicketClientBlock'
import TicketPlate from '../components/TicketPlate'
import { computePeticionesStats, formatFecha, type PeticionPendiente } from '../lib/peticionesPendientes'
import { localTodayIso, personByEmail } from '../lib/advisorWorkspace'
import { useAdvisorWorkspace } from '../hooks/useAdvisorWorkspace'
import type { CrmAppRole } from '../lib/crmRoles'
import { useOperationalData } from '../hooks/useOperationalData'
import {
  buildOwnerScopeContext,
  matchesOwnerScope,
  ownerScopeEmptyCopy,
  type OwnerScope,
} from '../lib/ownerScope'
import {
  matchesTeamFilter,
  TEAM_FILTER_ALL,
  teamFilterEmptyCopy,
  ticketTeamLabel,
  visibleTeamsForUser,
  type TeamFilterId,
} from '../lib/teamScope'
import CitaLinkFilterControl from '../components/CitaLinkFilter'
import EstadoDoneFilter from '../components/EstadoDoneFilter'
import OwnerScopeFilter from '../components/OwnerScopeFilter'
import PeriodFilter from '../components/PeriodFilter'
import TeamFilter from '../components/TeamFilter'
import { citaLinkEmptyCopy, matchesCitaLink, ticketHasCita, type CitaLinkFilter } from '../lib/citaLinkFilter'
import { compareTicketsByOpenFirst, matchesEstadoDone, type EstadoFilter } from '../lib/doneFilter'
import { isSlaCritico } from '../lib/tallerStations'
import { calendarPeriod, type CalendarScale } from '../lib/calendarScale'
import { ticketClientLabel, ticketClientPhone, ticketNeedLabel, ticketVehicleLabel } from '../lib/ticketClient'
import type { Workshop } from '../types'

type Props = {
  workshop: Workshop
  currentUser: { name: string; email: string }
  appRole?: CrmAppRole
  onOpenLead: (peticion: PeticionPendiente) => void
}

function todayAnchor() {
  return new Date(`${localTodayIso()}T12:00:00`)
}

function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

export default function TodayTasksView({ workshop, currentUser, appRole = 'asesor', onOpenLead }: Props) {
  const workshopId = workshop.containerIdTaller || workshop.id
  const { workspace } = useAdvisorWorkspace(workshopId, currentUser, true)
  const [scale, setScale] = useState<CalendarScale>('mes')
  const [anchor, setAnchor] = useState(todayAnchor)
  const period = useMemo(() => calendarPeriod(scale, anchor), [scale, anchor])
  const range = useMemo(() => ({ from: period.from, to: period.to }), [period.from, period.to])
  const { items, loading, error, sourceNotice } = useOperationalData(workshop, range)
  const [ownerScope, setOwnerScope] = useState<OwnerScope>('todas')
  const [teamFilter, setTeamFilter] = useState<TeamFilterId>(TEAM_FILTER_ALL)
  const [citaLink, setCitaLink] = useState<CitaLinkFilter>('todas')
  const [estado, setEstado] = useState<EstadoFilter>('todas')
  const [query, setQuery] = useState('')
  const ownerCtx = useMemo(
    () => buildOwnerScopeContext(workspace, currentUser.email),
    [workspace, currentUser.email],
  )
  const visibleTeams = useMemo(
    () => visibleTeamsForUser(workspace, currentUser.email, appRole),
    [workspace, currentUser.email, appRole],
  )

  const liveItems = items

  const historyAll = useMemo(
    () =>
      liveItems
        .filter((item) => matchesTeamFilter(workspace, item, teamFilter, appRole, currentUser.email))
        .filter((item) => matchesOwnerScope(item.gestionemail, ownerScope, ownerCtx))
        .filter((item) => matchesCitaLink(item, citaLink))
        .sort(compareTicketsByOpenFirst),
    [liveItems, workspace, teamFilter, appRole, currentUser.email, ownerScope, ownerCtx, citaLink],
  )
  const rows = useMemo(() => {
    const needle = fold(query.trim())
    return historyAll
      .filter((item) => matchesEstadoDone(Boolean(item.gestionado), estado))
      .filter((item) => {
        if (!needle) return true
        return fold(
          [
            ticketClientLabel(item),
            ticketClientPhone(item),
            ticketNeedLabel(item),
            item.tipopeticion,
            item.gestionemail,
            ticketTeamLabel(workspace, item),
            item.cita?.matricula,
            ticketVehicleLabel(item),
          ]
            .filter(Boolean)
            .join(' '),
        ).includes(needle)
      })
  }, [historyAll, estado, query, workspace])
  const stats = useMemo(() => computePeticionesStats(historyAll), [historyAll])

  return (
    <div className="dashboard-page role-desk flex min-w-0 flex-col gap-4">
      {error ? <ApiStatusBanner message={error} variant="error" /> : null}
      {sourceNotice && !error ? <ApiStatusBanner message={sourceNotice} variant="warning" /> : null}

      <section className="glass glass-lite squircle flex min-w-0 flex-col gap-4 p-4 sm:p-5" aria-label="Buscar y filtrar tickets">
        <div className="flex min-w-0 flex-wrap items-end gap-3">
          <label className="min-w-[min(100%,22rem)] flex-1" htmlFor="history-search">
            <span className="mb-1.5 block text-sm font-bold text-avi-fog-strong">Busca un ticket</span>
            <span className="relative block">
              <Search
                size={19}
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-avi-muted"
                aria-hidden
              />
              <input
                id="history-search"
                className="field-input min-h-tap max-w-none pl-12 pr-12"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Nombre, teléfono, matrícula o motivo"
              />
              {query ? (
                <button
                  type="button"
                  className="absolute right-1 top-1/2 inline-flex min-h-tap min-w-tap -translate-y-1/2 items-center justify-center rounded-pill text-avi-muted hover:bg-avi-brand-soft hover:text-avi-brand"
                  onClick={() => setQuery('')}
                  aria-label="Borrar búsqueda"
                >
                  <X size={17} aria-hidden />
                </button>
              ) : null}
            </span>
          </label>
          <p className="m-0 max-w-md text-sm leading-relaxed text-avi-muted">
            Aquí solo revisas tickets. Toca cualquiera para abrir su ficha completa.
          </p>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2 border-t border-avi-line pt-4">
          <PeriodFilter scale={scale} anchor={anchor} onScaleChange={setScale} onAnchorChange={setAnchor} />
          <EstadoDoneFilter value={estado} onChange={setEstado} />
          <TeamFilter teams={visibleTeams} value={teamFilter} onChange={setTeamFilter} />
          <OwnerScopeFilter value={ownerScope} onChange={setOwnerScope} label="Responsable" />
          <CitaLinkFilterControl value={citaLink} onChange={setCitaLink} />
        </div>
      </section>

      <section className="ops-kpi-grid grid grid-cols-1 gap-2.5 min-[561px]:grid-cols-3" aria-label="Historial de consultas">
        <article className="metric glass glass-lite squircle">
          <span className="ops-kpi-label block text-[11px] font-semibold uppercase tracking-[0.045em] text-avi-muted">Por hacer</span>
          <strong>{loading ? '—' : stats.porHacer}</strong>
          <span className="ops-kpi-helper mt-1.5 block text-sm text-avi-muted">En {period.label}</span>
        </article>
        <article className="metric glass glass-lite squircle">
          <span className="ops-kpi-label block text-[11px] font-semibold uppercase tracking-[0.045em] text-avi-muted">Hechas</span>
          <strong>{loading ? '—' : stats.hechas}</strong>
          <span className="ops-kpi-helper mt-1.5 block text-sm text-avi-muted">Cerradas en el periodo</span>
        </article>
        <article className="metric glass glass-lite squircle">
          <span className="ops-kpi-label block text-[11px] font-semibold uppercase tracking-[0.045em] text-avi-muted">Total</span>
          <strong>{loading ? '—' : stats.total}</strong>
          <span className="ops-kpi-helper mt-1.5 block text-sm text-avi-muted">Tickets de este periodo</span>
        </article>
      </section>

      <Card padding="none" className="min-w-0 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-avi-line px-4 py-4 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <span
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-avi-brand-soft text-avi-brand"
              aria-hidden
            >
              <History size={22} />
            </span>
            <div className="min-w-0">
              <p className="section-eyebrow">Archivo de tickets</p>
              <h2 className="m-0 text-lg font-bold tracking-[-0.02em] text-avi-fog-strong">
                {rows.length} {rows.length === 1 ? 'ticket encontrado' : 'tickets encontrados'}
              </h2>
              <p className="m-0 mt-0.5 text-sm text-avi-muted">{period.label}</p>
            </div>
          </div>
          <span className="badge tone-neutral">Solo consulta</span>
        </div>

        {loading && rows.length === 0 ? (
          <HexLoaderScreen size="md" label="Cargando el historial…" />
        ) : rows.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <History size={32} className="mx-auto text-avi-muted" aria-hidden />
            <p className="mb-0 mt-3 text-base font-semibold text-avi-fog-strong">
              {query.trim()
                ? 'No encontramos ese ticket.'
                : historyAll.length > 0
              ? estado === 'hechas'
                ? 'No hay consultas hechas con este filtro.'
                : 'No hay consultas por hacer. Pulsa «Ya hechas» o «Ver todo».'
                : citaLink !== 'todas'
                  ? citaLinkEmptyCopy(citaLink)
                  : teamFilter !== TEAM_FILTER_ALL
                    ? teamFilterEmptyCopy(teamFilter)
                    : ownerScope === 'mias'
                      ? 'Aún no hay consultas tuyas en este periodo.'
                      : liveItems.length === 0
                        ? `No hay consultas en ${period.label}. Prueba otro periodo.`
                        : ownerScopeEmptyCopy(ownerScope)}
            </p>
            {query.trim() ? (
              <button type="button" className="ghost-button mt-4" onClick={() => setQuery('')}>
                Borrar búsqueda
              </button>
            ) : null}
          </div>
        ) : (
          <PaginatedItems
            items={rows}
            label="Historial"
            resetKey={`${workshopId}-${period.from}-${period.to}-${ownerScope}-${teamFilter}-${citaLink}-${estado}-${query}`}
          >
            {(pageRows) => (
              <div className="max-h-[min(68vh,760px)] overflow-y-auto">
                <ul className="m-0 grid list-none grid-cols-1 gap-3 p-3 sm:p-4 2xl:grid-cols-2">
                  {pageRows.map((item) => {
                    const sla = !item.gestionado && (isSlaCritico(item.fechainicio) || isSlaCritico(item.cita?.fecha))
                    const owner = item.gestionemail
                      ? personByEmail(workspace, item.gestionemail)?.name || item.gestionemail
                      : 'Sin dueño'
                    const team = ticketTeamLabel(workspace, item) || 'Sin equipo'
                    const hasCita = ticketHasCita(item)
                    const vehicle = ticketVehicleLabel(item) || 'Sin vehículo'
                    return (
                      <li
                        key={item.idpeticion}
                        className="squircle flex min-w-0 flex-col overflow-hidden border border-avi-line bg-avi-surface-solid shadow-glass transition duration-base ease-avi hover:-translate-y-0.5 hover:border-avi-brand hover:shadow-card"
                      >
                        <div className="flex flex-wrap items-center gap-2 border-b border-avi-line bg-avi-surface px-4 py-2.5">
                          <span className={`badge ${item.gestionado ? 'tone-positive' : sla ? 'tone-negative' : 'tone-warning'}`}>
                            {item.gestionado ? 'Hecho' : sla ? 'SLA crítico' : 'Por hacer'}
                          </span>
                          <span className="badge tone-muted">{item.tipopeticion || 'Sin tipo'}</span>
                          <time className="ml-auto text-sm font-semibold text-avi-muted">
                            {formatFecha(item.fechainicio)}
                          </time>
                        </div>
                        <button
                          type="button"
                          className="flex min-w-0 flex-1 flex-col items-stretch gap-4 bg-transparent p-4 text-left outline-none focus-visible:shadow-focus sm:p-5"
                          onClick={() => onOpenLead(item)}
                        >
                          <span className="flex min-w-0 flex-col items-start gap-3 sm:flex-row">
                            <TicketPlate peticion={item} />
                            <TicketClientBlock peticion={item} size="md" />
                          </span>
                          <span className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                            <span className="rounded-sm bg-avi-surface px-3 py-2.5">
                              <span className="flex items-center gap-1.5 text-sm text-avi-muted">
                                <UserRound size={15} aria-hidden /> Responsable
                              </span>
                              <strong className="mt-1 block truncate text-sm text-avi-fog-strong" title={owner}>
                                {owner}
                              </strong>
                            </span>
                            <span className="rounded-sm bg-avi-surface px-3 py-2.5">
                              <span className="flex items-center gap-1.5 text-sm text-avi-muted">
                                <UsersRound size={15} aria-hidden /> Equipo
                              </span>
                              <strong className="mt-1 block truncate text-sm text-avi-fog-strong" title={team}>
                                {team}
                              </strong>
                            </span>
                            <span className="rounded-sm bg-avi-surface px-3 py-2.5">
                              <span className="flex items-center gap-1.5 text-sm text-avi-muted">
                                <CalendarDays size={15} aria-hidden /> Cita
                              </span>
                              <strong className="mt-1 block truncate text-sm text-avi-fog-strong">
                                {hasCita ? formatFecha(item.cita?.fecha) : 'Sin cita'}
                              </strong>
                            </span>
                            <span className="rounded-sm bg-avi-surface px-3 py-2.5">
                              <span className="flex items-center gap-1.5 text-sm text-avi-muted">
                                <CarFront size={15} aria-hidden /> Vehículo
                              </span>
                              <strong className="mt-1 block truncate text-sm text-avi-fog-strong" title={vehicle}>
                                {vehicle}
                              </strong>
                            </span>
                          </span>
                        </button>
                        <div className="flex items-center justify-between gap-3 border-t border-avi-line px-4 py-3 sm:px-5">
                          <span className="truncate text-sm text-avi-muted">
                            {item.gestionado && item.gestionfecha
                              ? `Cerrado ${formatFecha(item.gestionfecha)}`
                              : 'Consulta todavía abierta'}
                          </span>
                          <button type="button" className="ghost-button shrink-0" onClick={() => onOpenLead(item)}>
                            Ver ficha
                            <ArrowUpRight size={16} aria-hidden />
                          </button>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}
          </PaginatedItems>
        )}
      </Card>
    </div>
  )
}
