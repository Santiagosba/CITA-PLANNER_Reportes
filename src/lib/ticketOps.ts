import type { CrmAppRole } from './crmRoles'
import {
  normalizeEmail,
  personByEmail,
  teamsForEmail,
  type AdvisorPerson,
  type AdvisorWorkspace,
} from './advisorWorkspace'
import { isDemoTicketId, patchDemoTicket } from './demoTickets'
import { suggestTicketOwner } from './ticketOwnerSuggest'
import {
  classifyOwnerEmail,
  buildOwnerScopeContext,
} from './ownerScope'
import {
  updatePeticionGestion,
  type GestionPatch,
  type PeticionPendiente,
} from './peticionesPendientes'
import { patchPeticionInCopy, workshopCopyId } from './workingCopy'
import type { Workshop } from '../types'

export const PETICIONES_PATCHED_EVENT = 'avi-peticiones-patched'

export function teammatesForReassign(
  workspace: AdvisorWorkspace,
  email: string,
  role: CrmAppRole,
): AdvisorPerson[] {
  if (role === 'admin') return workspace.people
  const me = personByEmail(workspace, email)
  if (!me) return []
  const memberIds = new Set<string>()
  for (const team of teamsForEmail(workspace, email)) {
    for (const id of team.memberIds) memberIds.add(id)
  }
  if (memberIds.size === 0) return [me]
  const fromIds = workspace.people.filter((person) => memberIds.has(person.id))
  if (fromIds.length) return fromIds
  return workspace.people.filter((person) =>
    teamsForEmail(workspace, person.email).some((team) => memberIds.has(team.id) || team.memberIds.includes(person.id)),
  )
}

export function canReassignTicket(
  workspace: AdvisorWorkspace,
  email: string,
  role: CrmAppRole,
  peticion: PeticionPendiente,
): boolean {
  if (role === 'admin') return true
  const ctx = buildOwnerScopeContext(workspace, email)
  const scope = classifyOwnerEmail(peticion.gestionemail, ctx)
  return scope === 'mias' || scope === 'grupo' || scope === 'sin_dueno'
}

export function notifyPeticionPatched(
  workshop: Workshop,
  idpeticion: string,
  patch: Partial<PeticionPendiente>,
): void {
  patchPeticionInCopy(workshopCopyId(workshop), idpeticion, patch)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(PETICIONES_PATCHED_EVENT, {
        detail: { idpeticion, patch },
      }),
    )
  }
}

export async function applyPeticionPatch(
  workshop: Workshop,
  peticion: PeticionPendiente,
  patch: GestionPatch,
): Promise<Partial<PeticionPendiente>> {
  const next: Partial<PeticionPendiente> = {
    gestionado: patch.gestionado,
    gestionobservaciones: patch.gestionobservaciones ?? peticion.gestionobservaciones,
    gestionemail: patch.gestionemail === undefined ? peticion.gestionemail : patch.gestionemail || null,
    gestionfecha: patch.gestionado ? new Date().toISOString() : peticion.gestionfecha,
  }

  if (isDemoTicketId(peticion.idpeticion)) {
    patchDemoTicket(workshop, peticion.idpeticion, next)
    notifyPeticionPatched(workshop, peticion.idpeticion, next)
    return next
  }

  await updatePeticionGestion(peticion.idpeticion, patch)
  notifyPeticionPatched(workshop, peticion.idpeticion, next)
  return next
}

export async function reassignTicketOwner(
  workshop: Workshop,
  workspace: AdvisorWorkspace,
  actor: { email: string },
  role: CrmAppRole,
  peticion: PeticionPendiente,
  nextEmail: string,
): Promise<Partial<PeticionPendiente>> {
  if (!canReassignTicket(workspace, actor.email, role, peticion)) {
    throw new Error('No puedes pasar este ticket. Solo los de tu equipo o los que no tienen dueño.')
  }
  const email = normalizeEmail(nextEmail)
  if (email && role === 'asesor') {
    const allowed = teammatesForReassign(workspace, actor.email, role)
    if (!allowed.some((person) => normalizeEmail(person.email) === email)) {
      throw new Error('Solo puedes pasarlo a alguien de tu equipo.')
    }
  }
  return applyPeticionPatch(workshop, peticion, {
    gestionado: Boolean(peticion.gestionado),
    gestionemail: email,
    gestionobservaciones: peticion.gestionobservaciones ?? undefined,
  })
}

/** El asesor coge un ticket suelto o del equipo. */
export async function claimTicket(
  workshop: Workshop,
  workspace: AdvisorWorkspace,
  actor: { email: string },
  role: CrmAppRole,
  peticion: PeticionPendiente,
): Promise<Partial<PeticionPendiente>> {
  return reassignTicketOwner(workshop, workspace, actor, role, peticion, actor.email)
}

/** Lo deja para el asesor que le tocaría, o suelto si no hay uno claro. */
export async function releaseTicketToRightOwner(
  workshop: Workshop,
  workspace: AdvisorWorkspace,
  actor: { email: string },
  role: CrmAppRole,
  peticion: PeticionPendiente,
  tickets: PeticionPendiente[] = [],
): Promise<Partial<PeticionPendiente>> {
  const suggested = suggestTicketOwner(
    workspace,
    { ...peticion, gestionemail: '' },
    tickets,
  )
  const next =
    suggested && normalizeEmail(suggested.person.email) !== normalizeEmail(actor.email)
      ? suggested.person.email
      : ''
  return reassignTicketOwner(workshop, workspace, actor, role, peticion, next)
}
