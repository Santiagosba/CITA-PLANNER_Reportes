import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type AnimationEvent as ReactAnimationEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { GripVertical, ListTodo, Phone, PhoneCall, X } from 'lucide-react'
import type { PeticionPendiente } from '../lib/peticionesPendientes'
import { formatFecha } from '../lib/peticionesPendientes'
import {
  applyScatterVars,
  applyWinRectToElement,
  cursorForSides,
  resizeRectFromPointer,
  sidesFromEdge,
  type Edge,
} from '../lib/osWindowDrag'

const POS_KEY = 'avi-call-agenda-pos'
const SIZE_KEY = 'avi-call-agenda-size'
const MIN_W = 280
const MIN_H = 120
const MAX_TASKS = 20
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
  onUntuck?: () => void
  onOpen: (id: string) => void
  onMinimize: (id: string) => void
  onClose: (id: string) => void
  onCloseAll: () => void
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
  const cliente = c ? [c.nombre, c.apellidos].filter(Boolean).join(' ') : ''
  const name = cliente || p.caller || 'Cliente sin nombre'
  const phone = p.caller || c?.movil || c?.telefono || 'Sin teléfono'
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
  onUntuck,
  onOpen,
  onMinimize,
  onClose,
  onCloseAll,
}: Props) {
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
  const [mounted, setMounted] = useState(() => sessions.length > 0)
  const [phase, setPhase] = useState<'enter' | 'idle' | 'exiting'>(() =>
    sessions.length > 0 && !reducedMotion() ? 'enter' : 'idle',
  )
  const [deskVisual, setDeskVisual] = useState<'panel' | 'tucking' | 'peek'>('panel')
  const prevCountRef = useRef(sessions.length)

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

  useEffect(() => {
    const onResize = () => setPos((prev) => clampPos(prev.x, prev.y, sizeRef.current.w, sizeRef.current.h))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const applyLive = useCallback((next: { x: number; y: number; w: number; h: number }) => {
    const el = rootRef.current
    if (!el) return
    liveRef.current = next
    posRef.current = { x: next.x, y: next.y }
    sizeRef.current = { w: next.w, h: next.h }
    applyWinRectToElement(el, next)
  }, [])

  const endGesture = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
    }
    pendingPtrRef.current = null
    const final = liveRef.current
    dragRef.current = null
    liveRef.current = null
    rootRef.current?.classList.remove('is-gesturing')
    document.body.style.userSelect = ''
    document.body.style.cursor = ''
    if (!final) return
    const nextPos = clampPos(final.x, final.y, final.w, final.h)
    const nextSize = { w: final.w, h: final.h }
    setPos(nextPos)
    setSize(nextSize)
    persistLayout(nextPos, nextSize)
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
        applyLive({ ...next, w: d.sw, h: d.sh })
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
      e.preventDefault()
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

    window.addEventListener('pointermove', onPointerMove, { passive: false })
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerUp)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerUp)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [applyLive, endGesture])

  useLayoutEffect(() => {
    if (!dragRef.current || !liveRef.current || !rootRef.current) return
    applyWinRectToElement(rootRef.current, liveRef.current)
  })

  const beginGesture = useCallback(() => {
    rootRef.current?.classList.add('is-gesturing')
    document.body.style.userSelect = 'none'
  }, [])

  const phaseRef = useRef(phase)
  useEffect(() => {
    phaseRef.current = phase
  }, [phase])

  useEffect(() => {
    const prev = prevCountRef.current
    prevCountRef.current = sessions.length
    if (sessions.length > 0) {
      if (!mounted || phaseRef.current === 'exiting') {
        setMounted(true)
        setPhase(reducedMotion() ? 'idle' : 'enter')
      }
      return
    }
    if (mounted && prev > 0) {
      if (reducedMotion()) {
        setMounted(false)
        setPhase('idle')
      } else {
        setPhase('exiting')
      }
    }
  }, [sessions.length, mounted])

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
    if (tucked && sessions.length > 0) {
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
  }, [tucked, sessions.length, deskVisual])

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
      beginGesture()
      document.body.style.cursor = 'move'
    },
    [beginGesture],
  )

  const startResize = useCallback(
    (edge: Edge) => (e: ReactPointerEvent) => {
      if (e.button !== 0) return
      e.stopPropagation()
      e.preventDefault()
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
      beginGesture()
      document.body.style.cursor = cursorForSides(sidesFromEdge(edge))
    },
    [beginGesture],
  )

  if (deskVisual === 'peek' && sessions.length > 0) {
    return (
      <button
        type="button"
        className="agenda-peek"
        onClick={onUntuck}
        title="Mostrar agenda de tareas"
      >
        <ListTodo size={16} />
        <span>Agenda</span>
        <em>{sessions.length}</em>
      </button>
    )
  }

  if (!mounted && sessions.length === 0) return null
  if (!mounted) return null

  const openCount = sessions.filter((s) => !s.minimized).length
  const phaseClass =
    deskVisual === 'tucking'
      ? ' is-tucking'
      : phase === 'enter'
        ? ' is-enter'
        : phase === 'exiting'
          ? ' is-exiting'
          : ''

  return (
    <div
      ref={rootRef}
      className={`call-agenda-root is-panel${phaseClass}`}
      style={{ left: pos.x, top: pos.y, width: size.w, height: size.h }}
    >
      <div className="call-agenda-panel" onAnimationEnd={onPanelAnimEnd}>
        <header className="call-agenda-panel-head" onPointerDown={startMove}>
          <div className="call-agenda-spine" aria-hidden>
            <GripVertical size={14} />
          </div>
          <div className="call-agenda-panel-title">
            <span className="call-agenda-eyebrow">
              <ListTodo size={12} />
              Agenda de tareas
            </span>
            <strong>
              {sessions.length}/{MAX_TASKS} tareas
              {openCount > 0 ? ` · ${openCount} abiertas` : ''}
            </strong>
          </div>
          <button
            type="button"
            className="ghost-button lead-icon-btn call-agenda-clear"
            title="Vaciar agenda"
            onClick={onCloseAll}
            disabled={sessions.length === 0 || phase === 'exiting' || deskVisual === 'tucking'}
          >
            <X size={15} />
          </button>
        </header>

        <ul className="call-agenda-list custom-scrollbar-light">
          {sessions.map((session) => {
            const { name, phone, detail } = sessionLabel(session.peticion)
            return (
              <li
                key={session.id}
                className={`call-agenda-item${session.active ? ' is-active' : ''}${session.minimized ? '' : ' is-open'}`}
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
      </div>

      {RESIZE_EDGES.map((edge) => (
        <span key={edge} className={`os-resize-handle edge-${edge}`} onPointerDown={startResize(edge)} />
      ))}
    </div>
  )
}

export { MAX_TASKS }
