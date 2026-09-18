import AppSelect from './AppSelect'
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
      className={`ticket-team-picker min-w-0 max-w-full ${compact ? 'is-compact block w-full' : 'flex flex-col gap-1'}`}
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
      <AppSelect
        variant={compact ? 'compact' : 'field'}
        value={assigned ?? ''}
        disabled={disabled}
        options={[
          { id: '', label: compact && inferred && !assigned ? inferred : emptyLabel },
          ...workspace.teams.map((team) => ({ id: team.id, label: team.name })),
        ]}
        onChange={(next) => onAssign(next || null)}
      />
    </label>
  )
}
