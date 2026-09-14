/**
 * Un ticket es de un equipo si su dueño está en ese grupo,
 * o si no tiene dueño y el tipo de consulta encaja con el equipo.
 */

import type { CrmAppRole } from './crmRoles'
import {
  boardsForTeam,
  normalizeEmail,
  personByEmail,
  teamMemberEmails,
  teamsForEmail,
  teamsForPerson,
  typesForTeam,
  type AdvisorTeam,
  type AdvisorWorkspace,
} from './advisorWorkspace'
import type { PeticionPendiente } from './peticionesPendientes'

export const TEAM_FILTER_ALL = 'todos'
export const TEAM_FILTER_LOOSE = 'sueltos'

export type TeamFilterId = typeof TEAM_FILTER_ALL | typeof TEAM_FILTER_LOOSE | string

function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function tokens(value: string): string[] {
  return fold(value)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2)
}

function extraTypeTokens(label: string): string[] {
  const extra: string[] = []
  if (/voz|laura|llamad|call|tfno|telefon|consulta|revision|itv|averia|ruido|testigo/.test(label)) {
    extra.push('llamada', 'recepcion')
  }
  if (/whats|wa\b/.test(label)) extra.push('whatsapp', 'recepcion')
  if (/perit|siniest|seguro/.test(label)) extra.push('peritaje', 'recepcion')
  if (/cita|agenda/.test(label)) extra.push('cita')
  if (/seguim|estado/.test(label)) extra.push('seguimiento')
  if (/recamb|flota/.test(label)) extra.push('recambios', 'comercial')
  if (/\bvn\b|\bvo\b|venta/.test(label)) extra.push('ventas', 'comercial')
  if (/chapa|carro|pintura/.test(label)) extra.push('carroceria', 'recepcion')
  if (/mecanic|diagnosis/.test(label)) extra.push('mecanica', 'recepcion')
  if (label && extra.length === 0) extra.push('llamada', 'recepcion')
  return extra
}

function receptionLikeTeams(workspace: AdvisorWorkspace): AdvisorTeam[] {
  const hits = workspace.teams.filter((team) =>
    teamTypeTokens(workspace, team).some((token) => token.includes('recepcion') || token.includes('llamada')),
  )
  return hits.length ? hits : workspace.teams
}

function teamTypeTokens(workspace: AdvisorWorkspace, team: AdvisorTeam): string[] {
  return [
    ...typesForTeam(workspace, team).flatMap((item) => tokens(item.name)),
    ...boardsForTeam(workspace, team).flatMap((item) => tokens(item.name)),
    ...tokens(team.name),
  ]
}

export function teamsMatchingTicketType(
  workspace: AdvisorWorkspace,
  tipopeticion: string | null | undefined,
): AdvisorTeam[] {
  const label = fold(tipopeticion || '')
  if (!workspace.teams.length) return []
  if (!label) return workspace.teams.length === 1 ? [workspace.teams[0]] : []

  const ticketTokens = [...new Set([...tokens(label), ...extraTypeTokens(label)])]
  if (!ticketTokens.length) return receptionLikeTeams(workspace)
  const hits = workspace.teams.filter((team) => {
    const catalog = teamTypeTokens(workspace, team)
    return ticketTokens.some((token) => catalog.some((name) => name.includes(token) || token.includes(name)))
  })
  return hits.length ? hits : receptionLikeTeams(workspace)
}

export function teamForTicketType(
  workspace: AdvisorWorkspace,
  tipopeticion: string | null | undefined,
): AdvisorTeam | undefined {
  const hits = teamsMatchingTicketType(workspace, tipopeticion)
  if (hits.length === 1) return hits[0]
  if (!hits.length && workspace.teams.length === 1) return workspace.teams[0]
  return hits[0]
}

export function visibleTeamsForUser(
  workspace: AdvisorWorkspace,
  email: string,
  role: CrmAppRole,
): AdvisorTeam[] {
  if (role === 'admin') return workspace.teams
  return teamsForEmail(workspace, email)
}

