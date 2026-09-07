import { useEffect, useRef, useState } from 'react'
import {
  Check,
  FileText,
  Grid3x3,
  Mic,
  MicOff,
  Pause,
  Phone,
  PhoneIncoming,
  PhoneMissed,
  PhoneOff,
  Play,
  RefreshCw,
  X,
} from 'lucide-react'
import {
  softphone,
  toDialNumber,
  useSoftphone,
  type ActiveCall,
  type FinishedCall,
  type TranscriptLine,
} from '../lib/softphone'

const AFTER_CALL_MS = 9000

const DTMF_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#']

function fmtDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function phaseLabel(call: ActiveCall): string {
  switch (call.phase) {
    case 'dialing':
      return 'Marcando…'
    case 'ringing':
      return call.direction === 'incoming' ? 'Llamada entrante' : 'Sonando…'
    case 'active':
      return 'En llamada'
    case 'held':
      return 'En espera'
    case 'ending':
      return 'Colgando…'
    default:
      return ''
  }
}

function useTicker(active: boolean) {
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!active) return
    const id = window.setInterval(() => setTick((n) => n + 1), 1000)
    return () => window.clearInterval(id)
  }, [active])
}

/**
 * Intercepta cualquier `<a href="tel:…">` del CRM: si el softphone está listo,
 * marca por Telnyx en vez de abrir la app de teléfono del sistema.
 */
function useTelLinkInterceptor() {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey) return
      const target = e.target as HTMLElement | null
      const link = target?.closest<HTMLAnchorElement>('a[href^="tel:"]')
      if (!link) return
      const { status } = softphone.getState()
      if (status !== 'ready') return
      const number = decodeURIComponent(link.getAttribute('href')!.slice(4))
      const label = link.dataset.callLabel || link.getAttribute('aria-label')?.replace(/^Llamar a\s*/i, '')
      e.preventDefault()
      void softphone.call(number, { label: label || undefined, peticionId: link.dataset.callPeticion || null })
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [])
}

function LiveTranscript({ lines }: { lines: TranscriptLine[] }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (el) el.scrollTop = el.scrollHeight
  }, [lines])
  return (
    <div ref={ref} className="softphone-transcript custom-scrollbar-light" aria-live="polite">
      {lines.length === 0 ? (
        <p className="softphone-transcript-empty">Escuchando… la transcripción aparece en cuanto haya conversación.</p>
      ) : (
        lines.map((line) => (
          <p key={line.id} className={`softphone-line ${line.speaker} ${line.final ? '' : 'is-partial'}`}>
            <strong>{line.speaker === 'asesor' ? 'Asesor' : 'Cliente'}</strong>
            <span>{line.text}</span>
          </p>
        ))
      )}
    </div>
  )
}

/** Resumen breve al colgar: resultado, duración y qué se ha guardado. */
function AfterCallCard({ call, onClose }: { call: FinishedCall; onClose: () => void }) {
  useEffect(() => {
    const id = window.setTimeout(onClose, AFTER_CALL_MS)
    return () => window.clearTimeout(id)
  }, [onClose])

  const saved: string[] = []
  if (call.answered) saved.push('grabación en el historial')
  if (call.transcript.length > 0) saved.push('transcripción guardada')
  if (call.peticionId) saved.push('nota añadida a la ficha')

  return (
    <section className="softphone-dock glass is-after" role="status" aria-live="polite">
      <div className="softphone-main">
        <span className={`softphone-avatar ${call.answered ? 'is-live' : 'is-missed'}`} aria-hidden>
          {call.answered ? <Check size={18} /> : <PhoneMissed size={18} />}
        </span>
        <div className="softphone-copy">
          <strong>{call.label}</strong>
          <span>
            {call.answered ? `Llamada atendida · ${fmtDuration(call.durationSec * 1000)}` : 'Sin respuesta'}
            {saved.length > 0 ? ` · ${saved.join(' · ')}` : ''}
          </span>
        </div>
        <button type="button" className="ghost-button lead-icon-btn" onClick={onClose} aria-label="Cerrar">
          <X size={16} aria-hidden />
        </button>
      </div>
    </section>
  )
}

