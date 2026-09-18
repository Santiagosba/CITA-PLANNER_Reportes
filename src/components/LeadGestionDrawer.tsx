import { memo, useEffect, useMemo, useState } from 'react'
import {
  Car,
  FileText,
  PhoneCall,
  Server,
  Sparkles,
  TriangleAlert,
  User,
} from 'lucide-react'
import ActionButton, { type ActionStatus } from './ui/ActionButton'
import VehiclePlate from './ui/VehiclePlate'
import ChannelTag from './ChannelTag'
import { LeadCallHistory, LeadCallTranscript } from './LeadCallHistory'
import UrgencyThermometer from './UrgencyThermometer'
import WhatsAppMark from './WhatsAppMark'
import { useCustomerCalls } from '../hooks/useCustomerCalls'
import type { CustomerCallItem } from '../lib/crmApi'
import { inferPeticionTipo, peticionToHistoryItem } from '../lib/interactionLabels'
import { formatFecha, isPeticionPendiente, type PeticionPendiente } from '../lib/peticionesPendientes'
import {
  ticketClientLabel,
  ticketClientPhone,
  ticketClientPhones,
  ticketLooksLikeVoice,
  ticketVehicleLabel,
} from '../lib/ticketClient'
import { scoreTicketUrgency } from '../lib/ticketUrgency'
import TicketClientBlock from './TicketClientBlock'
import TicketOwnerPicker from './TicketOwnerPicker'
import TicketTeamBadge from './TicketTeamBadge'
import type { CrmAppRole } from '../lib/crmRoles'
import type { AdvisorWorkspace } from '../lib/advisorWorkspace'
import type { Workshop } from '../types'
import { useOsWindow } from '../hooks/useOsWindow'
import type { OsPlacement } from '../lib/osGeometry'
import type { Edge, WinRect } from '../lib/osWindowDrag'
import WindowControls from './os/WindowControls'

type TabId = 'resumen' | 'transcripcion' | 'dms'
type EnterFrom = 'spawn' | 'restore'
type MinimizeStyle = 'dock' | 'side'

export type { WinRect }
export type { OsPlacement }

type Props = {
  peticion: PeticionPendiente
  saveStatus: ActionStatus
  gestionObs: string
  rect: WinRect
  zIndex: number
  placement?: OsPlacement
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
  onPlace: (placement: OsPlacement) => void
  workshop?: Workshop
  workspace?: AdvisorWorkspace
  currentUser?: { name: string; email: string }
  appRole?: CrmAppRole
}

