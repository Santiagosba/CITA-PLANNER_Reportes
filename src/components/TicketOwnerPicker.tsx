import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, UserRound } from 'lucide-react'
import type { CrmAppRole } from '../lib/crmRoles'
import {
  isPersonOnTeam,
  normalizeEmail,
  type AdvisorPerson,
  type AdvisorTeam,
  type AdvisorWorkspace,
} from '../lib/advisorWorkspace'
import {
  canReassignTicket,
  claimTicket,
  reassignTicketOwner,
  releaseTicketToRightOwner,
  teammatesForReassign,
} from '../lib/ticketOps'
import { ownerSuggestCopy, suggestTicketOwner } from '../lib/ticketOwnerSuggest'
import { ticketTeamLabel } from '../lib/teamScope'
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

type OwnerGroup = {
  team: AdvisorTeam | null
  members: AdvisorPerson[]
}

const assignedOnOpen = new Set<string>()

function groupedTeammates(workspace: AdvisorWorkspace, people: AdvisorPerson[]): OwnerGroup[] {
  const seen = new Set<string>()
  const groups = workspace.teams
    .map((team) => {
      const members = people.filter((person) => isPersonOnTeam(workspace, team, person.id, person.email))
      members.forEach((person) => seen.add(person.id))
      return { team, members }
    })
    .filter((group) => group.members.length > 0)
  const loose = people.filter((person) => !seen.has(person.id))
  return loose.length > 0 ? [...groups, { team: null, members: loose }] : groups
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name
}