/** Marcador manual: cualquier número, p. ej. para llamarte a ti mismo y probar el softphone. */
function SoftphoneDialer({ callerId, onClose }: { callerId: string | null; onClose: () => void }) {
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [onClose])

  const number = toDialNumber(value)
  const valid = /^\+\d{9,15}$/.test(number)

  const dial = async () => {
    if (!valid || busy) return
    setBusy(true)
    const ok = await softphone.call(number, { label: number })
    setBusy(false)
    if (ok) onClose()
  }

  return (
    <div className="softphone-dialer glass" ref={rootRef} role="dialog" aria-label="Marcar número">
      <p className="section-eyebrow">Marcar número</p>
      <form
        className="softphone-dialer-row"
        onSubmit={(e) => {
          e.preventDefault()
          void dial()
        }}
      >
        <input
          ref={inputRef}
          className="softphone-dialer-input font-mono"
          type="tel"
          inputMode="tel"
          autoComplete="off"
          placeholder="+34 600 000 000"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-label="Número a marcar"
        />
        <button type="submit" className="client-submit softphone-dialer-call" disabled={!valid || busy}>
          <Phone size={16} aria-hidden />
          Llamar
        </button>
      </form>
      <p className="softphone-dialer-hint">
        {callerId ? (
          <>
            El cliente verá <strong className="font-mono">{callerId}</strong>
          </>
        ) : (
          'Sin número de salida asignado: la llamada puede fallar.'
        )}
      </p>
    </div>
  )
}

/** Estado del teléfono para el sidebar: listo / conectando / sin conexión. Oculto si no está configurado. */
export function SoftphoneStatusChip() {
  const { status, callerId, call } = useSoftphone()
  const [dialer, setDialer] = useState(false)
  useEffect(() => {
    if (call || status !== 'ready') setDialer(false)
  }, [call, status])
  if (status === 'off') return null
  const label =
    call
      ? 'En llamada'
      : status === 'ready'
        ? callerId
          ? `Teléfono listo · ${callerId}`
          : 'Teléfono listo'
        : status === 'connecting'
          ? 'Conectando teléfono…'
          : 'Teléfono sin conexión'
  const interactive = status === 'error' || (status === 'ready' && !call)
  return (
    <div className="softphone-chip-wrap">
      {dialer ? <SoftphoneDialer callerId={callerId} onClose={() => setDialer(false)} /> : null}
      <button
        type="button"
        className={`softphone-chip is-${call ? 'call' : status} ${interactive ? 'is-interactive' : ''}`}
        onClick={() => {
          if (status === 'error') void softphone.connect()
          else if (interactive) setDialer((v) => !v)
        }}
        title={status === 'error' ? 'Reintentar conexión' : status === 'ready' && !call ? 'Marcar un número' : label}
        aria-expanded={status === 'ready' ? dialer : undefined}
        disabled={!interactive}
      >
        <span className="softphone-chip-dot" aria-hidden />
        <span className="softphone-chip-text">{label}</span>
        {status === 'error' ? <RefreshCw size={12} aria-hidden /> : <Phone size={12} aria-hidden />}
      </button>
    </div>
  )
}

