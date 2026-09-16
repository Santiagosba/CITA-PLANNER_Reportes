import { useMemo, useState } from 'react'
import { HexLoaderScreen } from './ui/HexLoader'
import EstadoDoneFilter from './EstadoDoneFilter'
import TicketClientBlock from './TicketClientBlock'
import TicketOwnerPicker from './TicketOwnerPicker'
import TicketPlate from './TicketPlate'
import TicketTeamBadge from './TicketTeamBadge'
import TicketTeamPicker from './TicketTeamPicker'
import type { AdvisorPerson, AdvisorWorkspace } from '../lib/advisorWorkspace'
import { compareTicketsByOpenFirst, matchesEstadoDone, type EstadoFilter } from '../lib/doneFilter'
import { formatFecha, type PeticionPendiente } from '../lib/peticionesPendientes'
import { ticketsOwnedByEmail } from '../lib/ownerScope'
import { isSlaCritico } from '../lib/tallerStations'
import type { Workshop } from '../types'

type Props = {
  person: AdvisorPerson
  workshop: Workshop
  workspace: AdvisorWorkspace
  currentUser: { name: string; email: string }
  tickets: PeticionPendiente[]
  loading?: boolean
  readOnly?: boolean
  onAssignTeam: (peticionId: string, teamId: string | null) => void
  onOpenLead?: (peticion: PeticionPendiente) => void
  showOpenButton?: boolean
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name
}

export default function AdvisorTicketList({
  person,
  workshop,
  workspace,
  currentUser,
  tickets,
  loading = false,
  readOnly = false,
  onAssignTeam,
  onOpenLead,
  showOpenButton = true,
}: Props) {
  const [estado, setEstado] = useState<EstadoFilter>('todas')
  const owned = useMemo(
    () => ticketsOwnedByEmail(tickets, person.email).sort(compareTicketsByOpenFirst),
    [tickets, person.email],
  )
  const rows = useMemo(
    () => owned.filter((item) => matchesEstadoDone(Boolean(item.gestionado), estado)),
    [owned, estado],
  )
  const openCount = owned.filter((item) => !item.gestionado).length
  const name = firstName(person.name)

  return (
    <section className="advisor-ticket-list flex flex-col gap-3" aria-label={`Tickets de ${person.name}`}>
      <div className="advisor-ticket-list-head flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="teams-guide-block-title">Tickets de {name}</h3>
          <p className="section-subtitle">
            {loading && owned.length === 0
              ? 'Cargando sus tickets…'
              : owned.length === 0
                ? `${name} no tiene tickets en este periodo.`
                : openCount === 0
                  ? owned.length === 1
                    ? '1 ticket, ya está hecho.'
                    : `${owned.length} tickets, todos hechos.`
                  : owned.length === 1
                    ? '1 ticket, por hacer.'
                    : `${owned.length} tickets · ${openCount === 1 ? '1 por hacer' : `${openCount} por hacer`}.`}
          </p>
        </div>
        {owned.length > 0 ? <EstadoDoneFilter value={estado} onChange={setEstado} label="Hechas o no" /> : null}
      </div>

      {loading && owned.length === 0 ? (
        <HexLoaderScreen size="sm" label="Cargando sus tickets…" />
      ) : rows.length === 0 ? (
        owned.length > 0 ? (
          <p className="section-subtitle">
            {estado === 'hechas' ? `${name} no tiene tickets hechos.` : `${name} no tiene tickets por hacer.`}
          </p>
        ) : null
      ) : (
        <ul className="advisor-ticket-stack flex flex-col gap-2">
          {rows.map((item) => {
            const sla = !item.gestionado && (isSlaCritico(item.fechainicio) || isSlaCritico(item.cita?.fecha))
            return (
              <li key={item.idpeticion} className="role-task-row glass glass-lite squircle flex flex-col gap-2 overflow-visible p-3">
                <button
                  type="button"
                  className="list-row-title flex min-w-0 items-center text-left"
                  disabled={!onOpenLead}
                  onClick={() => onOpenLead?.(item)}
                >
                  <span className="ops-feed-identity flex min-w-0 flex-1 items-center gap-2.5 overflow-visible">
                    <TicketPlate peticion={item} />
                    <TicketClientBlock peticion={item} size="md" />
                  </span>
                </button>
                <p className="list-row-meta text-[12px] text-avi-muted">
                  {item.tipopeticion || 'Sin tipo'}
                  {` · ${formatFecha(item.fechainicio)}`}{' '}
                  <TicketTeamBadge workspace={workspace} ticket={item} />
                </p>
                <div className="role-task-actions flex flex-wrap items-center gap-2">
                  <TicketOwnerPicker
                    workshop={workshop}
                    workspace={workspace}
                    currentUser={currentUser}
                    appRole={readOnly ? 'asesor' : 'admin'}
                    peticion={item}
                    tickets={tickets}
                    compact
                  />
                  {readOnly ? null : (
                    <TicketTeamPicker
                      workspace={workspace}
                      ticket={item}
                      onAssign={(teamId) => onAssignTeam(item.idpeticion, teamId)}
                    />
                  )}
                  <span className={`badge ${item.gestionado ? 'tone-positive' : sla ? 'tone-negative' : 'tone-warning'}`}>
                    {item.gestionado ? 'Hecho' : sla ? 'SLA' : 'Por hacer'}
                  </span>
                  {showOpenButton && onOpenLead ? (
                    <button type="button" className="ghost-button" onClick={() => onOpenLead(item)}>
                      Abrir ficha
                    </button>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