const MIN_W = 420
const MIN_H = 420
const RESIZE_EDGES: Edge[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']

function LeadGestionDrawer({
  peticion: p,
  saveStatus,
  gestionObs,
  rect,
  zIndex,
  placement,
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
  onPlace,
  workshop,
  workspace,
  currentUser,
  appRole,
}: Props) {
  const [tab, setTab] = useState<TabId>('resumen')
  const [selectedCall, setSelectedCall] = useState<CustomerCallItem | null>(null)
  const phones = useMemo(
    () => ticketClientPhones(p),
    [p.caller, p.cita?.movil, p.cita?.telefono, p.descripcion, p.gestionobservaciones],
  )
  const calls = useCustomerCalls(phones)
  const os = useOsWindow({
    windowId: `ficha:${p.idpeticion}`,
    title: ticketClientLabel(p),
    rect,
    zIndex,
    placement,
    maximized,
    enterFrom,
    minimizeRequest,
    minimizeStyle,
    staggerMs,
    minW: MIN_W,
    minH: MIN_H,
    onFocus,
    onRectChange,
    onClose,
    onMinimize,
    onPlace,
  })

  useEffect(() => {
    setTab('resumen')
    setSelectedCall(null)
  }, [p.idpeticion])

  const c = p.cita
  const cliente = ticketClientLabel(p)
  const phone = ticketClientPhone(p)
  const vehicle = ticketVehicleLabel(p)
  const titulo = vehicle || 'Coche sin ficha'
  const telRaw = phone.replace(/\s/g, '')
  const telHref = telRaw ? `tel:${telRaw}` : null
  const waHref = telRaw ? `https://wa.me/${telRaw.replace(/^\+/, '')}` : null
  const pendiente = isPeticionPendiente(p)
  const urgencyScore = scoreTicketUrgency(p)
  const channel = inferPeticionTipo(p.tipopeticion)
  const voiceTicket = ticketLooksLikeVoice(p)
  const callCount = useMemo(() => {
    const crmCalls = calls.items.filter((item) => item.tipo === 'llamada')
    if (!voiceTicket) return crmCalls.length
    const ticketAt = Date.parse(String(p.fechainicio || p.fechacreacion || ''))
    const alreadyLogged = crmCalls.some((item) => {
      const at = Date.parse(item.fecha)
      if (!Number.isFinite(ticketAt) || !Number.isFinite(at)) return false
      return Math.abs(at - ticketAt) < 2 * 60 * 60 * 1000
    })
    return crmCalls.length + (alreadyLogged ? 0 : 1)
  }, [calls.items, voiceTicket, p.fechainicio, p.fechacreacion])

  return (
    <div
      ref={os.rootRef}
      className={`lead-os-window${os.tiled ? ' is-maximized' : ''}${os.phaseClass}`}
      style={os.style}
      role="dialog"
      aria-labelledby={`lead-title-${p.idpeticion}`}
      onMouseDown={os.onFocus}
      onTransitionEnd={os.onWinMotionEnd}
    >
      <div ref={os.frameRef} className="lead-modal lead-os-frame">
        {os.glassDefs}
        <header
          className="lead-modal-header lead-os-titlebar"
          onPointerDown={os.startMove}
          onDoubleClick={() => os.requestPlace(os.placement === 'fill' ? 'free' : 'fill')}
        >
          <WindowControls
            placement={os.placement}
            onClose={os.requestClose}
            onMinimize={() => os.requestMinimize('dock')}
            onPlace={os.requestPlace}
          />

          <div className="lead-modal-title-row">
            {c?.matricula ? <VehiclePlate value={c.matricula} className="lead-modal-plate" /> : (
              <span className="lead-modal-car-fallback" aria-hidden>
                <Car size={18} />
              </span>
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
            <span
              className="lead-call-count"
              title={
                voiceTicket
                  ? 'Incluye la llamada que abrió esta consulta y las del teléfono del CRM'
                  : 'Llamadas de este cliente registradas en el teléfono del CRM'
              }
            >
              <PhoneCall size={16} aria-hidden />
              <strong>{calls.loading ? '…' : callCount}</strong>
              <span>{callCount === 1 ? 'llamada' : 'llamadas'}</span>
            </span>
          </div>
        </header>

        <div className="lead-modal-scroll custom-scrollbar-light">
          <div className="lead-modal-client">
            <div className="lead-modal-client-id">
              <span className="lead-drawer-avatar" aria-hidden>
                <User size={18} />
              </span>
              <TicketClientBlock peticion={p} size="lg" />
              {workspace ? <TicketTeamBadge workspace={workspace} ticket={p} /> : null}
              {channel === 'whatsapp' ? <ChannelTag tipo="whatsapp" /> : null}
            </div>
            <div className="lead-modal-contact">
              <div className="lead-modal-contact-actions">
                {telHref ? (
                  <a
                    href={telHref}
                    className="confirm-action lead-contact-btn"
                    data-call-label={cliente}
                    data-call-peticion={p.idpeticion}
                    title="Llamar por Telnyx desde el CRM"
                  >
                    <PhoneCall size={16} />
                    Llamar
                  </a>
                ) : null}
                {waHref ? (
                  <a href={waHref} target="_blank" rel="noreferrer" className="lead-contact-btn is-wa">
                    <WhatsAppMark size={16} />
                    WhatsApp
                  </a>
                ) : null}
              </div>
              {workshop && workspace && currentUser && appRole ? (
                <TicketOwnerPicker
                  workshop={workshop}
                  workspace={workspace}
                  currentUser={currentUser}
                  appRole={appRole}
                  peticion={p}
                  layout="card"
                />
              ) : null}
            </div>
          </div>

          <UrgencyThermometer score={urgencyScore.score} reason={urgencyScore.reasons[0]} />

          <LeadCallHistory
            phone={telRaw}
            calls={calls}
            extraItems={[peticionToHistoryItem(p)]}
            selectedId={selectedCall?.id ?? null}
            onSelect={(item) => {
              setSelectedCall(item)
              setTab('transcripcion')
            }}
          />

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

          <div className="lead-modal-body">
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

                <section className="lead-info-card lead-sentiment-card">
                  <div className="lead-sentiment-head">
                    <span className="lead-info-muted">Sentimiento del cliente</span>
                    <strong className="lead-sentiment">
                      <span className="lead-sentiment-dot" />
                      Neutral
                    </strong>
                  </div>
                  <small className="lead-sentiment-detail">
                    <Sparkles size={13} aria-hidden />
                    Analizado por entonación y palabras clave
                  </small>
                </section>

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
                <LeadCallTranscript phone={telRaw} selected={selectedCall} />
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

      {RESIZE_EDGES.map((edge) => (
        <span
          key={edge}
          className={`os-resize-handle edge-${edge}`}
          aria-hidden="true"
          onPointerDown={os.startResize(edge)}
          onDoubleClick={(e) => {
            e.stopPropagation()
            os.expandEdge(edge)
          }}
        />
      ))}
    </div>
  )
}

export default memo(LeadGestionDrawer)
