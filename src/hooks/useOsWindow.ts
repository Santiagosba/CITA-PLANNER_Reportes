import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type AnimationEvent as ReactAnimationEvent,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import {
  expandSide,
  rectForPlacement,
  resolvePlacement,
  snapMoveRect,
  snapResizeRect,
  untileUnderCursor,
  type OsPlacement,
} from '../lib/osGeometry'
import {
  clearOsSnapLines,
  otherOsRects,
  registerOsWindow,
  setOsSnapLines,
  unregisterOsWindow,
  updateOsWindowRect,
} from '../lib/osWindowRegistry'
import {
  animateWinBox,
  applyDockVars,
  applyScatterVars,
  applyWinMoveToElement,
  applyWinRectToElement,
  commitWinRectToElement,
  cursorForSides,
  pulseAgendaCatch,
  refreshLiquidGlass,
  resizeRectFromPointer,
  sidesFromEdge,
  type Edge,
  type WinRect,
} from '../lib/osWindowDrag'
import { useLiquidGlass } from './useLiquidGlass'

export type AnimPhase = 'enter' | 'idle' | 'closing' | 'minimizing'
export type MinimizeStyle = 'dock' | 'side'

export type UseOsWindowOptions = {
  windowId: string
  title: string
  rect: WinRect
  zIndex: number
  placement?: OsPlacement
  maximized?: boolean
  enterFrom?: 'spawn' | 'restore'
  minimizeRequest?: number
  minimizeStyle?: MinimizeStyle
  staggerMs?: number
  minW: number
  minH: number
  onFocus: () => void
  onRectChange: (rect: WinRect) => void
  onClose: () => void
  onMinimize: () => void
  onPlace: (placement: OsPlacement) => void
}

function reducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function displayRect(placement: OsPlacement, free: WinRect): WinRect {
  return placement === 'free' ? free : rectForPlacement(placement)
}

/**
 * Única máquina de ventanas del escritorio: arrastre, snap, mitades, relleno,
 * minimizar y cerrar. Fichas y apps deben usarla; no copies este gesto.
 */
