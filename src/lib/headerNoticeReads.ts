import { workshopCopyId } from './workingCopy'
import type { Workshop } from '../types'

function storageKey(workshop: Workshop): string {
  return `avi-header-notices-read:${workshopCopyId(workshop)}`
}

export function loadReadNoticeIds(workshop: Workshop): Set<string> {
  if (typeof localStorage === 'undefined') return new Set()
  try {
    const raw = localStorage.getItem(storageKey(workshop))
    const ids = raw ? (JSON.parse(raw) as unknown) : []
    return new Set(Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string' && id.length > 0) : [])
  } catch {
    return new Set()
  }
}

export function saveReadNoticeIds(workshop: Workshop, ids: Set<string>): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(storageKey(workshop), JSON.stringify([...ids]))
  } catch {
    /* ignore quota */
  }
}

export function mergeReadNoticeIds(
  workshop: Workshop,
  current: Set<string>,
  extra: string[],
  liveIds: Iterable<string>,
): Set<string> {
  const live = new Set(liveIds)
  const next = new Set<string>()
  for (const id of current) {
    if (live.has(id)) next.add(id)
  }
  for (const id of extra) {
    if (live.has(id)) next.add(id)
  }
  saveReadNoticeIds(workshop, next)
  return next
}
