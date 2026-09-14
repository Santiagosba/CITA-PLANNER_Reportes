import { isPersonOnTeam, normalizeEmail, personByEmail, type AdvisorPerson, type AdvisorTeam, type AdvisorWorkspace } from './advisorWorkspace'
import { teamForTicketType } from './teamScope'
import { phoneMatchKey } from './ticketClient'
import type { PeticionPendiente } from './peticionesPendientes'

export type OwnerSuggestReason = 'cliente' | 'equipo' | 'carga'

export type SuggestedTicketOwner = {
  person: AdvisorPerson
  reason: OwnerSuggestReason
}

function membersOf(
  workspace: AdvisorWorkspace,
  team: AdvisorTeam | undefined,
): AdvisorPerson[] {
  if (!team) return workspace.people
  const members = workspace.people.filter((person) => isPersonOnTeam(workspace, team, person.id, person.email))
  return members.length ? members : workspace.people
}

function lastOwnerForPhone(
  workspace: AdvisorWorkspace,
  ticket: Pick<PeticionPendiente, 'idpeticion' | 'caller'>,
  tickets: PeticionPendiente[],
): AdvisorPerson | undefined {
  const phone = phoneMatchKey(ticket.caller)
  if (!phone) return undefined
  const previous = tickets
    .filter(
      (row) =>
        row.idpeticion !== ticket.idpeticion &&
        phoneMatchKey(row.caller) === phone &&
        Boolean(row.gestionemail),
    )
    .sort((a, b) => String(b.fechainicio || '').localeCompare(String(a.fechainicio || '')))
  const email = previous[0]?.gestionemail
  return email ? personByEmail(workspace, email) : undefined
}

function openTicketCount(email: string, tickets: PeticionPendiente[]): number {
  const key = normalizeEmail(email)
  return tickets.reduce((count, row) => {
    if (row.gestionado) return count
    return normalizeEmail(row.gestionemail || '') === key ? count + 1 : count
  }, 0)
}

function leastLoaded(
  members: AdvisorPerson[],
  tickets: PeticionPendiente[],
  ticketId: string,
): AdvisorPerson {
  if (members.length === 1) return members[0]
  const ranked = [...members].sort((a, b) => {
    const delta = openTicketCount(a.email, tickets) - openTicketCount(b.email, tickets)
    if (delta !== 0) return delta
    return a.name.localeCompare(b.name, 'es')
  })
  if (tickets.length > 0) return ranked[0]
  let hash = 0
  for (const char of ticketId) hash = (hash + char.charCodeAt(0)) % members.length
  return members[hash] ?? members[0]
}

/** Asesor que le tocaría el ticket si aún no tiene dueño. */
export function suggestTicketOwner(
  workspace: AdvisorWorkspace,
  ticket: Pick<PeticionPendiente, 'idpeticion' | 'caller' | 'tipopeticion' | 'gestionemail'>,
  tickets: PeticionPendiente[] = [],
): SuggestedTicketOwner | null {
  const current = personByEmail(workspace, ticket.gestionemail || '')
  if (current) return { person: current, reason: 'cliente' }

  const fromPhone = lastOwnerForPhone(workspace, ticket, tickets)
  if (fromPhone) return { person: fromPhone, reason: 'cliente' }

  const team = teamForTicketType(workspace, ticket.tipopeticion)
  const members = membersOf(workspace, team)
  if (!members.length) return null
  const person = leastLoaded(members, tickets, ticket.idpeticion)
  return { person, reason: team ? 'equipo' : 'carga' }
}

export function ownerSuggestCopy(reason: OwnerSuggestReason, name: string): string {
  if (reason === 'cliente') return `Le tocaría ${name}: ya atendió a este cliente.`
  if (reason === 'equipo') return `Le tocaría ${name}: es de su equipo y tipo.`
  return `Le tocaría ${name}: es quien menos tickets abiertos tiene.`
}