/** Conecta el softphone al montar y expone la barra de llamada flotante. */
export default function SoftphoneDock() {
  const { status, error, callerId, call, lastCall, toast } = useSoftphone()
  const [keypad, setKeypad] = useState(false)
  const [showTranscript, setShowTranscript] = useState(true)
  useTelLinkInterceptor()
  useTicker(Boolean(call))

  useEffect(() => {
    void softphone.connect()
  }, [])

  useEffect(() => {
    if (!call) {
      setKeypad(false)
      setShowTranscript(true)
    }
  }, [call])

  const inConversation = call?.phase === 'active' || call?.phase === 'held'

  const now = Date.now()

  return (
    <>
      {toast ? (
        <div className="softphone-toast" role="status">
          {toast}
        </div>
      ) : null}

      {!call && lastCall ? <AfterCallCard call={lastCall} onClose={() => softphone.clearLastCall()} /> : null}

      {status === 'error' && !call && !lastCall ? (
        <div className="softphone-dock glass is-error" role="status">
          <span className="softphone-dot is-error" aria-hidden />
          <div className="softphone-copy">
            <strong>Softphone sin conexión</strong>
            <span>{error}</span>
          </div>
          <button type="button" className="ghost-button" onClick={() => void softphone.connect()}>
            <RefreshCw size={14} aria-hidden />
            Reintentar
          </button>
        </div>
      ) : null}

      {call ? (
        <section
          className={`softphone-dock glass is-call phase-${call.phase} dir-${call.direction}`}
          role="dialog"
          aria-label={phaseLabel(call)}
        >
          <div className="softphone-main">
            <span className={`softphone-avatar ${call.phase === 'active' ? 'is-live' : ''}`} aria-hidden>
              {call.direction === 'incoming' ? <PhoneIncoming size={18} /> : <Phone size={18} />}
            </span>
            <div className="softphone-copy">
              <strong>{call.label}</strong>
              <span className="font-mono">
                {call.number}
                {callerId && call.direction === 'outgoing' ? ` · desde ${callerId}` : ''}
              </span>
            </div>
            <div className="softphone-status">
              <span className={`badge ${call.phase === 'active' ? 'tone-positive' : 'tone-warning'}`}>
                {phaseLabel(call)}
              </span>
              <span className="font-mono softphone-timer">
                {call.recording ? <span className="softphone-rec" title="Grabando">REC</span> : null}
                {call.answeredAt ? fmtDuration(now - call.answeredAt) : fmtDuration(now - call.startedAt)}
              </span>
            </div>
          </div>

          {inConversation && showTranscript ? <LiveTranscript lines={call.transcript} /> : null}

          <div className="softphone-actions">
            {call.direction === 'incoming' && call.phase === 'ringing' ? (
              <button type="button" className="softphone-btn is-answer" onClick={() => void softphone.answer()}>
                <Phone size={16} aria-hidden />
                Contestar
              </button>
            ) : null}

            {call.phase === 'active' || call.phase === 'held' ? (
              <>
                <button
                  type="button"
                  className={`softphone-btn ${call.muted ? 'is-on' : ''}`}
                  onClick={() => softphone.toggleMute()}
                  aria-pressed={call.muted}
                  title={call.muted ? 'Activar micrófono' : 'Silenciar'}
                >
                  {call.muted ? <MicOff size={16} aria-hidden /> : <Mic size={16} aria-hidden />}
                  {call.muted ? 'Silenciado' : 'Silenciar'}
                </button>
                <button
                  type="button"
                  className={`softphone-btn ${call.phase === 'held' ? 'is-on' : ''}`}
                  onClick={() => void softphone.toggleHold()}
                  aria-pressed={call.phase === 'held'}
                  title={call.phase === 'held' ? 'Reanudar' : 'Poner en espera'}
                >
                  {call.phase === 'held' ? <Play size={16} aria-hidden /> : <Pause size={16} aria-hidden />}
                  {call.phase === 'held' ? 'Reanudar' : 'Espera'}
                </button>
                <button
                  type="button"
                  className={`softphone-btn ${showTranscript ? 'is-on' : ''}`}
                  onClick={() => setShowTranscript((v) => !v)}
                  aria-pressed={showTranscript}
                  title="Transcripción en vivo"
                >
                  <FileText size={16} aria-hidden />
                  Texto
                </button>
                <button
                  type="button"
                  className={`softphone-btn ${keypad ? 'is-on' : ''}`}
                  onClick={() => setKeypad((v) => !v)}
                  aria-expanded={keypad}
                  title="Teclado"
                >
                  <Grid3x3 size={16} aria-hidden />
                </button>
              </>
            ) : null}

            <button
              type="button"
              className="softphone-btn is-hangup"
              onClick={() => void softphone.hangup()}
              disabled={call.phase === 'ending'}
            >
              <PhoneOff size={16} aria-hidden />
              {call.direction === 'incoming' && call.phase === 'ringing' ? 'Rechazar' : 'Colgar'}
            </button>
          </div>

          {keypad ? (
            <div className="softphone-keypad" role="group" aria-label="Teclado DTMF">
              {DTMF_KEYS.map((key) => (
                <button key={key} type="button" className="softphone-key" onClick={() => softphone.dtmf(key)}>
                  {key}
                </button>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}
    </>
  )
}
