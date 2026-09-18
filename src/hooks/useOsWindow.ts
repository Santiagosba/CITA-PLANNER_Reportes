import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type TransitionEvent as ReactTransitionEvent,
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
  type Side,
  type WinRect,
} from '../lib/osWindowDrag'
import {
  beginOsPointerGesture,
  endOsPointerGesture,
  type OsPointerGestureHandlers,
} from '../lib/osPointerGesture'
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
    sides?: Set<Side>
    ox: number
    oy: number
    sx: number
    sy: number
    sw: number
    sh: number
    others: WinRect[]
    fromTile: boolean
    untiled: boolean
    moved: boolean
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
  const finishTimerRef = useRef(0)
  const maxFromRef = useRef<DOMRect | null>(null)
  const maxAnimationRef = useRef<Animation | null>(null)
  const pointerHandlersRef = useRef<OsPointerGestureHandlers | null>(null)

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
    let raf2 = 0
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        if (phaseRef.current !== 'enter') return
        el.style.removeProperty('transform')
        el.style.removeProperty('opacity')
        phaseRef.current = 'idle'
        setPhase('idle')
      })
    })
    window.clearTimeout(finishTimerRef.current)
    finishTimerRef.current = window.setTimeout(() => {
      if (phaseRef.current !== 'enter') return
      phaseRef.current = 'idle'
      setPhase('idle')
    }, enterFrom === 'restore' ? 400 : 380)
    return () => {
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
    }
  }, [enterFrom, phase])

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
    const handlers = pointerHandlersRef.current
    if (handlers) {
      endOsPointerGesture(handlers)
      pointerHandlersRef.current = null
    }
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
    }
    pendingPtrRef.current = null
    const el = rootRef.current
    const finalRect = liveRectRef.current
    const moved = dragRef.current?.moved ?? false
    dragRef.current = null
    liveRectRef.current = null
    if (el && finalRect && moved) {
      el.style.transition = 'none'
      commitWinRectToElement(el, finalRect)
      void el.offsetWidth
    }
    el?.classList.remove('is-gesturing', 'is-moving', 'is-resizing')
    if (el) el.style.removeProperty('transition')
    document.body.style.userSelect = ''
    document.body.style.cursor = ''
    clearOsSnapLines()
    if (!finalRect || !moved) return
    refreshLiquidGlass(el)
    onRectChangeRef.current(finalRect)
  }, [])

  const flushPointer = useCallback(() => {
      rafRef.current = 0
      const e = pendingPtrRef.current
      const d = dragRef.current
      if (!e || !d) return
      if (!d.moved) {
        const distance = Math.hypot(e.clientX - d.ox, e.clientY - d.oy)
        if (distance < 3) return
        d.moved = true
      }

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
        const snapped = snapMoveRect(raw, d.others)
        setOsSnapLines(snapped.lines)
        applyLiveMove(origin, snapped.rect)
        return
      }

      const origin = { x: d.sx, y: d.sy, w: d.sw, h: d.sh }
      const sides = d.sides ?? sidesFromEdge(d.edge!)
      const resized = resizeRectFromPointer({
        origin,
        sides,
        clientX: e.clientX,
        clientY: e.clientY,
        minW,
        minH,
      })
      const snapped = snapResizeRect(resized, sides, d.others, undefined, minW, minH)
      setOsSnapLines(snapped.lines)
      applyLiveRect(snapped.rect)
  }, [applyLiveMove, applyLiveRect, minH, minW, windowId])

  const startPointerEvents = useCallback(() => {
    const handlers: OsPointerGestureHandlers = {
      move: (e) => {
        if (!dragRef.current) return
        pendingPtrRef.current = e
        if (!rafRef.current) rafRef.current = requestAnimationFrame(flushPointer)
      },
      end: () => {
        if (!dragRef.current) return
        if (pendingPtrRef.current && rafRef.current) {
          cancelAnimationFrame(rafRef.current)
          rafRef.current = 0
          flushPointer()
        }
        endGesture()
      },
    }
    pointerHandlersRef.current = handlers
    beginOsPointerGesture(handlers)
  }, [endGesture, flushPointer])

  const beginGesture = useCallback((mode: 'move' | 'resize') => {
    const el = rootRef.current
    el?.classList.add('is-gesturing', mode === 'move' ? 'is-moving' : 'is-resizing')
    document.body.style.userSelect = 'none'
    if (phaseRef.current === 'enter') {
      phaseRef.current = 'idle'
      setPhase('idle')
    }
    startPointerEvents()
  }, [startPointerEvents])

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
        others: otherOsRects(windowId),
        fromTile: tiled,
        untiled: false,
        moved: false,
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
        sides: sidesFromEdge(edge),
        ox: e.clientX,
        oy: e.clientY,
        sx: shown.x,
        sy: shown.y,
        sw: shown.w,
        sh: shown.h,
        others: otherOsRects(windowId),
        fromTile: tiled,
        untiled: true,
        moved: false,
      }
      liveRectRef.current = shown
      beginGesture('resize')
      document.body.style.cursor = cursorForSides(sidesFromEdge(edge))
    },
    [beginGesture],
  )

  const finishClose = useCallback(() => {
    if (phaseRef.current !== 'closing') return
    window.clearTimeout(finishTimerRef.current)
    phaseRef.current = 'idle'
    onCloseRef.current()
  }, [])

  const finishMinimize = useCallback(() => {
    if (phaseRef.current !== 'minimizing') return
    window.clearTimeout(finishTimerRef.current)
    phaseRef.current = 'idle'
    if (minStyleRef.current === 'dock') pulseAgendaCatch()
    onMinimizeRef.current()
  }, [])

  const requestClose = useCallback(() => {
    if (phaseRef.current === 'closing' || phaseRef.current === 'minimizing') return
    if (reducedMotion()) {
      onCloseRef.current()
      return
    }
    phaseRef.current = 'closing'
    setPhase('closing')
    window.clearTimeout(finishTimerRef.current)
    finishTimerRef.current = window.setTimeout(finishClose, 320)
  }, [finishClose])

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
      phaseRef.current = 'minimizing'
      setPhase('minimizing')
      window.clearTimeout(finishTimerRef.current)
      const ms = style === 'side' ? 400 + staggerMs : 360
      finishTimerRef.current = window.setTimeout(finishMinimize, ms)
    },
    [finishMinimize, staggerMs],
  )

  const requestPlace = useCallback((next: OsPlacement) => {
    if (phaseRef.current === 'closing' || phaseRef.current === 'minimizing') return
    const currentBox = rootRef.current?.getBoundingClientRect() ?? null
    maxAnimationRef.current?.cancel()
    maxFromRef.current = currentBox
    placementRef.current = next
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
    if (phaseRef.current === 'minimizing' || phaseRef.current === 'closing') return
    requestMinimize(minimizeStyle)
  }, [minimizeRequest, minimizeStyle, requestMinimize])

  useEffect(
    () => () => {
      window.clearTimeout(finishTimerRef.current)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      const handlers = pointerHandlersRef.current
      if (handlers) endOsPointerGesture(handlers)
      clearOsSnapLines()
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
    },
    [],
  )

  const onWinMotionEnd = useCallback((e: ReactTransitionEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return
    if (e.propertyName !== 'transform') return
    if (phaseRef.current === 'enter') {
      phaseRef.current = 'idle'
      setPhase('idle')
      return
    }
    if (phaseRef.current === 'closing') {
      finishClose()
      return
    }
    if (phaseRef.current === 'minimizing') finishMinimize()
  }, [finishClose, finishMinimize])

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
    onWinMotionEnd,
    onFrameAnimEnd: onWinMotionEnd,
    onFocus: () => onFocusRef.current(),
  }
}
