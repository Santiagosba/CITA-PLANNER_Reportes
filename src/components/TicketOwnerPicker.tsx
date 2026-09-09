import { useState } from 'react'
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
}

export default function TicketOwnerPicker({
  workshop,
  workspace,
  currentUser,
  appRole,
  peticion,
  compact = false,
}: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const allowed = canReassignTicket(workspace, currentUser.email, appRole, peticion)
  const people = teammatesForReassign(workspace, currentUser.email, appRole)
  const value = normalizeEmail(peticion.gestionemail || '')
  const currentName =
    people.find((person) => normalizeEmail(person.email) === value)?.name ||
    (value ? value : 'Sin dueño')

  if (!allowed) {
    return <span className="ticket-owner-readonly">{currentName}</span>
  }

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
