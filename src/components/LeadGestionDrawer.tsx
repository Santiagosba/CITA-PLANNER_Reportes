import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type AnimationEvent as ReactAnimationEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import {
  FileText,
  MessageSquare,
  PhoneCall,
  Play,
  Printer,
  Server,
  Sparkles,
  TriangleAlert,
  User,
  Volume2,
} from 'lucide-react'
import ActionButton, { type ActionStatus } from './ui/ActionButton'
import VehiclePlate from './ui/VehiclePlate'
import { formatFecha, isPeticionPendiente, type PeticionPendiente } from '../lib/peticionesPendientes'
import { isSlaCritico } from '../lib/tallerStations'
import {
  applyScatterVars,
  applyWinRectToElement,
  cursorForSides,
  resizeRectFromPointer,
  sidesFromEdge,
  type Edge,
  type WinRect,
} from '../lib/osWindowDrag'

type TabId = 'resumen' | 'transcripcion' | 'dms'
type AnimPhase = 'enter' | 'idle' | 'closing' | 'minimizing'
type EnterFrom = 'spawn' | 'restore'
type MinimizeStyle = 'dock' | 'side'

export type { WinRect }

type Props = {
  peticion: PeticionPendiente
  saveStatus: ActionStatus
  gestionObs: string
  rect: WinRect
  zIndex: number
  maximized?: boolean
  enterFrom?: EnterFrom
  /** Incrementar para forzar minimizado animado (p. ej. click en fondo). */
  minimizeRequest?: number
  minimizeStyle?: MinimizeStyle
  staggerMs?: number
  onFocus: () => void
  onRectChange: (rect: WinRect) => void
  onGestionObsChange: (v: string) => void
  onMarkGestionado: (gestionado: boolean) => void
  onClose: () => void
  onMinimize: () => void
  onToggleMaximize: () => void
}

