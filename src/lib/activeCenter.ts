import type { Workshop } from '../types'

export const ALL_CENTERS = ''

export function workshopCenters(workshop: Pick<Workshop, 'centers'>): { id: string; name: string }[] {
  return workshop.centers ?? []
}

export function canSwitchCenters(workshop: Pick<Workshop, 'centers'>): boolean {
  return workshopCenters(workshop).length > 1
}

function storageKey(workshop: Pick<Workshop, 'id' | 'originalId'>): string {
  return `avi-active-center:${String(workshop.originalId || workshop.id).trim().toLowerCase()}`
}

function sameCenterId(a?: string | null, b?: string | null): boolean {
  return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase()
}

export function loadSavedCenterId(workshop: Workshop): string | null {
  try {
    const raw = localStorage.getItem(storageKey(workshop))
    if (!raw || raw === ALL_CENTERS) return null
    return workshopCenters(workshop).some((center) => sameCenterId(center.id, raw)) ? raw : null
  } catch {
    return null
  }
}

export function saveActiveCenterId(workshop: Workshop, centerId: string | null): void {
  try {
    localStorage.setItem(storageKey(workshop), centerId || ALL_CENTERS)
  } catch {
    /* ignore */
  }
}

export function applyActiveCenter(workshop: Workshop, centerId: string | null): Workshop {
  const centers = workshopCenters(workshop)
  if (centers.length === 1) {
    const only = centers[0]
    saveActiveCenterId(workshop, only.id)
    return { ...workshop, centerId: only.id, centerName: only.name }
  }
  const picked = centerId ? centers.find((center) => sameCenterId(center.id, centerId)) : undefined
  saveActiveCenterId(workshop, picked?.id ?? null)
  if (!picked) {
    return {
      ...workshop,
      centerId: undefined,
      centerName: centers.length ? 'Todos los centros' : undefined,
    }
  }
  return { ...workshop, centerId: picked.id, centerName: picked.name }
}

export function withSavedCenter(workshop: Workshop): Workshop {
  return applyActiveCenter(workshop, loadSavedCenterId(workshop))
}

export function matchesActiveCenter(centerId: string | null | undefined, workshop: Pick<Workshop, 'centerId'>): boolean {
  if (!workshop.centerId) return true
  const key = String(centerId || '').trim()
  if (!key) return true
  return sameCenterId(key, workshop.centerId)
}

export function matchesTicketCenter(
  item: { idCentro?: string | null; cita?: { idCentro?: string | null } | null },
  workshop: Pick<Workshop, 'centerId'>,
): boolean {
  if (!workshop.centerId) return true
  const fromCita = item.cita?.idCentro
  const fromTicket = item.idCentro
  if (!fromCita && !fromTicket) return true
  return sameCenterId(fromCita, workshop.centerId) || sameCenterId(fromTicket, workshop.centerId)
}
