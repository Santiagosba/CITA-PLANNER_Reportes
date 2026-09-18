import { ticketTeamLabel } from '../lib/teamScope'
import type { AdvisorWorkspace } from '../lib/advisorWorkspace'
import type { PeticionPendiente } from '../lib/peticionesPendientes'

type Props = {
  workspace: AdvisorWorkspace
  ticket: Pick<PeticionPendiente, 'idpeticion' | 'gestionemail' | 'tipopeticion'>
  className?: string
}

export default function TicketTeamBadge({ workspace, ticket, className = '' }: Props) {
  const label = ticketTeamLabel(workspace, ticket)
  if (!label) return null
  return (
    <span className={`badge tone-neutral max-w-full min-w-0 truncate ${className}`.trim()} title={label}>
      {label}
    </span>
  )
}
