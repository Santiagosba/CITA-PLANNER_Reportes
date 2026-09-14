import { useState } from 'react'
import { UserRound } from 'lucide-react'
import type { CrmAppRole } from '../lib/crmRoles'
import { normalizeEmail, type AdvisorWorkspace } from '../lib/advisorWorkspace'
import { canReassignTicket, reassignTicketOwner, teammatesForReassign } from '../lib/ticketOps'
import type { PeticionPendiente } from '../lib/peticionesPendientes'
import type { Workshop } from '../types'

type Props = {
  workshop: Workshop
  workspace: AdvisorWorkspace
  currentUser: { name: string; email: string }
  appRole: CrmAppRole
  peticion: PeticionPendiente
  compact?: boolean
  layout?: 'inline' | 'card'
}

export default function TicketOwnerPicker({
  workshop,
  workspace,
  currentUser,
  appRole,
  peticion,
  compact = false,
  layout = 'inline',
}: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const allowed = canReassignTicket(workspace, currentUser.email, appRole, peticion)
  const people = teammatesForReassign(workspace, currentUser.email, appRole)
  const value = normalizeEmail(peticion.gestionemail || '')
  const currentName =
    people.find((person) => normalizeEmail(person.email) === value)?.name ||
    (value ? value : 'Sin dueño')

  const onChange = async (next: string) => {
    setBusy(true)
    setError(null)
    try {
      await reassignTicketOwner(workshop, workspace, currentUser, appRole, peticion, next)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo pasar el ticket.')
    } finally {
      setBusy(false)
    }
  }

  if (layout === 'card') {
    return (
      <div
        className={`ticket-owner-card${allowed ? '' : ' is-readonly'}`}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <span className="ticket-owner-card-icon" aria-hidden>
          <UserRound size={18} />
        </span>
        <div className="ticket-owner-card-body">
          <span className="ticket-owner-card-label">Dueño del ticket</span>
          {allowed ? (
            <select
              className="ticket-owner-card-select"
              value={value}
              disabled={busy}
              aria-label="Dueño del ticket"
              onChange={(e) => void onChange(e.target.value)}
            >
              <option value="">Sin dueño</option>
              {people.map((person) => (
                <option key={person.id} value={normalizeEmail(person.email)}>
                  {person.name}
                </option>
              ))}
            </select>
          ) : (
            <strong className="ticket-owner-card-name">{currentName}</strong>
          )}
          {error ? <span className="ticket-owner-error">{error}</span> : null}
        </div>
      </div>
    )
  }

  if (!allowed) {
    return <span className="ticket-owner-readonly">{currentName}</span>
  }

  return (
    <label
      className={`ticket-owner-picker${compact ? ' is-compact' : ''}`}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {compact ? null : <span className="filter-field-label">Dueño</span>}
      <select
        className="field-select"
        value={value}
        disabled={busy}
        aria-label="Pasar ticket a otro asesor"
        onChange={(e) => void onChange(e.target.value)}
      >
        <option value="">Sin dueño</option>
        {people.map((person) => (
          <option key={person.id} value={normalizeEmail(person.email)}>
            {person.name}
          </option>
        ))}
      </select>
      {error ? <span className="ticket-owner-error">{error}</span> : null}
    </label>
  )
}
