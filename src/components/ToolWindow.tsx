import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type AnimationEvent as ReactAnimationEvent,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
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
import { useLiquidGlass } from '../hooks/useLiquidGlass'

type AnimPhase = 'enter' | 'idle' | 'closing' | 'minimizing'
type MinimizeStyle = 'dock' | 'side'

type Props = {
  title: string
  icon?: ReactNode
  /** Texto pequeño a la derecha del título (estado, número…). */
  meta?: ReactNode
  className?: string
  rect: WinRect
  zIndex: number
  maximized?: boolean
  enterFrom?: 'spawn' | 'restore'
  /** Incrementar para forzar minimizado animado (clic en fondo). */
  minimizeRequest?: number
  minimizeStyle?: MinimizeStyle
  staggerMs?: number
  minW?: number
  minH?: number
  onFocus: () => void
  onRectChange: (rect: WinRect) => void
  onClose: () => void
  onMinimize: () => void
  onToggleMaximize: () => void
  children: ReactNode
}

const RESIZE_EDGES: Edge[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']

function reducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Ventana de «app» del escritorio (teléfono, notas…). Misma mecánica que las
 * fichas de gestión: arrastrar, redimensionar, semáforo cerrar/minimizar/agrandar,
 * animaciones de aparición, cierre y minimizado hacia la barra de tareas.
 */
export default function ToolWindow({
  title,
  icon,
  meta,
  className = '',
  rect,
  zIndex,
  maximized = false,
  enterFrom = 'spawn',
  minimizeRequest = 0,
  minimizeStyle = 'dock',
  staggerMs = 0,
  minW = 320,
  minH = 320,
  onFocus,
  onRectChange,
  onClose,
  onMinimize,
  onToggleMaximize,
  children,
}: Props) {
  const [phase, setPhase] = useState<AnimPhase>(() => (reducedMotion() ? 'idle' : 'enter'))
  const [minStyle, setMinStyle] = useState<MinimizeStyle>('dock')
  const rootRef = useRef<HTMLDivElement>(null)
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
  } | null>(null)
  const liveRectRef = useRef<WinRect | null>(null)
  const rafRef = useRef(0)
  const pendingPtrRef = useRef<PointerEvent | null>(null)
  const rectRef = useRef(rect)
  const maximizedRef = useRef(maximized)
  const onRectChangeRef = useRef(onRectChange)
  const onFocusRef = useRef(onFocus)
  const onCloseRef = useRef(onClose)
  const onMinimizeRef = useRef(onMinimize)
  const onToggleMaximizeRef = useRef(onToggleMaximize)
  const phaseRef = useRef(phase)
  const maxFromRef = useRef<DOMRect | null>(null)
  const maxAnimationRef = useRef<Animation | null>(null)

  useEffect(() => {
    if (dragRef.current) return
    rectRef.current = rect
  }, [rect])

  useLayoutEffect(() => {
    maximizedRef.current = maximized
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
  }, [maximized])

  useEffect(() => {
    onRectChangeRef.current = onRectChange
    onFocusRef.current = onFocus
    onCloseRef.current = onClose
    onMinimizeRef.current = onMinimize
    onToggleMaximizeRef.current = onToggleMaximize
  }, [onRectChange, onFocus, onClose, onMinimize, onToggleMaximize])

  useEffect(() => {
    phaseRef.current = phase
  }, [phase])

  useLayoutEffect(() => {
    const el = rootRef.current
    if (!el || phase !== 'enter') return
    applyDockVars(el)
  }, [phase])

  const applyLiveRect = useCallback((next: WinRect) => {
    const el = rootRef.current
    if (!el) return
    liveRectRef.current = next
    rectRef.current = next
    applyWinRectToElement(el, next)
  }, [])

  const applyLiveMove = useCallback((origin: WinRect, next: WinRect) => {
    const el = rootRef.current
    if (!el) return
    liveRectRef.current = next
    rectRef.current = next
    applyWinMoveToElement(el, origin, next)
  }, [])

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
    if (finalRect) {
      refreshLiquidGlass(el)
      onRectChangeRef.current(finalRect)
    }
  }, [])

  useEffect(() => {
    const flushPointer = () => {
      rafRef.current = 0
      const e = pendingPtrRef.current
      const d = dragRef.current
      if (!e || !d) return
      if (d.mode === 'move') {
        const dx = e.clientX - d.ox
        const dy = e.clientY - d.oy
        applyLiveMove({ x: d.sx, y: d.sy, w: d.sw, h: d.sh }, {
          x: Math.max(0, Math.min(d.sx + dx, window.innerWidth - 120)),
          y: Math.max(0, Math.min(d.sy + dy, window.innerHeight - 56)),
          w: d.sw,
          h: d.sh,
        })
        return
      }
      applyLiveRect(
        resizeRectFromPointer({
          origin: { x: d.sx, y: d.sy, w: d.sw, h: d.sh },
          sides: sidesFromEdge(d.edge!),
          clientX: e.clientX,
          clientY: e.clientY,
          minW,
          minH,
        }),
      )
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
  }, [applyLiveMove, applyLiveRect, endGesture, minW, minH])

  const beginGesture = useCallback((mode: 'move' | 'resize') => {
    rootRef.current?.classList.add('is-gesturing', mode === 'move' ? 'is-moving' : 'is-resizing')
    document.body.style.userSelect = 'none'
    if (phaseRef.current === 'enter') setPhase('idle')
  }, [])

  const startMove = useCallback(
    (e: ReactPointerEvent) => {
      if (e.button !== 0 || maximizedRef.current) return
      if (phaseRef.current === 'closing' || phaseRef.current === 'minimizing') return
      if ((e.target as HTMLElement).closest('button, a, input, textarea, select')) return
      onFocusRef.current()
      e.preventDefault()
      e.stopPropagation()
      const r = rectRef.current
      dragRef.current = { mode: 'move', ox: e.clientX, oy: e.clientY, sx: r.x, sy: r.y, sw: r.w, sh: r.h }
      liveRectRef.current = r
      beginGesture('move')
      document.body.style.cursor = 'move'
    },
    [beginGesture],
  )

  const startResize = useCallback(
    (edge: Edge) => (e: ReactPointerEvent) => {
      if (e.button !== 0 || maximizedRef.current) return
      if (phaseRef.current === 'closing' || phaseRef.current === 'minimizing') return
      e.stopPropagation()
      e.preventDefault()
      onFocusRef.current()
      const r = rectRef.current
      dragRef.current = { mode: 'resize', edge, ox: e.clientX, oy: e.clientY, sx: r.x, sy: r.y, sw: r.w, sh: r.h }
      liveRectRef.current = r
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

  const requestToggleMaximize = useCallback(() => {
    if (phaseRef.current === 'closing' || phaseRef.current === 'minimizing') return
    maxFromRef.current = rootRef.current?.getBoundingClientRect() ?? null
    onToggleMaximizeRef.current()
  }, [])

  useEffect(() => {
    if (!minimizeRequest || minimizeRequest === lastMinReqRef.current) return
    lastMinReqRef.current = minimizeRequest
    // Si la animación anterior se quedó a medias (típico del teléfono),
    // no ignoremos el nuevo pedido: recógelo ya.
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

  const frameRef = useRef<HTMLDivElement>(null)
  const glassDefs = useLiquidGlass(frameRef)

  const style: CSSProperties & Record<'--tool-min-w' | '--tool-min-h', string> = maximized
    ? { left: 12, top: 12, width: 'calc(100vw - 24px)', height: 'calc(100vh - 24px)', zIndex, '--tool-min-w': `${minW}px`, '--tool-min-h': `${minH}px` }
    : { left: rect.x, top: rect.y, width: rect.w, height: rect.h, zIndex, '--tool-min-w': `${minW}px`, '--tool-min-h': `${minH}px` }

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

  return (
    <div
      ref={rootRef}
      className={`lead-os-window tool-window ${className}${maximized ? ' is-maximized' : ''}${phaseClass}`}
      style={style}
      role="dialog"
      aria-label={title}
      onMouseDown={onFocus}
    >
      <div ref={frameRef} className="lead-modal lead-os-frame tool-window-frame" onAnimationEnd={onFrameAnimEnd}>
        {glassDefs}
        <header className="lead-os-titlebar tool-window-titlebar" onPointerDown={startMove} onDoubleClick={requestToggleMaximize}>
          <div className="lead-window-controls" role="toolbar" aria-label="Controles de ventana">
            <button type="button" className="lead-traffic close" title="Cerrar" aria-label="Cerrar" onClick={requestClose} />
            <button
              type="button"
              className="lead-traffic minimize"
              title="Minimizar"
              aria-label="Minimizar"
              onClick={() => requestMinimize('dock')}
            />
            <button
              type="button"
              className="lead-traffic zoom"
              title={maximized ? 'Restaurar' : 'Agrandar'}
              aria-label={maximized ? 'Restaurar' : 'Agrandar'}
              onClick={requestToggleMaximize}
            />
          </div>
          <div className="tool-window-title">
            {icon ? <span className="tool-window-icon" aria-hidden>{icon}</span> : null}
            <strong>{title}</strong>
          </div>
          {meta ? <div className="tool-window-meta">{meta}</div> : null}
        </header>
        <div className="tool-window-body custom-scrollbar-light">{children}</div>
      </div>

      {!maximized
        ? RESIZE_EDGES.map((edge) => (
            <span key={edge} className={`os-resize-handle edge-${edge}`} onPointerDown={startResize(edge)} />
          ))
        : null}
    </div>
  )
}