export function useOsWindow({
  windowId,
  rect,
  zIndex,
  placement: placementProp,
  maximized = false,
  enterFrom = 'spawn',
  minimizeRequest = 0,
  minimizeStyle = 'dock',
  staggerMs = 0,
  minW,
  minH,
  onFocus,
  onRectChange,
  onClose,
  onMinimize,
  onPlace,
}: UseOsWindowOptions) {
  const placement = resolvePlacement(placementProp, maximized)
  const [phase, setPhase] = useState<AnimPhase>(() => (reducedMotion() ? 'idle' : 'enter'))
  const [minStyle, setMinStyle] = useState<MinimizeStyle>('dock')
  const rootRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const glassDefs = useLiquidGlass(frameRef)
  const lastMinReqRef = useRef(minimizeRequest)
  const minStyleRef = useRef<MinimizeStyle>('dock')
  const dragRef = useRef<{
    mode: 'move' | 'resize'
    edge?: Edge
    ox: number
    oy: number
    sx: number
    sy: number
    sw: number
    sh: number
    fromTile: boolean
    untiled: boolean
  } | null>(null)
  const liveRectRef = useRef<WinRect | null>(null)
  const rafRef = useRef(0)
  const pendingPtrRef = useRef<PointerEvent | null>(null)
  const rectRef = useRef(rect)
  const placementRef = useRef(placement)
  const onRectChangeRef = useRef(onRectChange)
  const onFocusRef = useRef(onFocus)
  const onCloseRef = useRef(onClose)
  const onMinimizeRef = useRef(onMinimize)
  const onPlaceRef = useRef(onPlace)
  const phaseRef = useRef(phase)
  const maxFromRef = useRef<DOMRect | null>(null)
  const maxAnimationRef = useRef<Animation | null>(null)

  useEffect(() => {
    if (dragRef.current) return
    rectRef.current = rect
  }, [rect])

  useEffect(() => {
    placementRef.current = placement
  }, [placement])

  useEffect(() => {
    onRectChangeRef.current = onRectChange
    onFocusRef.current = onFocus
    onCloseRef.current = onClose
    onMinimizeRef.current = onMinimize
    onPlaceRef.current = onPlace
  }, [onRectChange, onFocus, onClose, onMinimize, onPlace])

  useEffect(() => {
    phaseRef.current = phase
  }, [phase])

  useLayoutEffect(() => {
    const shown = displayRect(placement, rect)
    registerOsWindow(windowId, 'window', shown)
    return () => unregisterOsWindow(windowId)
  }, [windowId])

  useLayoutEffect(() => {
    if (dragRef.current) return
    updateOsWindowRect(windowId, displayRect(placement, rect))
  }, [windowId, placement, rect])

  useLayoutEffect(() => {
    const el = rootRef.current
    const from = maxFromRef.current
    maxFromRef.current = null
    if (!el || !from) return
    maxAnimationRef.current?.cancel()
    const to = el.getBoundingClientRect()
    if (!to.width || !to.height) return
    if (reducedMotion()) {
      refreshLiquidGlass(el)
      return
    }
    el.classList.add('is-size-tween')
    refreshLiquidGlass(el)
    const animation = animateWinBox(el, from)
    maxAnimationRef.current = animation
    const finish = () => {
      if (maxAnimationRef.current === animation) maxAnimationRef.current = null
      el.classList.remove('is-size-tween')
      refreshLiquidGlass(el)
    }
    animation.addEventListener('finish', finish, { once: true })
    animation.addEventListener('cancel', finish, { once: true })
    return () => {
      animation.removeEventListener('finish', finish)
      animation.removeEventListener('cancel', finish)
      animation.cancel()
      el.classList.remove('is-size-tween')
    }
  }, [placement])

  useLayoutEffect(() => {
    const el = rootRef.current
    if (!el || phase !== 'enter') return
    applyDockVars(el)
  }, [phase])

  const applyLiveRect = useCallback(
    (next: WinRect) => {
      const el = rootRef.current
      if (!el) return
      liveRectRef.current = next
      rectRef.current = next
      updateOsWindowRect(windowId, next)
      applyWinRectToElement(el, next)
    },
    [windowId],
  )

  const applyLiveMove = useCallback(
    (origin: WinRect, next: WinRect) => {
      const el = rootRef.current
      if (!el) return
      liveRectRef.current = next
      rectRef.current = next
      updateOsWindowRect(windowId, next)
      applyWinMoveToElement(el, origin, next)
    },
    [windowId],
  )

  const endGesture = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
    }
    pendingPtrRef.current = null
    const el = rootRef.current
    const finalRect = liveRectRef.current
    dragRef.current = null
    liveRectRef.current = null
    if (el && finalRect) commitWinRectToElement(el, finalRect)
    el?.classList.remove('is-gesturing', 'is-moving', 'is-resizing')
    document.body.style.userSelect = ''
    document.body.style.cursor = ''
    clearOsSnapLines()
    if (!finalRect) return
    refreshLiquidGlass(el)
    onRectChangeRef.current(finalRect)
  }, [])

  useEffect(() => {
    const flushPointer = () => {
      rafRef.current = 0
      const e = pendingPtrRef.current
      const d = dragRef.current
      if (!e || !d) return
      const others = otherOsRects(windowId)

      if (d.mode === 'move') {
        if (d.fromTile && !d.untiled) {
          const el = rootRef.current
          if (!el) return
          const box = el.getBoundingClientRect()
          const floated = untileUnderCursor({
            display: { x: box.left, y: box.top, w: box.width, h: box.height },
            free: { x: d.sx, y: d.sy, w: d.sw, h: d.sh },
            clientX: e.clientX,
            clientY: e.clientY,
          })
          d.untiled = true
          d.sx = floated.x
          d.sy = floated.y
          d.sw = floated.w
          d.sh = floated.h
          d.ox = e.clientX
          d.oy = e.clientY
          applyLiveRect(floated)
          return
        }

        const origin = { x: d.sx, y: d.sy, w: d.sw, h: d.sh }
        const raw = {
          x: d.sx + (e.clientX - d.ox),
          y: d.sy + (e.clientY - d.oy),
          w: d.sw,
          h: d.sh,
        }
        const snapped = snapMoveRect(raw, others)
        setOsSnapLines(snapped.lines)
        applyLiveMove(origin, snapped.rect)
        return
      }

      const origin = { x: d.sx, y: d.sy, w: d.sw, h: d.sh }
      const resized = resizeRectFromPointer({
        origin,
        sides: sidesFromEdge(d.edge!),
        clientX: e.clientX,
        clientY: e.clientY,
        minW,
        minH,
      })
      const snapped = snapResizeRect(resized, sidesFromEdge(d.edge!), others, undefined, minW, minH)
      setOsSnapLines(snapped.lines)
      applyLiveRect(snapped.rect)
    }

    const onPointerMove = (e: PointerEvent) => {
      if (!dragRef.current) return
      pendingPtrRef.current = e
      if (!rafRef.current) rafRef.current = requestAnimationFrame(flushPointer)
    }
    const onPointerUp = () => {
      if (!dragRef.current) return
      if (pendingPtrRef.current && rafRef.current) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = 0
        flushPointer()
      }
      endGesture()
    }
    window.addEventListener('pointermove', onPointerMove, { passive: true })
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerUp)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerUp)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [applyLiveMove, applyLiveRect, endGesture, minH, minW, windowId])

  const beginGesture = useCallback((mode: 'move' | 'resize') => {
    rootRef.current?.classList.add('is-gesturing', mode === 'move' ? 'is-moving' : 'is-resizing')
    document.body.style.userSelect = 'none'
    if (phaseRef.current === 'enter') setPhase('idle')
  }, [])

  const startMove = useCallback(
    (e: ReactPointerEvent) => {
      if (e.button !== 0) return
      if (phaseRef.current === 'closing' || phaseRef.current === 'minimizing') return
      if ((e.target as HTMLElement).closest('button, a, input, textarea, select, [data-os-ignore-drag]')) return
      onFocusRef.current()
      e.preventDefault()
      e.stopPropagation()
      const tiled = placementRef.current !== 'free'
      const shown = displayRect(placementRef.current, rectRef.current)
      const free = rectRef.current
      dragRef.current = {
        mode: 'move',
        ox: e.clientX,
        oy: e.clientY,
        sx: tiled ? free.x : shown.x,
        sy: tiled ? free.y : shown.y,
        sw: tiled ? free.w : shown.w,
        sh: tiled ? free.h : shown.h,
        fromTile: tiled,
        untiled: false,
      }
      liveRectRef.current = shown
      beginGesture('move')
      document.body.style.cursor = 'move'
    },
    [beginGesture],
  )

  const startResize = useCallback(
    (edge: Edge) => (e: ReactPointerEvent) => {
      if (e.button !== 0) return
      if (phaseRef.current === 'closing' || phaseRef.current === 'minimizing') return
      e.stopPropagation()
      e.preventDefault()
      onFocusRef.current()
      const tiled = placementRef.current !== 'free'
      const shown = displayRect(placementRef.current, rectRef.current)
      dragRef.current = {
        mode: 'resize',
        edge,
        ox: e.clientX,
        oy: e.clientY,
        sx: shown.x,
        sy: shown.y,
        sw: shown.w,
        sh: shown.h,
        fromTile: tiled,
        untiled: true,
      }
      liveRectRef.current = shown
      beginGesture('resize')
      document.body.style.cursor = cursorForSides(sidesFromEdge(edge))
    },
    [beginGesture],
  )

  const requestClose = useCallback(() => {
    if (phaseRef.current === 'closing' || phaseRef.current === 'minimizing') return
    if (reducedMotion()) {
      onCloseRef.current()
      return
    }
    setPhase('closing')
    window.setTimeout(() => {
      if (phaseRef.current !== 'closing') return
      phaseRef.current = 'idle'
      onCloseRef.current()
    }, 400)
  }, [])

  const requestMinimize = useCallback(
    (style: MinimizeStyle = 'dock') => {
      if (phaseRef.current === 'closing' || phaseRef.current === 'minimizing') return
      if (reducedMotion()) {
        onMinimizeRef.current()
        return
      }
      const el = rootRef.current
      minStyleRef.current = style
      setMinStyle(style)
      if (el) {
        if (style === 'side') applyScatterVars(el, staggerMs)
        else applyDockVars(el)
      }
      setPhase('minimizing')
      const ms = style === 'side' ? 460 + staggerMs : 420
      window.setTimeout(() => {
        if (phaseRef.current !== 'minimizing') return
        phaseRef.current = 'idle'
        if (minStyleRef.current === 'dock') pulseAgendaCatch()
        onMinimizeRef.current()
      }, ms)
    },
    [staggerMs],
  )

  const requestPlace = useCallback((next: OsPlacement) => {
    if (phaseRef.current === 'closing' || phaseRef.current === 'minimizing') return
    maxFromRef.current = rootRef.current?.getBoundingClientRect() ?? null
    onPlaceRef.current(next)
  }, [])

  const requestToggleMaximize = useCallback(() => {
    requestPlace(placementRef.current === 'fill' ? 'free' : 'fill')
  }, [requestPlace])

  const expandEdge = useCallback(
    (edge: Edge) => {
      if (phaseRef.current === 'closing' || phaseRef.current === 'minimizing') return
      const sides = sidesFromEdge(edge)
      const shown = displayRect(placementRef.current, rectRef.current)
      const others = otherOsRects(windowId)
      let next = shown
      for (const side of sides) next = expandSide(next, side, others, minW, minH)
      if (placementRef.current !== 'free') onPlaceRef.current('free')
      applyLiveRect(next)
      commitWinRectToElement(rootRef.current!, next)
      refreshLiquidGlass(rootRef.current)
      onRectChangeRef.current(next)
    },
    [applyLiveRect, minH, minW, windowId],
  )

  useEffect(() => {
    if (!minimizeRequest || minimizeRequest === lastMinReqRef.current) return
    lastMinReqRef.current = minimizeRequest
    if (phaseRef.current === 'minimizing' || phaseRef.current === 'closing') {
      onMinimizeRef.current()
      return
    }
    requestMinimize(minimizeStyle)
  }, [minimizeRequest, minimizeStyle, requestMinimize])

  const onFrameAnimEnd = useCallback((e: ReactAnimationEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return
    const name = e.animationName
    if (phaseRef.current === 'enter' && (name.includes('os-win-spawn') || name.includes('os-win-restore'))) {
      e.currentTarget.style.opacity = '1'
      e.currentTarget.style.transform = 'translateZ(0)'
      setPhase('idle')
      return
    }
    if (phaseRef.current === 'closing' && name.includes('os-win-close')) {
      phaseRef.current = 'idle'
      onCloseRef.current()
      return
    }
    if (
      phaseRef.current === 'minimizing' &&
      (name.includes('os-win-minimize') || name.includes('os-win-side-out') || name.includes('os-win-scatter-out'))
    ) {
      phaseRef.current = 'idle'
      if (minStyleRef.current === 'dock') pulseAgendaCatch()
      onMinimizeRef.current()
    }
  }, [])

  const shown = displayRect(placement, rect)
  const style: CSSProperties & Record<'--tool-min-w' | '--tool-min-h', string> = {
    left: shown.x,
    top: shown.y,
    width: shown.w,
    height: shown.h,
    zIndex,
    '--tool-min-w': `${minW}px`,
    '--tool-min-h': `${minH}px`,
  }

  const phaseClass =
    phase === 'enter'
      ? enterFrom === 'restore'
        ? ' is-enter-restore'
        : ' is-enter-spawn'
      : phase === 'closing'
        ? ' is-closing'
        : phase === 'minimizing'
          ? minStyle === 'side'
            ? ' is-minimizing is-minimizing-side'
            : ' is-minimizing'
          : ' is-enter-done'

  return {
    rootRef,
    frameRef,
    glassDefs,
    style,
    phaseClass,
    phase,
    placement,
    tiled: placement !== 'free',
    startMove,
    startResize,
    requestClose,
    requestMinimize,
    requestPlace,
    requestToggleMaximize,
    expandEdge,
    onFrameAnimEnd,
    onFocus: () => onFocusRef.current(),
  }
}
