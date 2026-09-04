import type { CitaTaller } from './citasTaller'
import type { PeticionPendiente } from './peticionesPendientes'
import type { Workshop } from '../types'

type CopyPayload<T> = {
  at: number
  rows: T[]
}

export function workshopCopyId(workshop: Workshop): string {
  return String(workshop.id || workshop.originalId || '')
}

function storageKey(kind: 'peticiones' | 'citas', workshopId: string) {
  return `avi_data_copy_${kind}_${workshopId}`
}

function saveCopy<T>(key: string, rows: T[]) {
  try {
    const payload: CopyPayload<T> = { at: Date.now(), rows }
    localStorage.setItem(key, JSON.stringify(payload))
  } catch {
    /* quota / private mode */
  }
}

function loadCopy<T>(key: string): T[] | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CopyPayload<T>
    return Array.isArray(parsed.rows) ? parsed.rows : null
  } catch {
    return null
  }
}

export function savePeticionesCopy(workshopId: string, rows: PeticionPendiente[]) {
  if (!workshopId) return
  saveCopy(storageKey('peticiones', workshopId), rows)
}

export function loadPeticionesCopy(workshopId: string): PeticionPendiente[] | null {
  if (!workshopId) return null
  return loadCopy<PeticionPendiente>(storageKey('peticiones', workshopId))
}

export function saveCitasCopy(workshopId: string, rows: CitaTaller[]) {
  if (!workshopId) return
  saveCopy(storageKey('citas', workshopId), rows)
}

export function loadCitasCopy(workshopId: string): CitaTaller[] | null {
  if (!workshopId) return null
  return loadCopy<CitaTaller>(storageKey('citas', workshopId))
}

export const COPY_FALLBACK_NOTICE =
  'Usando la copia local de este taller. Cuando conectemos la app del compañero, se actualizará.'

export function patchPeticionInCopy(
  workshopId: string,
  idpeticion: string,
  patch: Partial<PeticionPendiente>,
) {
  const rows = loadPeticionesCopy(workshopId)
  if (!rows) return
  savePeticionesCopy(
    workshopId,
    rows.map((row) => (row.idpeticion === idpeticion ? { ...row, ...patch } : row)),
  )
}
