import { useEffect, useMemo, useRef, useState } from 'react'
import { UserRound } from 'lucide-react'
import type { CrmAppRole } from '../lib/crmRoles'
import { normalizeEmail, type AdvisorWorkspace } from '../lib/advisorWorkspace'
import { canReassignTicket, reassignTicketOwner, teammatesForReassign } from '../lib/ticketOps'
import { ownerSuggestCopy, suggestTicketOwner } from '../lib/ticketOwnerSuggest'
import type { PeticionPendiente } from '../lib/peticionesPendientes'
import type { Workshop } from '../types'

type Props = {
  workshop: Workshop
  workspace: AdvisorWorkspace
  currentUser: { name: string; email: string }
  appRole: CrmAppRole
  peticion: PeticionPendiente
  tickets?: PeticionPendiente[]
  compact?: boolean
  layout?: 'inline' | 'card'
}

const assignedOnOpen = new Set<string>()

export default function TicketOwnerPicker({
  workshop,
  workspace,
  currentUser,
  appRole,
  peticion,
  tickets = [],
  compact = false,
  layout = 'inline',
}: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const allowed = canReassignTicket(workspace, currentUser.email, appRole, peticion)
  const people = teammatesForReassign(workspace, currentUser.email, appRole)
  const value = normalizeEmail(peticion.gestionemail || '')
  const suggested = useMemo(
    () => suggestTicketOwner(workspace, peticion, tickets),
    [workspace, peticion, tickets],
  )
  const suggestedEmail = suggested ? normalizeEmail(suggested.person.email) : ''
  const suggestedAllowed =
    Boolean(suggestedEmail) && people.some((person) => normalizeEmail(person.email) === suggestedEmail)
  const displayEmail = value || (suggestedAllowed ? suggestedEmail : '')
  const currentName =
    people.find((person) => normalizeEmail(person.email) === displayEmail)?.name ||
    suggested?.person.name ||
    (value ? value : 'Sin dueño')
  const empty = !value
  const showSuggest = empty && suggestedAllowed && Boolean(suggested)
  const label = showSuggest ? 'Le tocaría' : 'Dueño del ticket'
  const applying = useRef(false)

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

  useEffect(() => {
    if (layout !== 'card' || !allowed || value || !suggestedAllowed || !suggestedEmail || applying.current) return
    if (assignedOnOpen.has(peticion.idpeticion)) return
    assignedOnOpen.add(peticion.idpeticion)
    applying.current = true
    void onChange(suggestedEmail).finally(() => {
      applying.current = false
    })
  }, [layout, allowed, value, suggestedAllowed, suggestedEmail, peticion.idpeticion])

  const options = (
    <>
      <option value="">Sin dueño</option>
      {people.map((person) => (
        <option key={person.id} value={normalizeEmail(person.email)}>
          {person.name}
          {showSuggest && suggestedEmail === normalizeEmail(person.email) ? ' · le tocaría' : ''}
        </option>
      ))}
    </>
  )

  if (layout === 'card') {
    return (
      <div
        className={`ticket-owner-card${allowed ? '' : ' is-readonly'}${showSuggest ? ' is-suggested' : ''}`}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <span className="ticket-owner-card-icon" aria-hidden>
          <UserRound size={18} />
        </span>
        <div className="ticket-owner-card-body">
          <span className="ticket-owner-card-label">{label}</span>
          {allowed ? (
            <select
              className="ticket-owner-card-select"
              value={displayEmail}
              disabled={busy}
              aria-label={label}
              onChange={(e) => void onChange(e.target.value)}
            >
              {options}
            </select>
          ) : (
            <strong className="ticket-owner-card-name">{currentName}</strong>
          )}
          {showSuggest && suggested ? (
            <span className="ticket-owner-hint">{ownerSuggestCopy(suggested.reason, suggested.person.name)}</span>
          ) : null}
          {error ? <span className="ticket-owner-error">{error}</span> : null}
        </div>
      </div>
    )
  }

  if (!allowed) {
    return (
      <span className={`ticket-owner-readonly${showSuggest ? ' is-suggested' : ''}`}>
        {showSuggest && suggested ? `${suggested.person.name} · le tocaría` : currentName}
      </span>
    )
  }

  return (
    <label
      className={`ticket-owner-picker${compact ? ' is-compact' : ''}${showSuggest ? ' is-suggested' : ''}`}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {compact ? null : <span className="filter-field-label">{label}</span>}
      <select
        className="field-select"
        value={displayEmail}
        disabled={busy}
        aria-label={showSuggest && suggested ? `Le tocaría ${suggested.person.name}` : 'Pasar ticket a otro asesor'}
        onChange={(e) => void onChange(e.target.value)}
      >
        {options}
      </select>
      {error ? <span className="ticket-owner-error">{error}</span> : null}
    </label>
  )
}
