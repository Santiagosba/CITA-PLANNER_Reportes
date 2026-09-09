/**
 * Filtro de dueño para tickets (gestionemail) y tareas asignadas.
 * Mías / del grupo / de otros compañeros / sin dueño.
 */

import {
  normalizeEmail,
  personByEmail,
  personById,
  type AdvisorWorkspace,
  type AssignedTask,
} from './advisorWorkspace'

export type OwnerScope = 'todas' | 'mias' | 'grupo' | 'companeros' | 'sin_dueno'

export const OWNER_SCOPE_OPTIONS: { id: OwnerScope; label: string }[] = [
  { id: 'todas', label: 'Todas' },
  { id: 'mias', label: 'Mías' },
  { id: 'grupo', label: 'Del grupo' },
  { id: 'companeros', label: 'Compañeros' },
  { id: 'sin_dueno', label: 'Sin dueño' },
]

export type OwnerScopeContext = {
  myEmail: string
  teamEmails: Set<string>
}

export function buildOwnerScopeContext(
  workspace: AdvisorWorkspace,
  email: string,
): OwnerScopeContext {
  const myEmail = normalizeEmail(email)
  const me = personByEmail(workspace, myEmail)
  const teamEmails = new Set<string>()
  if (me) {
    for (const team of workspace.teams) {
      if (!team.memberIds.includes(me.id)) continue
      for (const memberId of team.memberIds) {
        const person = personById(workspace, memberId)
        const memberEmail = normalizeEmail(person?.email ?? '')
        if (memberEmail && memberEmail !== myEmail) teamEmails.add(memberEmail)
      }
    }
  }
  return { myEmail, teamEmails }
}

export function classifyOwnerEmail(
  email: string | null | undefined,
  ctx: OwnerScopeContext,
): Exclude<OwnerScope, 'todas'> {
  const key = normalizeEmail(email ?? '')
  if (!key) return 'sin_dueno'
  if (ctx.myEmail && key === ctx.myEmail) return 'mias'
  if (ctx.teamEmails.has(key)) return 'grupo'
  return 'companeros'
}

export function matchesOwnerScope(
  email: string | null | undefined,
  scope: OwnerScope,
  ctx: OwnerScopeContext,
): boolean {
  if (scope === 'todas') return true
  const kind = classifyOwnerEmail(email, ctx)
  if (scope === 'grupo') return kind === 'mias' || kind === 'grupo'
  return kind === scope
}

export function taskOwnerEmail(workspace: AdvisorWorkspace, task: AssignedTask): string | null {
  if (!task.assigneeId) return null
  return personById(workspace, task.assigneeId)?.email ?? null
}

export function matchesTaskOwnerScope(
  task: AssignedTask,
  scope: OwnerScope,
  workspace: AdvisorWorkspace,
  ctx: OwnerScopeContext,
): boolean {
  return matchesOwnerScope(taskOwnerEmail(workspace, task), scope, ctx)
}

export function ownerScopeEmptyCopy(scope: OwnerScope): string {
  switch (scope) {
    case 'mias':
      return 'No hay nada tuyo en este periodo.'
    case 'grupo':
      return 'No hay tickets o tareas de tu equipo.'
    case 'companeros':
      return 'No hay nada de otros compañeros en este periodo.'
    case 'sin_dueno':
      return 'No hay tickets o tareas sin dueño.'
    default:
      return 'No hay nada en este periodo.'
  }
}
