import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, History } from 'lucide-react'
import ApiStatusBanner from '../components/ApiStatusBanner'
import { HexLoaderScreen } from '../components/ui/HexLoader'
import Card from '../components/ui/Card'
import PaginatedItems from '../components/PaginatedItems'
import TicketClientBlock from '../components/TicketClientBlock'
import TicketOwnerPicker from '../components/TicketOwnerPicker'
import TicketPlate from '../components/TicketPlate'
import { computePeticionesStats, formatFecha, type PeticionPendiente } from '../lib/peticionesPendientes'
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
  visibleTeamsForUser,
  type TeamFilterId,
} from '../lib/teamScope'
import CitaLinkFilterControl from '../components/CitaLinkFilter'
import EstadoDoneFilter from '../components/EstadoDoneFilter'
import OwnerScopeFilter from '../components/OwnerScopeFilter'
import TeamFilter from '../components/TeamFilter'
import { citaLinkEmptyCopy, matchesCitaLink, type CitaLinkFilter } from '../lib/citaLinkFilter'
import { compareTicketsByOpenFirst, matchesEstadoDone, type EstadoFilter } from '../lib/doneFilter'
import { isSlaCritico } from '../lib/tallerStations'
import { localTodayIso } from '../lib/advisorWorkspace'
import {
  CALENDAR_SCALE_OPTIONS,
  calendarPeriod,
  shiftCalendarAnchor,
  type CalendarScale,
} from '../lib/calendarScale'
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
  const rows = useMemo(
    () => historyAll.filter((item) => matchesEstadoDone(Boolean(item.gestionado), estado)),
    [historyAll, estado],
  )
  const stats = useMemo(() => computePeticionesStats(historyAll), [historyAll])

  const changeScale = (next: CalendarScale) => {
    setScale(next)
    setAnchor(todayAnchor())
  }

  return (
    <div className="dashboard-page role-desk">
      {error ? <ApiStatusBanner message={error} variant="error" /> : null}
      {sourceNotice && !error ? <ApiStatusBanner message={sourceNotice} variant="warning" /> : null}

      <div className="elevator-filters glass glass-lite">
        <div className="filter-field">
          <span className="filter-field-label">Periodo</span>
          <div className="estado-filter" role="group" aria-label="Periodo del historial">
            {CALENDAR_SCALE_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                className={`preset-chip ${scale === option.id ? 'is-active' : ''}`}
                onClick={() => changeScale(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <div className="elevator-day-nav">
          <button
            type="button"
            className="ghost-button calendar-nav"
            onClick={() => setAnchor((current) => shiftCalendarAnchor(scale, current, -1))}
            aria-label="Periodo anterior"
          >
            <ChevronLeft size={17} />
          </button>
          <button type="button" className="ghost-button" onClick={() => setAnchor(todayAnchor())}>
            Hoy
          </button>
          <button
            type="button"
            className="ghost-button calendar-nav"
            onClick={() => setAnchor((current) => shiftCalendarAnchor(scale, current, 1))}
            aria-label="Periodo siguiente"
          >
            <ChevronRight size={17} />
          </button>
        </div>
        <p className="dash-period-label">{period.label}</p>
        <TeamFilter teams={visibleTeams} value={teamFilter} onChange={setTeamFilter} />
        <OwnerScopeFilter value={ownerScope} onChange={setOwnerScope} label="Dueño" />
        <CitaLinkFilterControl value={citaLink} onChange={setCitaLink} />
        <EstadoDoneFilter value={estado} onChange={setEstado} label="Hechas o no" />
      </div>

      <section className="ops-kpi-grid" aria-label="Historial de consultas">
        <article className="metric glass glass-lite">
          <span className="ops-kpi-label">Por hacer</span>
          <strong>{loading ? '—' : stats.porHacer}</strong>
          <span className="ops-kpi-helper">En {period.label}</span>
        </article>
        <article className="metric glass glass-lite">
          <span className="ops-kpi-label">Hechas</span>
          <strong>{loading ? '—' : stats.hechas}</strong>
          <span className="ops-kpi-helper">Cerradas en el periodo</span>
        </article>
        <article className="metric glass glass-lite">
          <span className="ops-kpi-label">Total</span>
          <strong>{loading ? '—' : stats.total}</strong>
          <span className="ops-kpi-helper">Consultas de este periodo</span>
        </article>
      </section>

      <Card>
        <div className="role-desk-heading">
          <div>
            <p className="section-eyebrow">Consultas</p>
            <h2 className="ops-card-title">Historial</h2>
            <p className="section-subtitle">
              {period.label}. Elige día, semana, mes o año. No cargamos todo el taller de golpe.
            </p>
          </div>
          <History size={22} aria-hidden style={{ color: 'var(--color-brand)' }} />
        </div>

        {loading && rows.length === 0 ? (
          <HexLoaderScreen size="md" label="Cargando el historial…" />
        ) : rows.length === 0 ? (
          <p className="section-subtitle">
            {historyAll.length > 0
              ? estado === 'hechas'
                ? 'No hay consultas hechas con este filtro.'
                : 'No hay consultas por hacer. Mira «Hechos» o «Todas».'
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
        ) : (
          <PaginatedItems
            items={rows}
            label="Historial"
            resetKey={`${workshopId}-${period.from}-${period.to}-${ownerScope}-${teamFilter}-${citaLink}-${estado}`}
          >
            {(pageRows) => (
              <div className="scroll-panel">
                <ul className="role-list">
                  {pageRows.map((item) => {
                    const sla = !item.gestionado && (isSlaCritico(item.fechainicio) || isSlaCritico(item.cita?.fecha))
                    return (
                      <li key={item.idpeticion} className="role-task-row glass glass-lite">
                        <button type="button" className="list-row-title" onClick={() => onOpenLead(item)}>
                          <span className="ops-feed-identity">
                            <TicketPlate peticion={item} />
                            <TicketClientBlock peticion={item} size="md" />
                          </span>
                        </button>
                        <p className="list-row-meta">
                          {item.tipopeticion || 'Sin tipo'}
                          {` · ${formatFecha(item.fechainicio)}`}
                        </p>
                        <div className="role-task-actions">
                          <TicketOwnerPicker
                            workshop={workshop}
                            workspace={workspace}
                            currentUser={currentUser}
                            appRole={appRole}
                            peticion={item}
                            tickets={liveItems}
                            compact
                          />
                          <span className={`badge ${item.gestionado ? 'tone-positive' : sla ? 'tone-negative' : 'tone-warning'}`}>
                            {item.gestionado ? 'Hecha' : sla ? 'SLA' : 'Por hacer'}
                          </span>
                          <button type="button" className="ghost-button" onClick={() => onOpenLead(item)}>
                            Abrir ficha
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
