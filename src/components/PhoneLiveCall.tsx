import { useEffect, useRef, useState } from 'react'
import { Coins, FileText, Grid3x3, Mic, MicOff, Pause, Phone, PhoneIncoming, PhoneOff, Play, Timer } from 'lucide-react'
import { estimatedCallCost, softphone, transcriptionLabel, type ActiveCall } from '../lib/softphone'
import { useSoftphoneLevels } from '../lib/audioLevels'
import { fmtMoney, fmtSeconds } from '../lib/callFormat'
import { TranscriptLines } from './PhoneCallDetail'
import SoundWave from './SoundWave'

const DTMF_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#']

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

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    setNow(Date.now())
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [active])
  return now
}

type Props = {
  call: ActiveCall
  callerId: string | null
}

function transcriptionTone(call: ActiveCall): string {
  switch (call.transcription) {
    case 'live':
      return 'tone-positive'
    case 'denied':
    case 'unavailable':
    case 'unsupported':
      return 'tone-warning'
    default:
      return 'tone-info'
  }
}

function transcriptEmptyText(call: ActiveCall): string {
  switch (call.transcription) {
    case 'denied':
      return 'api-crm no reconoce esta llamada como tuya: no se puede transcribir. Pide que vinculen tu usuario al CRM.'
    case 'unavailable':
      return 'La transcripción no ha arrancado. La grabación sigue disponible al colgar.'
    case 'unsupported':
      return 'El api-crm desplegado es antiguo y no expone el detalle de la llamada; hay que actualizarlo para transcribir en vivo.'
    case 'live':
    case 'linking':
      return 'Escuchando… la transcripción aparece en cuanto haya conversación.'
    default:
      return 'La transcripción empieza cuando el cliente conteste.'
  }
}

/** Transcripción en vivo con autoscroll al final. */
export function LiveTranscript({ call }: { call: ActiveCall }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current?.querySelector('.phone-transcript')
    if (el) el.scrollTop = el.scrollHeight
  }, [call.transcript])
  return (
    <div ref={ref} className="phone-live-transcript" aria-live="polite">
      <p className="phone-suggest-title">
        <FileText size={13} aria-hidden />
        Transcripción en vivo
        {call.recording ? <span className="phone-live-rec">REC</span> : null}
        <span className={`badge ${transcriptionTone(call)} phone-live-tx-badge`}>{transcriptionLabel(call)}</span>
      </p>
      <TranscriptLines lines={call.transcript} emptyText={transcriptEmptyText(call)} />
    </div>
  )
}

/**
 * Panel de llamada en curso dentro de la app Teléfono: estado, cronómetro,
 * grabación, coste estimado en tiempo real y controles. La transcripción en
 * vivo la coloca `SoftphonePad` (columna aparte o debajo, según el ancho).
 */
