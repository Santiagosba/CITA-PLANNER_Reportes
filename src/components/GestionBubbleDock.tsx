import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type AnimationEvent as ReactAnimationEvent,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { GripVertical, ListTodo, Phone, PhoneCall, Wrench, X } from 'lucide-react'
import type { PeticionPendiente } from '../lib/peticionesPendientes'
import { formatFecha } from '../lib/peticionesPendientes'
import { ticketClientLabel, ticketClientPhone } from '../lib/ticketClient'
import { useSoftphone } from '../lib/softphone'
import { APP_META, apps, useActiveAppId, useApps, useTaskbarPinned, type AppId } from '../lib/apps'
import { AppIcon } from './AppWindows'
import { useLiquidGlass } from '../hooks/useLiquidGlass'
import {
  animateWinBox,
  applyScatterVars,
  applyWinMoveToElement,
  applyWinRectToElement,
  commitWinRectToElement,
  cursorForSides,
  refreshLiquidGlass,
  resizeRectFromPointer,
  sidesFromEdge,
  type Edge,
} from '../lib/osWindowDrag'

const POS_KEY = 'avi-call-agenda-pos'
const SIZE_KEY = 'avi-call-agenda-size'
const MIN_W = 280
const MIN_H = 120
const MAX_TASKS = 20

type TaskbarSection = 'tasks' | 'tools'