export function ticketTeamIds(
  workspace: AdvisorWorkspace,
  ticket: Pick<PeticionPendiente, 'gestionemail' | 'tipopeticion'>,
): string[] {
  const ownerEmail = normalizeEmail(ticket.gestionemail || '')
  if (ownerEmail) {
    const byMember = workspace.teams.filter((team) => teamMemberEmails(workspace, team).includes(ownerEmail))
    if (byMember.length) return byMember.map((team) => team.id)
    const owned = teamsForEmail(workspace, ownerEmail)
    if (owned.length) return owned.map((team) => team.id)
    const owner = personByEmail(workspace, ownerEmail)
    if (owner) {
      const byPerson = teamsForPerson(workspace, owner.id)
      if (byPerson.length) return byPerson.map((team) => team.id)
    }
  }
  return teamsMatchingTicketType(workspace, ticket.tipopeticion).map((team) => team.id)
}

export function ticketTeamLabel(
  workspace: AdvisorWorkspace,
  ticket: Pick<PeticionPendiente, 'gestionemail' | 'tipopeticion'>,
): string {
  return ticketTeamIds(workspace, ticket)
    .map((id) => workspace.teams.find((team) => team.id === id)?.name)
    .filter((name): name is string => Boolean(name))
    .join(' · ')
}

export function inferredTicketTeamId(
  workspace: AdvisorWorkspace,
  ticket: Pick<PeticionPendiente, 'gestionemail' | 'tipopeticion'>,
): string | null {
  return ticketTeamIds(workspace, ticket)[0] ?? null
}

export function matchesTeamFilter(
  workspace: AdvisorWorkspace,
  ticket: Pick<PeticionPendiente, 'gestionemail' | 'tipopeticion'>,
  filter: TeamFilterId,
  role: CrmAppRole,
  email: string,
): boolean {
  const mine = visibleTeamsForUser(workspace, email, role)
  const ownerEmail = normalizeEmail(ticket.gestionemail || '')

  if (filter === TEAM_FILTER_ALL) {
    if (role === 'admin') return true
    if (mine.length === 0) return false
    if (!ownerEmail) {
      const inferred = ticketTeamIds(workspace, ticket)
      return inferred.length === 0 || inferred.some((id) => mine.some((team) => team.id === id))
    }
    return ticketTeamIds(workspace, ticket).some((id) => mine.some((team) => team.id === id))
  }

  if (filter === TEAM_FILTER_LOOSE) {
    if (ownerEmail) return false
    if (role === 'admin') return true
    const inferred = ticketTeamIds(workspace, ticket)
    return inferred.length === 0 || inferred.some((id) => mine.some((team) => team.id === id))
  }

  if (role === 'asesor' && !mine.some((team) => team.id === filter)) return false
  return ticketTeamIds(workspace, ticket).includes(filter)
}

export function teamWorkloadRows(
  items: PeticionPendiente[],
  workspace: AdvisorWorkspace,
  role: CrmAppRole,
  email: string,
): { key: string; label: string; value: number }[] {
  const teams = visibleTeamsForUser(workspace, email, role)
  const rows = teams.map((team) => ({
    key: team.id,
    label: team.name,
    value: items.filter((item) => matchesTeamFilter(workspace, item, team.id, role, email)).length,
  }))
  const loose = items.filter((item) => matchesTeamFilter(workspace, item, TEAM_FILTER_LOOSE, role, email)).length
  if (loose > 0) rows.push({ key: TEAM_FILTER_LOOSE, label: 'Sin dueño', value: loose })
  return rows.filter((row) => row.value > 0)
}

export function teamFilterEmptyCopy(filter: TeamFilterId): string {
  if (filter === TEAM_FILTER_LOOSE) return 'No hay tickets sueltos con este filtro.'
  if (filter === TEAM_FILTER_ALL) return 'No hay tickets de tus equipos en este periodo.'
  return 'Este equipo no tiene tickets en este periodo.'
}