function OwnerSelect({
  value,
  label,
  currentName,
  disabled,
  variant,
  suggested,
  compact,
  groups,
  suggestedEmail,
  onChange,
}: {
  value: string
  label: string
  currentName: string
  disabled?: boolean
  variant: 'field' | 'plain'
  suggested?: boolean
  compact?: boolean
  groups: OwnerGroup[]
  suggestedEmail: string
  onChange: (next: string) => void
}) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ top: 0, left: 0, width: 280, maxH: 280 })

  useEffect(() => {
    if (!open) return
    const place = () => {
      const trigger = triggerRef.current
      if (!trigger) return
      const rect = trigger.getBoundingClientRect()
      const width = Math.min(300, Math.max(260, window.innerWidth - 24))
      const below = window.innerHeight - rect.bottom - 12
      const above = rect.top - 12
      const openUp = below < 200 && above > below
      const maxH = Math.min(360, Math.max(160, openUp ? above : below))
      const top = openUp ? Math.max(12, rect.top - maxH - 6) : rect.bottom + 6
      const left = Math.min(Math.max(12, rect.left), window.innerWidth - width - 12)
      setPos({ top, left, width, maxH })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      const node = event.target as Node
      if (triggerRef.current?.contains(node) || menuRef.current?.contains(node)) return
      setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const pick = (next: string) => {
    setOpen(false)
    if (next !== value) onChange(next)
  }

  const menu = open
    ? createPortal(
        <div
          ref={menuRef}
          className="ticket-owner-menu glass glass-lite squircle box-border flex flex-col overflow-x-hidden overflow-y-auto p-1.5"
          role="listbox"
          aria-label={label}
          style={{ top: pos.top, left: pos.left, width: pos.width, maxHeight: pos.maxH }}
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            role="option"
            className={`ticket-owner-menu-item flex h-10 min-h-10 w-full items-center px-2.5 text-left text-[14px] font-medium${value === '' ? ' is-active' : ''}`}
            aria-selected={value === ''}
            onClick={() => pick('')}
          >
            Sin dueño
          </button>
          {groups.map((group) => (
            <div key={group.team?.id ?? 'loose'} className="ticket-owner-menu-group flex min-w-0 flex-col">
              <p
                className="ticket-owner-menu-heading min-w-0 truncate px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.04em] text-avi-muted"
                title={group.team?.name || 'Sin equipo'}
              >
                {group.team?.name || 'Sin equipo'}
              </p>
              {group.members.map((person) => {
                const email = normalizeEmail(person.email)
                const hint = suggestedEmail === email ? 'Le tocaría' : ''
                return (
                  <button
                    key={`${group.team?.id ?? 'loose'}-${person.id}`}
                    type="button"
                    role="option"
                    className={`ticket-owner-menu-item flex h-10 min-h-10 w-full min-w-0 items-center gap-2 overflow-hidden px-2.5 text-left${value === email ? ' is-active' : ''}${hint ? ' is-suggested' : ''}`}
                    aria-selected={value === email}
                    onClick={() => pick(email)}
                  >
                    <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{person.name}</span>
                    {hint ? <small className="shrink-0 text-[11px] font-semibold">Le tocaría</small> : null}
                  </button>
                )
              })}
            </div>
          ))}
        </div>,
        document.body,
      )
    : null

  const triggerName = compact ? firstName(currentName) : currentName

  return (
    <div className={`ticket-owner-select is-${variant}${compact ? ' is-compact' : ''}${suggested ? ' is-suggested' : ''} min-w-0`}>
      <button
        ref={triggerRef}
        type="button"
        className={`ticket-owner-select-trigger${open ? ' is-open' : ''} ${
          compact
            ? 'inline-flex h-8 max-w-[9.5rem] items-center gap-1 rounded-full px-2.5 text-[13px] font-medium text-avi-muted'
            : 'inline-flex min-h-tap w-full items-center justify-between gap-2'
        }`}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}: ${currentName}`}
        title={currentName}
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          setOpen((current) => !current)
        }}
      >
        <span className="min-w-0 truncate">{triggerName}</span>
        <ChevronDown size={compact ? 14 : 16} className="shrink-0 opacity-60" aria-hidden />
      </button>
      {menu}
    </div>
  )
}

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
  const myEmail = normalizeEmail(currentUser.email)
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
  const mine = Boolean(value && value === myEmail)
  const showSuggest = empty && suggestedAllowed && Boolean(suggested)
  const label = showSuggest ? 'Le tocaría' : 'Dueño del ticket'
  const applying = useRef(false)
  const grouped = useMemo(() => groupedTeammates(workspace, people), [workspace, people])
  const teamLabel = ticketTeamLabel(workspace, peticion)
  const teamLine = teamLabel ? <span className="ticket-owner-team">Grupo {teamLabel}</span> : null

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

  const onClaim = async () => {
    setBusy(true)
    setError(null)
    try {
      await claimTicket(workshop, workspace, currentUser, appRole, peticion)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo coger el ticket.')
    } finally {
      setBusy(false)
    }
  }

  const onRelease = async () => {
    setBusy(true)
    setError(null)
    try {
      await releaseTicketToRightOwner(workshop, workspace, currentUser, appRole, peticion, tickets)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo dejar el ticket.')
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

  const select = (
    <OwnerSelect
      value={displayEmail}
      label={showSuggest && suggested ? `Le tocaría ${suggested.person.name}` : label}
      currentName={showSuggest && suggested ? `${suggested.person.name}` : currentName}
      disabled={busy}
      variant={layout === 'card' ? 'plain' : 'field'}
      suggested={showSuggest}
      compact={compact}
      groups={grouped}
      suggestedEmail={suggestedEmail}
      onChange={(next) => void onChange(next)}
    />
  )

  const actions =
    allowed && appRole === 'asesor' ? (
      <div className="ticket-owner-actions flex shrink-0 items-center gap-1">
        {empty ? (
          <button
            type="button"
            className="ghost-button h-8 min-h-8 px-2 text-[12px] font-medium"
            disabled={busy}
            onClick={() => void onClaim()}
          >
            Coger
          </button>
        ) : null}
        {mine || (!empty && value !== myEmail) ? (
          <button
            type="button"
            className="ghost-button h-8 min-h-8 px-2 text-[12px] font-medium"
            disabled={busy}
            onClick={() => void onRelease()}
          >
            No es mío
          </button>
        ) : null}
      </div>
    ) : null

  if (layout === 'card') {
    return (
      <div
        className={`ticket-owner-card flex items-start gap-3${allowed ? '' : ' is-readonly'}${showSuggest ? ' is-suggested' : ''}`}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <span className="ticket-owner-card-icon" aria-hidden>
          <UserRound size={18} />
        </span>
        <div className="ticket-owner-card-body flex min-w-0 flex-1 flex-col gap-1">
          <span className="ticket-owner-card-label text-[11px] font-semibold uppercase tracking-[0.04em] text-avi-muted">{label}</span>
          <div className="ticket-owner-card-row flex min-w-0 flex-wrap items-center gap-2">
            {allowed ? select : <strong className="ticket-owner-card-name">{currentName}</strong>}
            {actions}
          </div>
          {teamLine}
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
      <span className={`ticket-owner-readonly text-[13px] font-semibold text-avi-muted${showSuggest ? ' is-suggested' : ''}`}>
        {showSuggest && suggested
          ? `${suggested.person.name} · le tocaría`
          : currentName}
        {teamLine}
      </span>
    )
  }

  return (
    <div
      className={`ticket-owner-picker${compact ? ' is-compact w-auto max-w-none' : ''}${showSuggest ? ' is-suggested' : ''} flex min-w-0 flex-col gap-1`}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {compact ? null : <span className="filter-field-label">{label}</span>}
      <div className="ticket-owner-main flex min-w-0 items-center gap-2">
        {select}
        {actions}
      </div>
      {compact ? null : teamLine}
      {error ? <span className="ticket-owner-error">{error}</span> : null}
    </div>
  )
}