export default function PhoneLiveCall({ call, callerId }: Props) {
  const now = useNow(true)
  const [keypad, setKeypad] = useState(false)
  const inConversation = call.phase === 'active' || call.phase === 'held'
  const levels = useSoftphoneLevels(inConversation)
  const elapsed = call.answeredAt ? (now - call.answeredAt) / 1000 : (now - call.startedAt) / 1000
  const cost = estimatedCallCost(call, now)
  const Icon = call.direction === 'incoming' ? PhoneIncoming : Phone

  return (
    <section className={`phone-live phase-${call.phase}`} aria-label={phaseLabel(call)}>
      <header className="phone-live-head">
        <span className={`phone-live-avatar${call.phase === 'active' ? ' is-live' : ''}`} aria-hidden>
          <Icon size={18} />
        </span>
        <div className="phone-live-title">
          <strong>{call.label}</strong>
          <span className="font-mono">
            {call.number}
            {callerId && call.direction === 'outgoing' ? ` · desde ${callerId}` : ''}
          </span>
        </div>
        <span className={`badge ${call.phase === 'active' ? 'tone-positive' : call.phase === 'held' ? 'tone-info' : 'tone-warning'}`}>
          {phaseLabel(call)}
        </span>
      </header>

      <SoundWave levels={levels} label="Intensidad del audio en vivo" />

      <div className="phone-live-stats">
        <div className="phone-stat tone-ok">
          <span className="phone-stat-icon" aria-hidden>
            <Timer size={14} />
          </span>
          <span className="phone-stat-label">{call.answeredAt ? 'Hablando' : 'Esperando'}</span>
          <strong className="phone-stat-value font-mono">{fmtSeconds(elapsed)}</strong>
        </div>
        <div className="phone-stat">
          <span className="phone-stat-icon" aria-hidden>
            <Coins size={14} />
          </span>
          <span className="phone-stat-label">Coste estimado</span>
          <strong className="phone-stat-value font-mono">
            {cost ? fmtMoney(cost.amount, cost.currency) : call.rate ? fmtMoney(0, call.rate.currency) : '—'}
          </strong>
          {call.rate ? (
            <span className="phone-stat-sub">
              {fmtMoney(call.rate.ratePerMin, call.rate.currency, { precise: true })}/min
              {call.rate.source === 'default' ? ' · orientativo' : ''}
            </span>
          ) : (
            <span className="phone-stat-sub">Real al colgar</span>
          )}
        </div>
        <div className={`phone-stat${call.recording ? ' tone-rec' : ''}`}>
          <span className="phone-stat-icon" aria-hidden>
            <Mic size={14} />
          </span>
          <span className="phone-stat-label">Grabación</span>
          <strong className="phone-stat-value">{call.recording ? 'REC' : inConversation ? 'Iniciando…' : 'Al contestar'}</strong>
        </div>
      </div>

      <div className="phone-live-controls">
        {call.direction === 'incoming' && call.phase === 'ringing' ? (
          <button type="button" className="lg-call phone-live-answer" onClick={() => void softphone.answer()} aria-label="Contestar">
            <Phone size={22} aria-hidden />
          </button>
        ) : null}
        {inConversation ? (
          <>
            <button
              type="button"
              className={`lg-key phone-live-key${call.muted ? ' is-on' : ''}`}
              onClick={() => softphone.toggleMute()}
              aria-pressed={call.muted}
              title={call.muted ? 'Activar micrófono' : 'Silenciar'}
            >
              {call.muted ? <MicOff size={18} aria-hidden /> : <Mic size={18} aria-hidden />}
              <span className="lg-key-sub">{call.muted ? 'Silenciado' : 'Silenciar'}</span>
              <span className="lg-key-shine" aria-hidden />
            </button>
            <button
              type="button"
              className={`lg-key phone-live-key${call.phase === 'held' ? ' is-on' : ''}`}
              onClick={() => void softphone.toggleHold()}
              aria-pressed={call.phase === 'held'}
              title={call.phase === 'held' ? 'Reanudar' : 'Poner en espera'}
            >
              {call.phase === 'held' ? <Play size={18} aria-hidden /> : <Pause size={18} aria-hidden />}
              <span className="lg-key-sub">{call.phase === 'held' ? 'Reanudar' : 'Espera'}</span>
              <span className="lg-key-shine" aria-hidden />
            </button>
            <button
              type="button"
              className={`lg-key phone-live-key${keypad ? ' is-on' : ''}`}
              onClick={() => setKeypad((v) => !v)}
              aria-expanded={keypad}
              title="Teclado (tonos)"
            >
              <Grid3x3 size={18} aria-hidden />
              <span className="lg-key-sub">Teclado</span>
              <span className="lg-key-shine" aria-hidden />
            </button>
          </>
        ) : null}
        <button
          type="button"
          className="lg-call is-hangup"
          onClick={() => void softphone.hangup()}
          disabled={call.phase === 'ending'}
          aria-label={call.direction === 'incoming' && call.phase === 'ringing' ? 'Rechazar' : 'Colgar'}
        >
          <PhoneOff size={22} aria-hidden />
        </button>
      </div>

      {keypad && inConversation ? (
        <div className="phone-keypad phone-live-dtmf" role="group" aria-label="Teclado DTMF">
          {DTMF_KEYS.map((d) => (
            <button key={d} type="button" className="lg-key is-compact" onClick={() => softphone.dtmf(d)} aria-label={`Tono ${d}`}>
              <span className="lg-key-digit">{d}</span>
              <span className="lg-key-shine" aria-hidden />
            </button>
          ))}
        </div>
      ) : null}
    </section>
  )
}
