import { assignedTicketTeamId, type AdvisorWorkspace } from '../lib/advisorWorkspace'
import { ticketTeamLabel } from '../lib/teamScope'
import type { PeticionPendiente } from '../lib/peticionesPendientes'

type Props = {
  workspace: AdvisorWorkspace
  ticket: Pick<PeticionPendiente, 'idpeticion' | 'gestionemail' | 'tipopeticion'>
  onAssign: (teamId: string | null) => void
  disabled?: boolean
  compact?: boolean
}

export default function TicketTeamPicker({ workspace, ticket, onAssign, disabled, compact = false }: Props) {
  if (workspace.teams.length === 0) return null
  const assigned = assignedTicketTeamId(workspace, ticket.idpeticion)
  const inferred = ticketTeamLabel(workspace, ticket)
  const emptyLabel = assigned ? 'Quitar equipo fijo' : inferred ? `Automático · ${inferred}` : 'Elige un equipo'

  return (
    <label
      className={`ticket-team-picker min-w-0 ${compact ? 'is-compact block' : 'flex flex-col gap-1'}`}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {compact ? (
        <span className="sr-only">Equipo</span>
      ) : (
        <span className="filter-field-label block min-h-[18px] text-[13px] font-semibold leading-tight text-avi-fog-strong">
          Equipo
        </span>
      )}
      <select
        className={
          compact
            ? 'field-select h-9 min-h-9 w-full min-w-0 max-w-full truncate px-3 text-sm font-semibold'
            : 'field-select'
        }
        value={assigned ?? ''}
        disabled={disabled}
        aria-label="Meter este ticket en un equipo"
        title={emptyLabel}
        onChange={(event) => onAssign(event.target.value || null)}
      >
        <option value="">{compact && inferred && !assigned ? inferred : emptyLabel}</option>
        {workspace.teams.map((team) => (
          <option key={team.id} value={team.id}>
            {team.name}
          </option>
        ))}
      </select>
    </label>
  )
}
