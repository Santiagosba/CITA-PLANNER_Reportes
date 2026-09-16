import { assignedTicketTeamId, type AdvisorWorkspace } from '../lib/advisorWorkspace'
import { ticketTeamLabel } from '../lib/teamScope'
import type { PeticionPendiente } from '../lib/peticionesPendientes'

type Props = {
  workspace: AdvisorWorkspace
  ticket: Pick<PeticionPendiente, 'idpeticion' | 'gestionemail' | 'tipopeticion'>
  onAssign: (teamId: string | null) => void
  disabled?: boolean
}

export default function TicketTeamPicker({ workspace, ticket, onAssign, disabled }: Props) {
  if (workspace.teams.length === 0) return null
  const assigned = assignedTicketTeamId(workspace, ticket.idpeticion)
  const inferred = ticketTeamLabel(workspace, ticket)

  return (
    <label
      className="ticket-team-picker flex min-w-0 flex-col gap-1"
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <span className="filter-field-label block min-h-[18px] text-[13px] font-semibold leading-tight text-avi-fog-strong">
        Equipo
      </span>
      <select
        className="field-select"
        value={assigned ?? ''}
        disabled={disabled}
        aria-label="Meter este ticket en un equipo"
        onChange={(event) => onAssign(event.target.value || null)}
      >
        <option value="">{assigned ? 'Quitar equipo fijo' : inferred ? `Automático · ${inferred}` : 'Elige un equipo'}</option>
        {workspace.teams.map((team) => (
          <option key={team.id} value={team.id}>
            {team.name}
          </option>
        ))}
      </select>
    </label>
  )
}
