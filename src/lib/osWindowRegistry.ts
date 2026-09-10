import { useSyncExternalStore } from 'react'
import type { OsSnapLine } from './osGeometry'
import type { WinRect } from './osWindowDrag'

export type OsLiveKind = 'window' | 'taskbar'

type Entry = {
  id: string
  kind: OsLiveKind
  rect: WinRect
}

const entries = new Map<string, Entry>()
let snapLines: OsSnapLine[] = []
const snapListeners = new Set<() => void>()

function emitSnap() {
  for (const fn of snapListeners) fn()
}

export function registerOsWindow(id: string, kind: OsLiveKind, rect: WinRect) {
  entries.set(id, { id, kind, rect })
}

export function updateOsWindowRect(id: string, rect: WinRect) {
  const prev = entries.get(id)
  if (!prev) {
    entries.set(id, { id, kind: 'window', rect })
    return
  }
  prev.rect = rect
}

export function unregisterOsWindow(id: string) {
  entries.delete(id)
}

export function otherOsRects(id: string): WinRect[] {
  const out: WinRect[] = []
  for (const entry of entries.values()) {
    if (entry.id !== id) out.push(entry.rect)
  }
  return out
}

export function setOsSnapLines(lines: OsSnapLine[]) {
  const same =
    lines.length === snapLines.length &&
    lines.every((line, i) => {
      const prev = snapLines[i]
      return prev && prev.axis === line.axis && prev.at === line.at && prev.from === line.from && prev.to === line.to
    })
  if (same) return
  snapLines = lines
  emitSnap()
}

export function clearOsSnapLines() {
  if (snapLines.length === 0) return
  snapLines = []
  emitSnap()
}

export function getOsSnapLines() {
  return snapLines
}

export function subscribeOsSnap(fn: () => void) {
  snapListeners.add(fn)
  return () => {
    snapListeners.delete(fn)
  }
}

export function useOsSnapLines(): OsSnapLine[] {
  return useSyncExternalStore(subscribeOsSnap, getOsSnapLines, getOsSnapLines)
}
