/**
 * Vista previa solo en `npm run dev`. Nunca se activa en el build de producción.
 */

import type { Workshop } from '../types'
import type { CrmAppRole } from './crmRoles'

const KEY = 'avi_local_preview_v1'

export const LOCAL_PREVIEW_ENABLED = import.meta.env.DEV

export const LOCAL_PREVIEW_ID = 'local-preview'

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
}

export function readLocalPreview(): LocalPreviewState | null {
  if (!LOCAL_PREVIEW_ENABLED) return null
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<LocalPreviewState>
    if (parsed.role === 'admin' || parsed.role === 'asesor') return { role: parsed.role }
  } catch {
    /* ignore */
  }
  return null
}

export function writeLocalPreview(role: CrmAppRole): LocalPreviewState {
  const next = { role }
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

export function buildLocalPreviewUser(role: CrmAppRole) {
  if (role === 'admin') {
    return {
      id: 'local-admin',
      email: 'santy@gmail.com',
      user_metadata: { full_name: 'Santy', role_label: 'Admin' },
      app_metadata: { role: 'admin', local_preview: true },
    }
  }
  return {
    id: 'demo-asesor-ana',
    email: 'ana.ruiz@taller.demo',
    user_metadata: { full_name: 'Ana Ruiz', role_label: 'Asesora de triage' },
    app_metadata: { role: 'asesor', demo_asesor: true, local_preview: true },
  }
}
