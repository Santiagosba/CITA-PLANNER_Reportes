import { useEffect, useMemo, useRef, useState } from 'react'
import { isPeticionPendiente, type PeticionPendiente } from './peticionesPendientes'
import { isSlaCritico } from './tallerStations'
import { ticketClientLabel, ticketClientPhone } from './ticketClient'
import { workshopCopyId } from './workingCopy'
import { loadReadNoticeIds } from './headerNoticeReads'
import type { Workshop } from '../types'

export type NoticeHistoryStatus = 'inbox' | 'read' | 'deleted'

export type NoticeHistoryItem = {
  id: string
  savedAt: string
  name: string
  phone: string
  tipo: string
  when: string | null
  sla: boolean
  pending: boolean
  status: NoticeHistoryStatus
}

function storageKey(workshop: Workshop): string {
  return `avi-header-notices-history:${workshopCopyId(workshop)}`
}

export function loadNoticeHistory(workshop: Workshop): NoticeHistoryItem[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(storageKey(workshop))
    const rows = raw ? (JSON.parse(raw) as unknown) : []
    if (!Array.isArray(rows)) return []
    return rows.filter(isHistoryItem)
  } catch {
    return []
  }
}

function isHistoryItem(value: unknown): value is NoticeHistoryItem {
  if (!value || typeof value !== 'object') return false
  const row = value as NoticeHistoryItem
  return typeof row.id === 'string' && row.id.length > 0 && typeof row.savedAt === 'string'
}

export function saveNoticeHistory(workshop: Workshop, items: NoticeHistoryItem[]): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(storageKey(workshop), JSON.stringify(items))
  } catch {
    /* quota / private mode */
  }
}

function snapshot(item: PeticionPendiente, status: NoticeHistoryStatus, savedAt: string): NoticeHistoryItem {
  return {
    id: item.idpeticion,
    savedAt,
    name: ticketClientLabel(item),
    phone: ticketClientPhone(item),
    tipo: item.tipopeticion || 'Sin tipo',
    when: item.fechainicio || null,
    sla: isSlaCritico(item.fechainicio) || isSlaCritico(item.cita?.fecha),
    pending: isPeticionPendiente(item),
    status,
  }
}

export function captureLiveNotices(
  workshop: Workshop,
  live: PeticionPendiente[],
  current: NoticeHistoryItem[],
  readIds: Set<string>,
): NoticeHistoryItem[] {
  const byId = new Map(current.map((item) => [item.id, item]))
  const now = new Date().toISOString()
  let changed = current.length === 0 && live.length > 0
  for (const item of live) {
    if (byId.has(item.idpeticion)) continue
    byId.set(item.idpeticion, snapshot(item, readIds.has(item.idpeticion) ? 'read' : 'inbox', now))
    changed = true
  }
  if (!changed) return current
  const next = [...byId.values()].sort((a, b) => b.savedAt.localeCompare(a.savedAt))
  saveNoticeHistory(workshop, next)
  return next
}

export function updateNoticeStatus(
  workshop: Workshop,
  current: NoticeHistoryItem[],
  ids: string[],
  status: NoticeHistoryStatus,
): NoticeHistoryItem[] {
  if (ids.length === 0) return current
  const wanted = new Set(ids)
  const next = current.map((item) => (wanted.has(item.id) ? { ...item, status } : item))
  saveNoticeHistory(workshop, next)
  return next
}

export function useNoticeHistory(workshop: Workshop, live: PeticionPendiente[]) {
  const workshopKey = workshop.containerIdTaller || workshop.id
  const liveKey = live.map((item) => item.idpeticion).join('|')
  const [entries, setEntries] = useState(() => loadNoticeHistory(workshop))
  const workshopRef = useRef(workshop)
  const liveRef = useRef(live)
  workshopRef.current = workshop
  liveRef.current = live

  useEffect(() => {
    setEntries(loadNoticeHistory(workshopRef.current))
  }, [workshopKey])

  useEffect(() => {
    const currentWorkshop = workshopRef.current
    const readIds = loadReadNoticeIds(currentWorkshop)
    setEntries((current) => captureLiveNotices(currentWorkshop, liveRef.current, current, readIds))
  }, [workshopKey, liveKey])

  const statusOf = useMemo(() => {
    const map = new Map(entries.map((item) => [item.id, item.status]))
    return (id: string): NoticeHistoryStatus => map.get(id) ?? 'inbox'
  }, [entries])

  const setStatus = (ids: string[], status: NoticeHistoryStatus) => {
    setEntries((current) => updateNoticeStatus(workshop, current, ids, status))
  }

  return { entries, statusOf, setStatus }
}