/** Apps que se lanzan desde «Herramientas»; cada una abre su propia ventana. */
const TOOLS: AppId[] = ['phone', 'notes', 'contacts', 'guide']
const RESIZE_EDGES: Edge[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']

export type AgendaSessionItem = {
  id: string
  peticion: PeticionPendiente
  minimized: boolean
  active: boolean
}

type Pos = { x: number; y: number }
type Size = { w: number; h: number }

type Props = {
  sessions: AgendaSessionItem[]
  tucked?: boolean
  /** Orden de apilado compartido con las fichas: al pulsar la agenda sube al frente. */
  zIndex?: number
  onFocus?: () => void
  onUntuck?: () => void
  /** Botón «minimizar» de la agenda: la recoge en la píldora «Agenda». */
  onTuck?: () => void
  onOpen: (id: string) => void
  onMinimize: (id: string) => void
  onClose: (id: string) => void
  onCloseAll: () => void
}

/** Tamaño «agrandado»: alto casi completo, centrado, sin tapar toda la pantalla. */
function maximizedRect(): { x: number; y: number; w: number; h: number } {
  const margin = 24
  const w = Math.min(760, Math.max(MIN_W, window.innerWidth - margin * 2))
  const h = Math.max(MIN_H, window.innerHeight - margin * 2)
  return { x: Math.round((window.innerWidth - w) / 2), y: margin, w, h }
}

function loadJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

function clampPos(x: number, y: number, w: number, h: number): Pos {
  const maxX = Math.max(8, window.innerWidth - w - 8)
  const maxY = Math.max(8, window.innerHeight - h - 8)
  return {
    x: Math.min(maxX, Math.max(8, x)),
    y: Math.min(maxY, Math.max(8, y)),
  }
}

function defaultPos(w: number, h: number): Pos {
  return clampPos(window.innerWidth - w - 20, window.innerHeight - h - 24, w, h)
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'G'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase()
}

function sessionLabel(p: PeticionPendiente): { name: string; phone: string; detail: string } {
  const c = p.cita
  const name = ticketClientLabel(p)
  const phone = ticketClientPhone(p) || 'Sin teléfono'
  const plate = c?.matricula
  const channel = p.tipopeticion || 'Llamada'
  const when = formatFecha(p.fechainicio)
  const detail = [channel, plate, when].filter(Boolean).join(' · ')
  return { name, phone, detail }
}

function persistLayout(pos: Pos, size: Size) {
  try {
    localStorage.setItem(POS_KEY, JSON.stringify(pos))
    localStorage.setItem(SIZE_KEY, JSON.stringify(size))
  } catch {
    /* ignore */
  }
}

function reducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export default function GestionBubbleDock({
  sessions,
  tucked = false,
  zIndex,
  onFocus,
  onUntuck,
  onTuck,
  onOpen,
  onMinimize,
  onClose,
  onCloseAll,
}: Props) {
  const [maximized, setMaximized] = useState(false)
  const preMaxRef = useRef<{ pos: Pos; size: Size } | null>(null)
  const maxFromRef = useRef<DOMRect | null>(null)
  const maxAnimationRef = useRef<Animation | null>(null)
  const [section, setSection] = useState<TaskbarSection>('tasks')
  const { call: liveCall, status: phoneStatus } = useSoftphone()
  const appWindows = useApps()
  const activeAppId = useActiveAppId()
  const pinned = useTaskbarPinned()
  // La barra existe si hay tareas o si está fijada (botón de cabecera / app minimizada).
  const present = sessions.length > 0 || pinned
  const minimizedApps = appWindows.filter((w) => w.minimized).length
  const [size, setSize] = useState<Size>(() => {
    const saved = loadJson<Size>(SIZE_KEY)
    if (saved?.w && saved?.h) return { w: Math.max(MIN_W, saved.w), h: Math.max(MIN_H, saved.h) }
    return { w: 320, h: 280 }
  })
  const [pos, setPos] = useState<Pos>(() => {
    if (typeof window === 'undefined') return { x: 24, y: 24 }
    const saved = loadJson<Pos>(POS_KEY)
    const s = loadJson<Size>(SIZE_KEY) ?? { w: 320, h: 280 }
    return saved ? clampPos(saved.x, saved.y, s.w, s.h) : defaultPos(s.w, s.h)
  })
  const [mounted, setMounted] = useState(() => present)
  const [phase, setPhase] = useState<'enter' | 'idle' | 'exiting'>(() =>
    present && !reducedMotion() ? 'enter' : 'idle',
  )
  const [deskVisual, setDeskVisual] = useState<'panel' | 'tucking' | 'peek'>('panel')
  const prevPresentRef = useRef(present)

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
  const rootRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  // La barra puede no existir en el primer render. Reactiva la lente cada vez
  // que aparece desde cerrado o desde la píldora minimizada.
  const glassDefs = useLiquidGlass(panelRef, `${mounted}:${deskVisual}`)
  const posRef = useRef(pos)
  const sizeRef = useRef(size)
  const liveRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null)
  const rafRef = useRef(0)
  const pendingPtrRef = useRef<PointerEvent | null>(null)

  useEffect(() => {
    if (dragRef.current) return
    posRef.current = pos
  }, [pos])

  useEffect(() => {
    if (dragRef.current) return
    sizeRef.current = size
  }, [size])

  const maximizedRef = useRef(maximized)
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
    const onResize = () => {
      if (maximizedRef.current) {
        const r = maximizedRect()
        setPos({ x: r.x, y: r.y })
        setSize({ w: r.w, h: r.h })
        return
      }
      // Pantalla más pequeña que la barra: encoge la barra antes de recolocarla.
      const w = Math.max(MIN_W, Math.min(sizeRef.current.w, window.innerWidth - 16))
      const h = Math.max(MIN_H, Math.min(sizeRef.current.h, window.innerHeight - 16))
      if (w !== sizeRef.current.w || h !== sizeRef.current.h) setSize({ w, h })
      setPos((prev) => clampPos(prev.x, prev.y, w, h))
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const toggleMaximize = useCallback(() => {
    maxFromRef.current = rootRef.current?.getBoundingClientRect() ?? null
    if (maximizedRef.current) {
      const prev = preMaxRef.current
      preMaxRef.current = null
      setMaximized(false)
      if (prev) {
        const nextPos = clampPos(prev.pos.x, prev.pos.y, prev.size.w, prev.size.h)
        setPos(nextPos)
        setSize(prev.size)
        persistLayout(nextPos, prev.size)
      }
      return
    }
    preMaxRef.current = { pos: posRef.current, size: sizeRef.current }
    const r = maximizedRect()
    setMaximized(true)
    setPos({ x: r.x, y: r.y })
    setSize({ w: r.w, h: r.h })
  }, [])

  /** Arrastrar o redimensionar a mano deshace el modo agrandado (como una ventana). */
  const leaveMaximized = useCallback(() => {
    if (!maximizedRef.current) return
    maximizedRef.current = false
    preMaxRef.current = null
    setMaximized(false)
  }, [])

  const applyLive = useCallback((next: { x: number; y: number; w: number; h: number }) => {
    const el = rootRef.current
    if (!el) return
    liveRef.current = next
    posRef.current = { x: next.x, y: next.y }
    sizeRef.current = { w: next.w, h: next.h }
    applyWinRectToElement(el, next)
  }, [])

  const applyLiveMove = useCallback(
    (origin: { x: number; y: number; w: number; h: number }, next: { x: number; y: number; w: number; h: number }) => {
      const el = rootRef.current
      if (!el) return
      liveRef.current = next
      posRef.current = { x: next.x, y: next.y }
      sizeRef.current = { w: next.w, h: next.h }
      applyWinMoveToElement(el, origin, next)
    },
    [],
  )

  const endGesture = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
    }
    pendingPtrRef.current = null
    const final = liveRef.current
    dragRef.current = null
    liveRef.current = null
    const el = rootRef.current
    if (el && final) commitWinRectToElement(el, final)
    el?.classList.remove('is-gesturing', 'is-moving', 'is-resizing')
    document.body.style.userSelect = ''
    document.body.style.cursor = ''
    if (!final) return
    const nextPos = clampPos(final.x, final.y, final.w, final.h)
    const nextSize = { w: final.w, h: final.h }
    setPos(nextPos)
    setSize(nextSize)
    persistLayout(nextPos, nextSize)
    refreshLiquidGlass(el)
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
        const next = clampPos(d.sx + dx, d.sy + dy, d.sw, d.sh)
        applyLiveMove(
          { x: d.sx, y: d.sy, w: d.sw, h: d.sh },
          { ...next, w: d.sw, h: d.sh },
        )
        return
      }

      const origin = { x: d.sx, y: d.sy, w: d.sw, h: d.sh }
      applyLive(
        resizeRectFromPointer({
          origin,
          sides: sidesFromEdge(d.edge!),
          clientX: e.clientX,
          clientY: e.clientY,
          minW: MIN_W,
          minH: MIN_H,
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
  }, [applyLive, applyLiveMove, endGesture])

  const beginGesture = useCallback((mode: 'move' | 'resize') => {
    rootRef.current?.classList.add('is-gesturing', mode === 'move' ? 'is-moving' : 'is-resizing')
    document.body.style.userSelect = 'none'
  }, [])

  const phaseRef = useRef(phase)
  useEffect(() => {
    phaseRef.current = phase
  }, [phase])

  useEffect(() => {
    const prev = prevPresentRef.current
    prevPresentRef.current = present
    if (present) {
      if (!mounted || phaseRef.current === 'exiting') {
        setMounted(true)
        setPhase(reducedMotion() ? 'idle' : 'enter')
      }
      return
    }
    if (mounted && prev) {
      if (reducedMotion()) {
        setMounted(false)
        setPhase('idle')
      } else {
        setPhase('exiting')
      }
    }
  }, [present, mounted])

  const onPanelAnimEnd = useCallback((e: ReactAnimationEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return
    const name = e.animationName
    if (phaseRef.current === 'enter' && name.includes('os-agenda-spawn')) {
      setPhase('idle')
      return
    }
    if (phaseRef.current === 'exiting' && name.includes('os-agenda-exit')) {
      setMounted(false)
      setPhase('idle')
      return
    }
    if (name.includes('os-agenda-tuck')) {
      setDeskVisual('peek')
    }
  }, [])

  useEffect(() => {
    if (phase !== 'exiting') return
    const t = window.setTimeout(() => {
      if (phaseRef.current !== 'exiting') return
      setMounted(false)
      setPhase('idle')
    }, 320)
    return () => window.clearTimeout(t)
  }, [phase])

  useEffect(() => {
    if (tucked && present) {
      if (deskVisual === 'peek') return
      if (reducedMotion()) {
        setDeskVisual('peek')
        return
      }
      if (deskVisual !== 'tucking') {
        if (rootRef.current) applyScatterVars(rootRef.current, 40)
        setDeskVisual('tucking')
      }
      return
    }
    if (!tucked && deskVisual !== 'panel') {
      setDeskVisual('panel')
      setMounted(true)
      setPhase(reducedMotion() ? 'idle' : 'enter')
    }
  }, [tucked, present, deskVisual])

  useEffect(() => {
    if (deskVisual !== 'tucking') return
    const t = window.setTimeout(() => setDeskVisual('peek'), 480)
    return () => window.clearTimeout(t)
  }, [deskVisual])

  const startMove = useCallback(
    (e: ReactPointerEvent) => {
      if (e.button !== 0) return
      const target = e.target as HTMLElement
      if (target.closest('button, a, .call-agenda-list')) return
      e.preventDefault()
      leaveMaximized()
      const p = posRef.current
      const s = sizeRef.current
      dragRef.current = {
        mode: 'move',
        ox: e.clientX,
        oy: e.clientY,
        sx: p.x,
        sy: p.y,
        sw: s.w,
        sh: s.h,
      }
      liveRef.current = { x: p.x, y: p.y, w: s.w, h: s.h }
      beginGesture('move')
      document.body.style.cursor = 'move'
    },
    [beginGesture, leaveMaximized],
  )

  const startResize = useCallback(
    (edge: Edge) => (e: ReactPointerEvent) => {
      if (e.button !== 0) return
      e.stopPropagation()
      e.preventDefault()
      onFocus?.()
      leaveMaximized()
      const p = posRef.current
      const s = sizeRef.current
      const origin = { x: p.x, y: p.y, w: s.w, h: s.h }
      dragRef.current = {
        mode: 'resize',
        edge,
        ox: e.clientX,
        oy: e.clientY,
        sx: p.x,
        sy: p.y,
        sw: s.w,
        sh: s.h,
      }
      liveRef.current = origin
      beginGesture('resize')
      document.body.style.cursor = cursorForSides(sidesFromEdge(edge))
    },
    [beginGesture, leaveMaximized, onFocus],
  )

  const onHeadDoubleClick = useCallback(
    (e: ReactMouseEvent) => {
      if ((e.target as HTMLElement).closest('button, a')) return
      toggleMaximize()
    },
    [toggleMaximize],
  )

  if (deskVisual === 'peek' && present) {
    return (
      <button
        type="button"
        className="agenda-peek"
        style={zIndex != null ? { zIndex } : undefined}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={onUntuck}
        title="Mostrar barra de tareas"
      >
        <ListTodo size={16} />
        <span>Tareas</span>
        <em>{sessions.length + minimizedApps}</em>
      </button>
    )
  }

  if (!mounted) return null

  const openCount = sessions.filter((s) => !s.minimized).length
  // Sin tareas, el botón rojo cierra la barra (la desfija); con tareas, las vacía.
  const closeAction = sessions.length > 0 ? onCloseAll : () => apps.unpinTaskbar()
  const closeLabel = sessions.length > 0 ? 'Vaciar tareas' : 'Cerrar barra'
  const phaseClass =
    deskVisual === 'tucking'
      ? ' is-tucking'
      : phase === 'enter'
        ? ' is-enter'
        : phase === 'exiting'
          ? ' is-exiting'
          : ''

  const busy = phase === 'exiting' || deskVisual === 'tucking'
  const rootStyle: CSSProperties = { left: pos.x, top: pos.y, width: size.w, height: size.h }
  if (zIndex != null) rootStyle.zIndex = zIndex

  return (
    <div
      ref={rootRef}
      className={`call-agenda-root is-panel${phaseClass}${maximized ? ' is-maximized' : ''}`}
      style={rootStyle}
      onPointerDown={onFocus}
    >
      <div ref={panelRef} className="call-agenda-panel" onAnimationEnd={onPanelAnimEnd}>
        {glassDefs}
        <header className="call-agenda-panel-head" onPointerDown={startMove} onDoubleClick={onHeadDoubleClick}>
          <div className="call-agenda-spine" aria-hidden>
            <GripVertical size={14} />
          </div>
          <div className="lead-window-controls call-agenda-controls" role="toolbar" aria-label="Controles de la barra">
            <button
              type="button"
              className="lead-traffic close call-agenda-clear"
              title={closeLabel}
              aria-label={closeLabel}
              onClick={closeAction}
              disabled={busy}
            />
            <button
              type="button"
              className="lead-traffic minimize"
              title="Minimizar barra"
              aria-label="Minimizar barra"
              onClick={onTuck}
              disabled={busy || !onTuck}
            />
            <button
              type="button"
              className="lead-traffic zoom"
              title={maximized ? 'Restaurar tamaño' : 'Agrandar barra'}
              aria-label={maximized ? 'Restaurar tamaño' : 'Agrandar barra'}
              onClick={toggleMaximize}
              disabled={busy}
            />
          </div>
          <div className="call-agenda-panel-title">
            <span className="call-agenda-eyebrow">
              <ListTodo size={12} />
              Barra de tareas
            </span>
            <strong
              key={`${section}-${section === 'tools' ? appWindows.length : `${sessions.length}-${openCount}`}`}
              className="taskbar-title-value"
            >
              {section === 'tools'
                ? `Herramientas${appWindows.length > 0 ? ` · ${appWindows.length} ${appWindows.length === 1 ? 'abierta' : 'abiertas'}` : ''}`
                : `${sessions.length}/${MAX_TASKS} tareas${openCount > 0 ? ` · ${openCount} abiertas` : ''}`}
            </strong>
          </div>
        </header>

        <div className="taskbar-tabs" role="tablist" aria-label="Secciones de la barra">
          <button
            type="button"
            role="tab"
            aria-selected={section === 'tasks'}
            className={`taskbar-tab${section === 'tasks' ? ' is-active' : ''}`}
            onClick={() => setSection('tasks')}
          >
            <ListTodo size={13} aria-hidden />
            Tareas
            <em>{sessions.length}</em>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={section === 'tools'}
            className={`taskbar-tab${section === 'tools' ? ' is-active' : ''}`}
            onClick={() => setSection('tools')}
          >
            <Wrench size={13} aria-hidden />
            Herramientas
            {liveCall ? <span className="taskbar-tab-dot" aria-label="Llamada en curso" /> : null}
          </button>
        </div>

        {section === 'tools' ? (
          <div key="tools" className="taskbar-tools taskbar-section-content">
            {TOOLS.map((id, index) => {
              const meta = APP_META[id]
              const win = appWindows.find((w) => w.id === id)
              const state = win ? (win.minimized ? 'Minimizada · pulsa para restaurar' : 'Abierta · pulsa para traer al frente') : null
              const phoneHint = liveCall
                ? 'Llamada en curso'
                : phoneStatus === 'ready'
                  ? meta.hint
                  : phoneStatus === 'connecting'
                    ? 'Conectando…'
                    : phoneStatus === 'off'
                      ? 'Sin configurar'
                      : 'Sin conexión'
              return (
                <button
                  key={id}
                  type="button"
                  className={`taskbar-tool-tile lg-surface${win ? (win.minimized ? ' is-minimized' : ' is-open') : ''}${activeAppId === id ? ' is-active' : ''}`}
                  style={{ animationDelay: `${index * 38}ms` }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => apps.toggleFromTaskbar(id)}
                  aria-pressed={activeAppId === id && !win?.minimized}
                  title={
                    !win
                      ? `Abrir ${meta.label}`
                      : win.minimized
                        ? `Restaurar ${meta.label}`
                        : activeAppId === id
                          ? `Minimizar ${meta.label}`
                          : `Traer ${meta.label} al frente`
                  }
                >
                  <span className={`taskbar-tool-icon is-${id}`} aria-hidden>
                    <AppIcon id={id} size={20} />
                  </span>
                  <strong>{meta.label}</strong>
                  <span>{state ?? (id === 'phone' ? phoneHint : meta.hint)}</span>
                  {win ? <i className="taskbar-tool-running" aria-hidden /> : null}
                </button>
              )
            })}
          </div>
        ) : sessions.length === 0 ? (
          <div key="empty" className="taskbar-empty taskbar-section-content">
            <ListTodo size={22} aria-hidden />
            <strong>Sin tareas abiertas</strong>
            <span>Abre un cliente desde el tablero o la lista y aparecerá aquí.</span>
          </div>
        ) : (
        <ul key="tasks" className="call-agenda-list custom-scrollbar-light taskbar-section-content">
          {sessions.map((session, index) => {
            const { name, phone, detail } = sessionLabel(session.peticion)
            return (
              <li
                key={session.id}
                className={`call-agenda-item${session.active ? ' is-active' : ''}${session.minimized ? '' : ' is-open'}`}
                style={{ animationDelay: `${Math.min(index, 8) * 34}ms` }}
              >
                <button
                  type="button"
                  className="call-agenda-item-main"
                  onClick={() => (session.minimized ? onOpen(session.id) : onMinimize(session.id))}
                  title={session.minimized ? 'Abrir ficha' : 'Minimizar ficha'}
                >
                  <span className="call-agenda-avatar" aria-hidden>
                    {initials(name)}
                  </span>
                  <span className="call-agenda-meta">
                    <strong>{name}</strong>
                    <span className="call-agenda-phone">
                      <Phone size={11} />
                      {phone}
                    </span>
                    <span className="call-agenda-detail">{detail}</span>
                  </span>
                  <span className={`call-agenda-state${session.minimized ? '' : ' is-live'}`}>
                    {session.minimized ? 'En cola' : 'Abierta'}
                  </span>
                </button>
                <div className="call-agenda-item-actions">
                  <button
                    type="button"
                    className="ghost-button"
                    title="Abrir"
                    onClick={() => onOpen(session.id)}
                  >
                    <PhoneCall size={14} />
                  </button>
                  <button
                    type="button"
                    className="ghost-button"
                    title="Quitar"
                    onClick={() => onClose(session.id)}
                  >
                    <X size={14} />
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
        )}

        {appWindows.length > 0 ? (
          <div className="taskbar-dock" role="toolbar" aria-label="Apps abiertas">
            {appWindows.map((w, index) => (
              <button
                key={w.id}
                type="button"
                className={`taskbar-dock-app is-${w.id}${w.minimized ? ' is-minimized' : ''}${activeAppId === w.id ? ' is-active' : ''}`}
                style={{ animationDelay: `${index * 32}ms` }}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => apps.toggleFromTaskbar(w.id)}
                aria-pressed={activeAppId === w.id && !w.minimized}
                title={
                  w.minimized
                    ? `Restaurar ${APP_META[w.id].label}`
                    : activeAppId === w.id
                      ? `Minimizar ${APP_META[w.id].label}`
                      : `Traer ${APP_META[w.id].label} al frente`
                }
                aria-label={`${APP_META[w.id].label}${w.minimized ? ' (minimizada)' : ''}`}
              >
                <AppIcon id={w.id} size={15} />
                <i aria-hidden />
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {RESIZE_EDGES.map((edge) => (
        <span key={edge} className={`os-resize-handle edge-${edge}`} onPointerDown={startResize(edge)} />
      ))}
    </div>
  )
}

export { MAX_TASKS }
