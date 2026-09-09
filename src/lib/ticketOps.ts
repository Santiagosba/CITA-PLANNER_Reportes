import type { CrmAppRole } from './crmRoles'
import {
  normalizeEmail,
  personByEmail,
  type AdvisorPerson,
  type AdvisorWorkspace,
} from './advisorWorkspace'
import { isDemoTicketId, patchDemoTicket } from './demoTickets'
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
  for (const team of workspace.teams) {
    if (!team.memberIds.includes(me.id)) continue
    for (const id of team.memberIds) memberIds.add(id)
  }
  if (memberIds.size === 0) return [me]
  return workspace.people.filter((person) => memberIds.has(person.id))
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
