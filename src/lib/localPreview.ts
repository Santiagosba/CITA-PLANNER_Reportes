/**
 * Vista previa solo en `npm run dev`. Nunca se activa en el build de producción.
 */

import type { Workshop } from '../types'
import type { CrmAppRole } from './crmRoles'
import { DEMO_ASESORES } from './demoAsesores'
import { SHOWCASE_ADVISORS } from './advisorWorkspace'

const KEY = 'avi_local_preview_v1'

export const LOCAL_PREVIEW_ENABLED = import.meta.env.DEV

export const LOCAL_PREVIEW_ID = 'local-preview'

export const LOCAL_PREVIEW_ASESORES = [
  ...DEMO_ASESORES.map((asesor) => ({
    id: asesor.id,
    name: `${asesor.firstName} ${asesor.lastName}`.trim(),
    email: asesor.email,
    initials: asesor.initials,
  })),
  ...SHOWCASE_ADVISORS.map((asesor) => {
    const parts = asesor.name.split(/\s+/).filter(Boolean)
    const initials = parts
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('')
    return { id: asesor.id, name: asesor.name, email: asesor.email, initials: initials || 'AS' }
  }),
]

export const LOCAL_PREVIEW_WORKSHOP: Workshop = {
  id: LOCAL_PREVIEW_ID,
  name: 'Taller local',
  city: 'Madrid',
  source: 'demo',
  originalId: LOCAL_PREVIEW_ID,
  containerIdTaller: LOCAL_PREVIEW_ID,
}

export function isLocalPreviewWorkshop(
  workshop: Pick<Workshop, 'id' | 'originalId' | 'containerIdTaller' | 'source'> | null | undefined,
): boolean {
  if (!workshop) return false
  if (workshop.source === 'demo') return true
  return [workshop.id, workshop.originalId, workshop.containerIdTaller].some(
    (value) => String(value ?? '').trim().toLowerCase() === LOCAL_PREVIEW_ID,
  )
}

export type LocalPreviewState = {
  role: CrmAppRole
  advisorId?: string
}

function previewAdvisorById(advisorId?: string) {
  return LOCAL_PREVIEW_ASESORES.find((row) => row.id === advisorId) ?? LOCAL_PREVIEW_ASESORES[0]
}

export function readLocalPreview(): LocalPreviewState | null {
  if (!LOCAL_PREVIEW_ENABLED) return null
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<LocalPreviewState>
    if (parsed.role === 'admin' || parsed.role === 'asesor') {
      return {
        role: parsed.role,
        advisorId: parsed.role === 'asesor' ? previewAdvisorById(parsed.advisorId).id : undefined,
      }
    }
  } catch {
    /* ignore */
  }
  return null
}

export function writeLocalPreview(role: CrmAppRole, advisorId?: string): LocalPreviewState {
  const next: LocalPreviewState = {
    role,
    advisorId: role === 'asesor' ? previewAdvisorById(advisorId).id : undefined,
  }
  if (LOCAL_PREVIEW_ENABLED) {
    try {
      sessionStorage.setItem(KEY, JSON.stringify(next))
    } catch {
      /* ignore */
    }
  }
  return next
}

export function clearLocalPreview(): void {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}

export function buildLocalPreviewUser(role: CrmAppRole, advisorId?: string) {
  if (role === 'admin') {
    return {
      id: 'local-admin',
      email: 'santy@gmail.com',
      user_metadata: { full_name: 'Santy', role_label: 'Admin' },
      app_metadata: { role: 'aviadmin', local_preview: true },
    }
  }
  const advisor = previewAdvisorById(advisorId)
  return {
    id: advisor.id,
    email: advisor.email,
    user_metadata: { full_name: advisor.name, role_label: 'Asesor' },
    app_metadata: { role: 'asesor', demo_asesor: true, local_preview: true },
  }
}
