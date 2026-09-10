import type { Side, WinRect } from './osWindowDrag'

/** Colocación tipo macOS: libre o anclada al área de trabajo. */
export type OsPlacement = 'free' | 'fill' | 'left' | 'right' | 'top' | 'bottom'

export type OsSnapLine = {
  axis: 'x' | 'y'
  at: number
  from: number
  to: number
}

export type SnapResult = {
  rect: WinRect
  lines: OsSnapLine[]
}

export const SNAP_PX = 12
export const WORK_INSET = 12
export const TILE_GAP = 8

/** Área útil: menú/dock del CRM siguen visibles (margen, no pantalla completa). */
export function deskWorkRect(): WinRect {
  const inset = WORK_INSET
  return {
    x: inset,
    y: inset,
    w: Math.max(0, window.innerWidth - inset * 2),
    h: Math.max(0, window.innerHeight - inset * 2),
  }
}

export function rectForPlacement(
  placement: Exclude<OsPlacement, 'free'>,
  work: WinRect = deskWorkRect(),
  gap = TILE_GAP,
): WinRect {
  const { x, y, w, h } = work
  if (placement === 'fill') return { x, y, w, h }
  if (placement === 'left') return { x, y, w: Math.floor((w - gap) / 2), h }
  if (placement === 'right') {
    const lw = Math.floor((w - gap) / 2)
    return { x: x + lw + gap, y, w: w - lw - gap, h }
  }
  if (placement === 'top') return { x, y, w, h: Math.floor((h - gap) / 2) }
  const th = Math.floor((h - gap) / 2)
  return { x, y: y + th + gap, w, h: h - th - gap }
}

export function resolvePlacement(placement?: OsPlacement | null, maximized?: boolean): OsPlacement {
  if (placement && placement !== 'free') return placement
  if (maximized) return 'fill'
  return placement ?? 'free'
}

function overlapRange(a1: number, a2: number, b1: number, b2: number): { from: number; to: number } | null {
  const from = Math.max(a1, b1)
  const to = Math.min(a2, b2)
  if (to - from < 8) return null
  return { from, to }
}

function consider(
  best: { delta: number; value: number; line: OsSnapLine | null },
  candidate: number,
  current: number,
  line: OsSnapLine | null,
) {
  const delta = Math.abs(candidate - current)
  if (delta > SNAP_PX || delta >= best.delta) return
  best.delta = delta
  best.value = candidate
  best.line = line
}

function vLine(at: number, moving: WinRect, other?: WinRect): OsSnapLine | null {
  const band = other
    ? overlapRange(moving.y, moving.y + moving.h, other.y, other.y + other.h)
    : { from: moving.y, to: moving.y + moving.h }
  if (!band) return null
  return { axis: 'x', at, from: band.from, to: band.to }
}

function hLine(at: number, moving: WinRect, other?: WinRect): OsSnapLine | null {
  const band = other
    ? overlapRange(moving.x, moving.x + moving.w, other.x, other.x + other.w)
    : { from: moving.x, to: moving.x + moving.w }
  if (!band) return null
  return { axis: 'y', at, from: band.from, to: band.to }
}

function clampMove(rect: WinRect): WinRect {
  return {
    ...rect,
    x: Math.max(0, Math.min(rect.x, window.innerWidth - 120)),
    y: Math.max(0, Math.min(rect.y, window.innerHeight - 56)),
  }
}

/**
 * Al arrastrar, la ventana se alinea al área de trabajo o a otra ventana
 * (mismo borde o adyacente, sin solaparse).
 */
export function snapMoveRect(rect: WinRect, others: WinRect[], work: WinRect = deskWorkRect()): SnapResult {
  const lines: OsSnapLine[] = []
  const xBest = { delta: SNAP_PX + 1, value: rect.x, line: null as OsSnapLine | null }
  const yBest = { delta: SNAP_PX + 1, value: rect.y, line: null as OsSnapLine | null }

  consider(xBest, work.x, rect.x, vLine(work.x, rect))
  consider(xBest, work.x + work.w - rect.w, rect.x, vLine(work.x + work.w, rect))
  consider(yBest, work.y, rect.y, hLine(work.y, rect))
  consider(yBest, work.y + work.h - rect.h, rect.y, hLine(work.y + work.h, rect))

  for (const other of others) {
    consider(xBest, other.x, rect.x, vLine(other.x, rect, other))
    consider(xBest, other.x + other.w - rect.w, rect.x, vLine(other.x + other.w, rect, other))
    consider(xBest, other.x + other.w, rect.x, vLine(other.x + other.w, rect, other))
    consider(xBest, other.x - rect.w, rect.x, vLine(other.x, rect, other))
    consider(yBest, other.y, rect.y, hLine(other.y, rect, other))
    consider(yBest, other.y + other.h - rect.h, rect.y, hLine(other.y + other.h, rect, other))
    consider(yBest, other.y + other.h, rect.y, hLine(other.y + other.h, rect, other))
    consider(yBest, other.y - rect.h, rect.y, hLine(other.y, rect, other))
  }

  const next = clampMove({ ...rect, x: xBest.value, y: yBest.value })
  if (xBest.line && xBest.delta <= SNAP_PX) lines.push(xBest.line)
  if (yBest.line && yBest.delta <= SNAP_PX) lines.push(yBest.line)
  return { rect: next, lines }
}