const MIN_W = 420
const MIN_H = 420
const RESIZE_EDGES: Edge[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']
const WAVE_HEIGHTS = [25, 40, 60, 30, 80, 50, 90, 75, 40, 65, 85, 30, 70, 95, 80, 55, 35, 75, 90, 60, 45, 85, 40, 30, 65, 80, 50, 35]

function reducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function applyDockVars(el: HTMLElement) {
  const dock = document.querySelector('.call-agenda-root:not(.is-tucking)') as HTMLElement | null
  const win = el.getBoundingClientRect()
  const winCx = win.left + win.width / 2
  const winCy = win.top + win.height / 2
  let dockCx = window.innerWidth - 96
  let dockCy = window.innerHeight - 96
  if (dock) {
    const d = dock.getBoundingClientRect()
    dockCx = d.left + d.width / 2
    dockCy = d.top + Math.min(36, d.height / 2)
  }
  el.style.setProperty('--dock-dx', `${dockCx - winCx}px`)
  el.style.setProperty('--dock-dy', `${dockCy - winCy}px`)
}

function pulseAgendaCatch() {
  const dock = document.querySelector('.call-agenda-root:not(.is-tucked)')
  if (!dock) return
  dock.classList.remove('is-catching')
  void (dock as HTMLElement).offsetWidth
  dock.classList.add('is-catching')
  window.setTimeout(() => dock.classList.remove('is-catching'), 700)
}

function LeadGestionDrawer({
  peticion: p,
  saveStatus,
  gestionObs,
  rect,
  zIndex,
  maximized = false,
  enterFrom = 'spawn',
  minimizeRequest = 0,
  minimizeStyle = 'dock',
  staggerMs = 0,
  onFocus,
  onRectChange,
  onGestionObsChange,
  onMarkGestionado,
  onClose,
  onMinimize,
  onToggleMaximize,
}: Props) {
  const [tab, setTab] = useState<TabId>('resumen')
  const [playing, setPlaying] = useState(false)
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
  const phaseRef = useRef(phase)
  const maxTweenReadyRef = useRef(false)

  useEffect(() => {
    if (dragRef.current) return
    rectRef.current = rect
  }, [rect])

  useEffect(() => {
    maximizedRef.current = maximized
    if (!maxTweenReadyRef.current) {
      maxTweenReadyRef.current = true
      return
    }
    const el = rootRef.current
    if (!el) return
    el.classList.add('is-size-tween')
    const t = window.setTimeout(() => el.classList.remove('is-size-tween'), 450)
    return () => {
      window.clearTimeout(t)
      el.classList.remove('is-size-tween')
    }
  }, [maximized])

  useEffect(() => {
    onRectChangeRef.current = onRectChange
  }, [onRectChange])

  useEffect(() => {
    onFocusRef.current = onFocus
  }, [onFocus])

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    onMinimizeRef.current = onMinimize
  }, [onMinimize])

  useEffect(() => {
    phaseRef.current = phase
  }, [phase])

  useEffect(() => {
    setTab('resumen')
    setPlaying(false)
  }, [p.idpeticion])

  useLayoutEffect(() => {
    const el = rootRef.current
    if (!el || phase !== 'enter') return
    applyDockVars(el)
  }, [phase])

  const c = p.cita
  const cliente = c ? [c.nombre, c.apellidos].filter(Boolean).join(' ') : ''
  const titulo = c
    ? [c.marca, c.modelo].filter(Boolean).join(' ') || cliente || 'Vehículo sin datos'
    : cliente || p.caller || 'Consulta sin nombre'
  const telRaw = p.caller?.replace(/\s/g, '') ?? ''
  const telHref = telRaw ? `tel:${telRaw}` : null
  const waHref = telRaw ? `https://wa.me/${telRaw.replace(/^\+/, '')}` : null
  const pendiente = isPeticionPendiente(p)
  const sla = isSlaCritico(p.fechainicio) || isSlaCritico(c?.fecha)
  const urgency = sla ? 82 : pendiente ? 55 : 28

  const applyLiveRect = useCallback((next: WinRect) => {
    const el = rootRef.current
    if (!el) return
    liveRectRef.current = next
    rectRef.current = next
    applyWinRectToElement(el, next)
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
    el?.classList.remove('is-gesturing', 'is-moving', 'is-resizing')
    el?.style.setProperty('--win-tilt', '0deg')
    document.body.style.userSelect = ''
    document.body.style.cursor = ''
    if (finalRect) onRectChangeRef.current(finalRect)
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
        applyLiveRect({
          x: Math.max(0, Math.min(d.sx + dx, window.innerWidth - 120)),
          y: Math.max(0, Math.min(d.sy + dy, window.innerHeight - 56)),
          w: d.sw,
          h: d.sh,
        })
        return
      }

      const origin = { x: d.sx, y: d.sy, w: d.sw, h: d.sh }
      applyLiveRect(
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
  }, [applyLiveRect, endGesture])

  useLayoutEffect(() => {
    if (!dragRef.current || !liveRectRef.current || !rootRef.current) return
    applyWinRectToElement(rootRef.current, liveRectRef.current)
  })

  const beginGesture = useCallback((mode: 'move' | 'resize') => {
    const el = rootRef.current
    el?.classList.add('is-gesturing', mode === 'move' ? 'is-moving' : 'is-resizing')
    document.body.style.userSelect = 'none'
    if (phaseRef.current === 'enter') setPhase('idle')
  }, [])

  const startMove = useCallback(
    (e: ReactPointerEvent) => {
      if (e.button !== 0 || maximizedRef.current) return
      if (phaseRef.current === 'closing' || phaseRef.current === 'minimizing') return
      const target = e.target as HTMLElement
      if (target.closest('button, a, input, textarea, select')) return
      onFocusRef.current()
      e.preventDefault()
      e.stopPropagation()
      const r = rectRef.current
      dragRef.current = {
        mode: 'move',
        ox: e.clientX,
        oy: e.clientY,
        sx: r.x,
        sy: r.y,
        sw: r.w,
        sh: r.h,
      }
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
      dragRef.current = {
        mode: 'resize',
        edge,
        ox: e.clientX,
        oy: e.clientY,
        sx: r.x,
        sy: r.y,
        sw: r.w,
        sh: r.h,
      }
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

  const requestMinimize = useCallback((style: MinimizeStyle = 'dock') => {
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
  }, [staggerMs])

  useEffect(() => {
    if (!minimizeRequest || minimizeRequest === lastMinReqRef.current) return
    lastMinReqRef.current = minimizeRequest
    requestMinimize(minimizeStyle)
  }, [minimizeRequest, minimizeStyle, requestMinimize])

  const onFrameAnimEnd = useCallback((e: ReactAnimationEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return
    const name = e.animationName
    if (phaseRef.current === 'enter' && (name.includes('os-win-spawn') || name.includes('os-win-restore'))) {
      const frame = e.currentTarget
      frame.style.opacity = '1'
      frame.style.transform = 'translateZ(0)'
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

  const style = maximized
    ? { left: 12, top: 12, width: 'calc(100vw - 24px)', height: 'calc(100vh - 24px)', zIndex }
    : { left: rect.x, top: rect.y, width: rect.w, height: rect.h, zIndex }

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
      className={`lead-os-window${maximized ? ' is-maximized' : ''}${phaseClass}`}
      style={style}
      role="dialog"
      aria-labelledby={`lead-title-${p.idpeticion}`}
      onMouseDown={onFocus}
    >
      <div
        className="lead-modal lead-os-frame"
        onAnimationEnd={onFrameAnimEnd}
      >
        <header className="lead-modal-header lead-os-titlebar" onPointerDown={startMove}>
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
              title={maximized ? 'Restaurar' : 'Maximizar'}
              aria-label={maximized ? 'Restaurar' : 'Maximizar'}
              onClick={onToggleMaximize}
            />
          </div>

          <div className="lead-modal-title-row">
            {c?.matricula ? <VehiclePlate value={c.matricula} className="lead-modal-plate" /> : (
              <span className="ops-feed-placeholder">SIN MATRÍCULA</span>
            )}
            <div className="lead-modal-title-text">
              <div className="lead-modal-heading">
                <h2 id={`lead-title-${p.idpeticion}`}>{titulo}</h2>
                {c?.fecha ? <span className="badge tone-muted">{formatFecha(c.fecha)}</span> : null}
              </div>
              <p className="lead-modal-sub">
                {p.tipopeticion || 'Sin tipo'} · Consulta {formatFecha(p.fechainicio)}
              </p>
            </div>
          </div>

          <div className="lead-modal-header-actions">
            <button type="button" className="ghost-button lead-icon-btn" title="Imprimir ficha" onClick={() => window.print()}>
              <Printer size={16} />
            </button>
          </div>
        </header>

        <div className="lead-modal-client">
          <div className="lead-modal-client-id">
            <span className="lead-drawer-avatar" aria-hidden>
              <User size={14} />
            </span>
            <div className="lead-modal-client-text">
              <strong>{cliente || p.caller || 'Cliente sin nombre'}</strong>
              <span className="font-mono">{p.caller || 'Sin teléfono'}</span>
            </div>
          </div>
          <div className="lead-modal-contact">
            {telHref ? (
              <a href={telHref} className="confirm-action lead-contact-btn">
                <PhoneCall size={14} />
                Llamar
              </a>
            ) : null}
            {waHref ? (
              <a href={waHref} target="_blank" rel="noreferrer" className="ghost-button lead-contact-btn is-wa">
                <MessageSquare size={14} />
                WhatsApp
              </a>
            ) : null}
          </div>
        </div>

        <div className="lead-voice-card">
          <div className="lead-voice-meta">
            <div className="lead-voice-label">
              <span className={`lead-voice-dot ${playing ? 'is-live' : ''}`} />
              <span>
                Grabación de voz Laura · {formatFecha(p.fechainicio)}
                {sla ? ' · SLA crítico' : ''}
              </span>
            </div>
            <span className="font-mono lead-voice-time">{playing ? '00:12' : '00:00'} / 02:48</span>
          </div>
          <div className="lead-voice-wave" aria-hidden>
            {WAVE_HEIGHTS.map((h, i) => (
              <span
                key={i}
                className={`lead-voice-bar ${playing && i < 4 ? 'is-active' : ''}`}
                style={{ height: `${h}%` }}
              />
            ))}
          </div>
          <div className="lead-voice-controls">
            <div className="lead-voice-controls-left">
              <button
                type="button"
                className="lead-play-btn"
                onClick={() => setPlaying((v) => !v)}
                aria-label={playing ? 'Pausar' : 'Reproducir'}
              >
                <Play size={16} fill="currentColor" />
              </button>
              <Volume2 size={16} aria-hidden className="lead-voice-vol" />
              <span className="badge tone-muted">1x</span>
            </div>
            <p className="lead-voice-hint">
              <Sparkles size={12} />
              Voz transcrita por Laura (Whisper ASR)
            </p>
          </div>
        </div>

        <div className="lead-modal-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'resumen'}
            className={`lead-modal-tab ${tab === 'resumen' ? 'is-active' : ''}`}
            onClick={() => setTab('resumen')}
          >
            <Sparkles size={14} />
            Resumen IA Laura
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'transcripcion'}
            className={`lead-modal-tab ${tab === 'transcripcion' ? 'is-active' : ''}`}
            onClick={() => setTab('transcripcion')}
          >
            <FileText size={14} />
            Transcripción
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'dms'}
            className={`lead-modal-tab ${tab === 'dms' ? 'is-active' : ''}`}
            onClick={() => setTab('dms')}
          >
            <Server size={14} />
            Sync DMS
          </button>
        </div>

        <div className="lead-modal-body custom-scrollbar-light">
          {tab === 'resumen' ? (
            <div className="lead-drawer-stack">
              <section className="lead-info-card">
                <p className="lead-info-eyebrow">
                  <Sparkles size={14} />
                  Diagnóstico síntesis Laura
                </p>
                <p className="lead-info-quote">
                  {p.descripcion?.trim()
                    ? `“${p.descripcion.trim()}”`
                    : '“Sin descripción de triage todavía.”'}
                </p>
              </section>

              <div className="lead-info-grid">
                <section className="lead-info-card">
                  <div className="lead-info-row">
                    <span>Termómetro de urgencia</span>
                    <strong className="font-mono">{urgency}%</strong>
                  </div>
                  <div className="progress-bar" role="progressbar" aria-valuenow={urgency} aria-valuemin={0} aria-valuemax={100}>
                    <div className="progress-bar-fill" style={{ width: `${urgency}%` }} />
                  </div>
                  <small>{sla ? 'Prioridad máxima (alerta SLA)' : pendiente ? 'Pendiente de validación' : 'Ya tiene cita'}</small>
                </section>
                <section className="lead-info-card">
                  <span className="lead-info-muted">Sentimiento del cliente</span>
                  <strong className="lead-sentiment">
                    <span className="lead-sentiment-dot" />
                    Neutral
                  </strong>
                  <small>Analizado por entonación y palabras clave</small>
                </section>
              </div>

              <section className="lead-info-card">
                <h3 className="lead-info-title">
                  <TriangleAlert size={14} />
                  Síntomas y averías
                </h3>
                <ul className="lead-bullet-list">
                  <li>
                    <span className="lead-bullet-dot" />
                    {p.tipopeticion || 'Tipo de consulta sin clasificar'}
                  </li>
                  {p.descripcion ? (
                    <li>
                      <span className="lead-bullet-dot" />
                      {p.descripcion}
                    </li>
                  ) : null}
                  <li>
                    <span className="lead-bullet-dot" />
                    {c?.matricula ? `Matrícula vinculada: ${c.matricula}` : 'Sin matrícula en CRM'}
                  </li>
                </ul>
              </section>

              <label className="field-label" htmlFor={`lead-obs-${p.idpeticion}`}>
                Notas del asesor
                <textarea
                  id={`lead-obs-${p.idpeticion}`}
                  className="field-input field-textarea"
                  rows={3}
                  placeholder="Qué has hecho con esta consulta…"
                  value={gestionObs}
                  onChange={(e) => onGestionObsChange(e.target.value)}
                />
              </label>
            </div>
          ) : null}

          {tab === 'transcripcion' ? (
            <div className="lead-drawer-stack">
              <section className="lead-info-card">
                <p className="lead-info-eyebrow">Turno a turno</p>
                <div className="lead-transcript">
                  <p>
                    <strong>Laura:</strong> Hola, soy Laura del taller. ¿En qué puedo ayudarte?
                  </p>
                  <p>
                    <strong>Cliente:</strong> {p.descripcion?.trim() || 'Consulta recibida sin texto detallado.'}
                  </p>
                  <p>
                    <strong>Laura:</strong> Perfecto, derivo el caso a un asesor para validación presencial o pericial.
                  </p>
                </div>
              </section>
            </div>
          ) : null}

          {tab === 'dms' ? (
            <div className="lead-drawer-stack">
              <section className="lead-info-card">
                <p className="lead-info-eyebrow">
                  <Server size={14} />
                  Sincronización DMS Quiter
                </p>
                <dl className="prow-detail-grid">
                  <div className="prow-detail">
                    <dt>Estado cita</dt>
                    <dd>{pendiente ? 'Sin cita en calendario' : 'Cita vinculada'}</dd>
                  </div>
                  <div className="prow-detail">
                    <dt>ID petición</dt>
                    <dd className="font-mono">{p.idpeticion}</dd>
                  </div>
                  <div className="prow-detail">
                    <dt>ID cita</dt>
                    <dd className="font-mono">{p.idcita || '—'}</dd>
                  </div>
                  <div className="prow-detail">
                    <dt>Email gestión</dt>
                    <dd>{p.gestionemail || '—'}</dd>
                  </div>
                </dl>
              </section>
            </div>
          ) : null}
        </div>

        <footer className="lead-modal-footer">
          <div className="lead-drawer-status">
            <span>Estado:</span>
            <strong>{p.gestionado ? 'En gestión' : pendiente ? 'Pendiente / Triage Laura' : 'Con cita'}</strong>
          </div>
          <div className="lead-modal-footer-actions">
            <button
              type="button"
              className="ghost-button"
              disabled={saveStatus === 'loading'}
              onClick={() => onMarkGestionado(false)}
            >
              Guardar nota
            </button>
            <ActionButton
              variant="success"
              status={saveStatus}
              successLabel="Confirmado"
              onClick={() => onMarkGestionado(true)}
              className="lead-confirm-btn"
            >
              Confirmar y cerrar
            </ActionButton>
          </div>
        </footer>
      </div>

      {!maximized
        ? RESIZE_EDGES.map((edge) => (
            <span key={edge} className={`os-resize-handle edge-${edge}`} onPointerDown={startResize(edge)} />
          ))
        : null}
    </div>
  )
}

export default memo(LeadGestionDrawer)
