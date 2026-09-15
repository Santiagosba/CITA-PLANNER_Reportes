import { memo, type PointerEvent as ReactPointerEvent } from 'react'
import { GripVertical } from 'lucide-react'
import { localTodayIso, personByEmail } from '../lib/advisorWorkspace'
import type { AdvisorWorkspace } from '../lib/advisorWorkspace'
import { formatFecha, type PeticionPendiente } from '../lib/peticionesPendientes'
import type { Workshop } from '../types'
import TicketPlate from './TicketPlate'
import TicketClientBlock from './TicketClientBlock'
import TicketOwnerPicker from './TicketOwnerPicker'
import TicketTeamPicker from './TicketTeamPicker'

type Props = {
  item: PeticionPendiente
  workshop: Workshop
  workspace: AdvisorWorkspace
  currentUser: { name: string; email: string }
  tickets?: PeticionPendiente[]
  readOnly?: boolean
  dragging?: boolean
  lite?: boolean
  showTeamPicker?: boolean
  onAssignTeam?: (peticionId: string, teamId: string | null) => void
  onPointerDown?: (event: ReactPointerEvent<HTMLElement>) => void
}

function formatCardWhen(iso: string | null | undefined, today: string): string {
  if (!iso) return 'Hoy'
  const day = String(iso).slice(0, 10)
  if (day !== today) return formatFecha(iso)
  try {
    const time = new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
    return Number.isNaN(new Date(iso).getTime()) ? 'Hoy' : `Hoy, ${time}`
  } catch {
    return 'Hoy'
  }
}

function ownerLabel(workspace: AdvisorWorkspace, email: string | null | undefined): string {
  const person = personByEmail(workspace, email || '')
  if (person?.name) return person.name
  const raw = String(email || '').trim()
  return raw || 'Sin dueño'
}

function TeamTicketCard({
  item,
  workshop,
  workspace,
  currentUser,
  tickets = [],
  readOnly = false,
  dragging = false,
  lite = false,
  showTeamPicker = false,
  onAssignTeam,
  onPointerDown,
}: Props) {
  const today = localTodayIso()
  const cita = item.cita
  const vehicle = cita ? [cita.marca, cita.modelo].filter(Boolean).join(' ') : ''

  return (
    <article
      data-ticket-id={item.idpeticion}
      className={`kanban-card glass glass-lite team-ticket-card${lite ? ' is-lite' : ''}${dragging ? ' is-dragging-source' : ''}${onPointerDown ? ' is-draggable' : ''}`}
      onPointerDown={onPointerDown}
    >
      <div className="kanban-card-top">
        {onPointerDown ? (
          <span className="kanban-drag-handle" aria-hidden>
            <GripVertical size={16} />
          </span>
        ) : null}
        <TicketPlate peticion={item} />
        <span className="kanban-day-chip">Hoy</span>
      </div>
      <TicketClientBlock peticion={item} size="md" />
      {item.tipopeticion ? <span className="kanban-card-meta">{item.tipopeticion}</span> : null}
      {vehicle ? <span className="kanban-card-meta">{vehicle}</span> : null}
      {lite ? (
        <p className="team-ticket-owner-line">{ownerLabel(workspace, item.gestionemail)}</p>
      ) : null}
      {readOnly || lite || !showTeamPicker || !onAssignTeam ? null : (
        <TicketTeamPicker
          workspace={workspace}
          ticket={item}
          onAssign={(teamId) => onAssignTeam(item.idpeticion, teamId)}
        />
      )}
      {lite ? null : (
        <TicketOwnerPicker
          workshop={workshop}
          workspace={workspace}
          currentUser={currentUser}
          appRole={readOnly ? 'asesor' : 'admin'}
          peticion={item}
          tickets={tickets}
          compact
        />
      )}
      <footer>
        <time dateTime={item.fechainicio ?? undefined}>{formatCardWhen(item.fechainicio, today)}</time>
        {lite ? <span>Arrastra al equipo</span> : null}
      </footer>
    </article>
  )
}

export default memo(TeamTicketCard)