function snapEdge(
  current: number,
  candidates: Array<{ value: number; line: OsSnapLine | null }>,
): { value: number; line: OsSnapLine | null } {
  const best = { delta: SNAP_PX + 1, value: current, line: null as OsSnapLine | null }
  for (const candidate of candidates) consider(best, candidate.value, current, candidate.line)
  return { value: best.value, line: best.delta <= SNAP_PX ? best.line : null }
}

/** Al redimensionar, el borde se detiene al coincidir con el de al lado. */
export function snapResizeRect(
  rect: WinRect,
  sides: Set<Side>,
  others: WinRect[],
  work: WinRect = deskWorkRect(),
  minW: number,
  minH: number,
): SnapResult {
  let left = rect.x
  let top = rect.y
  let right = rect.x + rect.w
  let bottom = rect.y + rect.h
  const lines: OsSnapLine[] = []
  const probe: WinRect = { x: left, y: top, w: right - left, h: bottom - top }

  if (sides.has('e')) {
    const hit = snapEdge(right, [
      { value: work.x + work.w, line: vLine(work.x + work.w, probe) },
      ...others.flatMap((other) => [
        { value: other.x, line: vLine(other.x, probe, other) },
        { value: other.x + other.w, line: vLine(other.x + other.w, probe, other) },
      ]),
    ])
    right = Math.max(left + minW, hit.value)
    if (hit.line) lines.push(hit.line)
  }
  if (sides.has('w')) {
    const hit = snapEdge(left, [
      { value: work.x, line: vLine(work.x, probe) },
      ...others.flatMap((other) => [
        { value: other.x, line: vLine(other.x, probe, other) },
        { value: other.x + other.w, line: vLine(other.x + other.w, probe, other) },
      ]),
    ])
    left = Math.min(right - minW, hit.value)
    if (hit.line) lines.push(hit.line)
  }
  if (sides.has('s')) {
    const hit = snapEdge(bottom, [
      { value: work.y + work.h, line: hLine(work.y + work.h, probe) },
      ...others.flatMap((other) => [
        { value: other.y, line: hLine(other.y, probe, other) },
        { value: other.y + other.h, line: hLine(other.y + other.h, probe, other) },
      ]),
    ])
    bottom = Math.max(top + minH, hit.value)
    if (hit.line) lines.push(hit.line)
  }
  if (sides.has('n')) {
    const hit = snapEdge(top, [
      { value: work.y, line: hLine(work.y, probe) },
      ...others.flatMap((other) => [
        { value: other.y, line: hLine(other.y, probe, other) },
        { value: other.y + other.h, line: hLine(other.y + other.h, probe, other) },
      ]),
    ])
    top = Math.min(bottom - minH, hit.value)
    if (hit.line) lines.push(hit.line)
  }

  return {
    rect: { x: left, y: top, w: right - left, h: bottom - top },
    lines,
  }
}

function rangesOverlap(a1: number, a2: number, b1: number, b2: number, slop = 2): boolean {
  return a1 < b2 - slop && a2 > b1 + slop
}

/** Doble clic en un borde: ese lado llega al obstáculo más cercano o al área de trabajo. */
export function expandSide(
  rect: WinRect,
  side: Side,
  others: WinRect[],
  minW: number,
  minH: number,
  work: WinRect = deskWorkRect(),
): WinRect {
  let left = rect.x
  let top = rect.y
  let right = rect.x + rect.w
  let bottom = rect.y + rect.h

  if (side === 'e') {
    let next = work.x + work.w
    for (const other of others) {
      if (rangesOverlap(top, bottom, other.y, other.y + other.h) && other.x >= right - 1) {
        next = Math.min(next, other.x)
      }
    }
    right = Math.max(left + minW, next)
  } else if (side === 'w') {
    let next = work.x
    for (const other of others) {
      if (rangesOverlap(top, bottom, other.y, other.y + other.h) && other.x + other.w <= left + 1) {
        next = Math.max(next, other.x + other.w)
      }
    }
    left = Math.min(right - minW, next)
  } else if (side === 's') {
    let next = work.y + work.h
    for (const other of others) {
      if (rangesOverlap(left, right, other.x, other.x + other.w) && other.y >= bottom - 1) {
        next = Math.min(next, other.y)
      }
    }
    bottom = Math.max(top + minH, next)
  } else {
    let next = work.y
    for (const other of others) {
      if (rangesOverlap(left, right, other.x, other.x + other.w) && other.y + other.h <= top + 1) {
        next = Math.max(next, other.y + other.h)
      }
    }
    top = Math.min(bottom - minH, next)
  }

  return { x: left, y: top, w: right - left, h: bottom - top }
}

export function untileUnderCursor(args: {
  display: WinRect
  free: WinRect
  clientX: number
  clientY: number
}): WinRect {
  const { display, free, clientX, clientY } = args
  const ratio = display.w > 0 ? (clientX - display.x) / display.w : 0.5
  const grabY = Math.min(Math.max(0, clientY - display.y), 48)
  return clampMove({
    x: clientX - Math.min(free.w - 36, Math.max(36, ratio * free.w)),
    y: clientY - grabY,
    w: free.w,
    h: free.h,
  })
}
