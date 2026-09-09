import { useEffect, useRef, useState } from 'react'
import { useAudioLevels } from '../lib/audioLevels'
import SoundWave from './SoundWave'
import {
  ArrowLeft,
  Coins,
  Download,
  FileText,
  Mic,
  Phone,
  PhoneIncoming,
  PhoneMissed,
  PhoneOutgoing,
  RefreshCw,
  Timer,
  User,
} from 'lucide-react'
import {
  CrmApiError,
  fetchCallDetail,
  fetchCustomerCalls,
  fetchRecordingUrl,
  isCrmApiConfigured,
  type CallDetail,
} from '../lib/crmApi'
import {
  estadoLabel,
  fmtDateTime,
  fmtMoney,
  fmtSeconds,
  hangupLabel,
  hasStoredTranscript,
  parseStoredTranscript,
  productLabel,
} from '../lib/callFormat'
import type { FinishedCall, TranscriptLine } from '../lib/softphone'

/** Mientras Telnyx no publica el coste, volvemos a preguntar cada 20 s (máx. 15 min tras colgar). */
const COST_POLL_MS = 20_000
const COST_POLL_WINDOW_MS = 15 * 60_000

type Props = {
  call: FinishedCall
  onBack: () => void
  onCall: (number: string, label?: string) => void
}

export function TranscriptLines({ lines, emptyText }: { lines: TranscriptLine[]; emptyText: string }) {
  if (lines.length === 0) return <p className="phone-pad-hint phone-detail-empty">{emptyText}</p>
  return (
    <div className="phone-transcript custom-scrollbar-light">
      {lines.map((line) => (
        <p key={line.id} className={`softphone-line ${line.speaker}${line.final ? '' : ' is-partial'}`}>
          <strong>{line.speaker === 'asesor' ? 'Asesor' : 'Cliente'}</strong>
          <span>{line.text}</span>
        </p>
      ))}
    </div>
  )
}

function RecordingPlayer({ src }: { src: string }) {
  const [el, setEl] = useState<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const levels = useAudioLevels(el, playing)
  return (
    <div className="phone-detail-player">
      <SoundWave levels={levels} label="Intensidad de la grabación" />
      <audio
        ref={setEl}
        className="phone-detail-audio"
        src={src}
        crossOrigin="anonymous"
        controls
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />
    </div>
  )
}

function Stat({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: React.ReactNode; tone?: string }) {
  return (
    <div className={`phone-stat${tone ? ` tone-${tone}` : ''}`}>
      <span className="phone-stat-icon" aria-hidden>
        {icon}
      </span>
      <span className="phone-stat-label">{label}</span>
      <strong className="phone-stat-value">{value}</strong>
    </div>
  )
}

/**
 * Ficha de una llamada del historial: resultado, tiempos, coste Telnyx,
 * grabación y transcripción. Los datos «de verdad» vienen de api-crm; si la
 * llamada no llegó a registrarse allí, se muestra lo que hay en local.
 */
export default function PhoneCallDetail({ call, onBack, onCall }: Props) {
  const [detail, setDetail] = useState<CallDetail | null>(null)
  const [loading, setLoading] = useState(Boolean(call.logId))
  const [error, setError] = useState<string | null>(null)
  const [showBreakdown, setShowBreakdown] = useState(false)
  const pollRef = useRef(0)
  const enabled = Boolean(call.logId) && isCrmApiConfigured()

  useEffect(() => {
    let cancelled = false
    window.clearTimeout(pollRef.current)
    setDetail(null)
    setError(null)
    setShowBreakdown(false)
    if (!enabled || !call.logId) {
      setLoading(false)
      return
    }
    const logId = call.logId

    const load = async (silent: boolean) => {
      if (!silent) setLoading(true)
      try {
        const next = await fetchCallDetail(logId)
        if (cancelled) return
        setDetail(next)
        setError(null)
        const withinWindow = Date.now() - call.endedAt < COST_POLL_WINDOW_MS
        if ((next.cost_pending || (!next.recording.available && withinWindow)) && withinWindow) {
          pollRef.current = window.setTimeout(() => void load(true), COST_POLL_MS)
        }
      } catch (e) {
        if (cancelled) return
        // api-crm desplegado no tiene GET /api/calls/log/:id, pero sí
        // GET /api/calls/:id/recording y el historial por teléfono.
        if (e instanceof CrmApiError && (e.endpointMissing || e.status === 404)) {
          try {
            const [url, history] = await Promise.all([
              fetchRecordingUrl(logId).catch(() => ''),
              fetchCustomerCalls(call.number).catch(() => []),
            ])
            if (cancelled) return
            const item = history.find((h) => h.id === logId || h.softphoneLogId === logId)
            const notes = item?.resumen || null
            setDetail({
              id: logId,
              telefono_destino: call.direction === 'outgoing' ? call.number : null,
              telefono_origen: call.direction === 'incoming' ? call.number : null,
              direccion: call.direction,
              estado: call.answered ? 'completed' : 'missed',
              fecha_inicio: new Date(call.endedAt - call.durationSec * 1000).toISOString(),
              fecha_respuesta: call.answered ? new Date(call.endedAt - call.durationSec * 1000).toISOString() : null,
              fecha_fin: new Date(call.endedAt).toISOString(),
              duracion_seg: item?.duracionSeg ?? call.durationSec,
              hangup_cause: call.hangupCause ?? null,
              notas: notes,
              notas_titular: item?.titular ?? null,
              tags: [],
              agente: item?.agente ?? null,
              cliente: item?.cliente ?? null,
              call_control_id: null,
              call_session_id: null,
              recording: {
                available: Boolean(url) || Boolean(item?.hasRecording),
                url: url || null,
                duration_sec: item?.duracionSeg ?? call.durationSec,
              },
              cost: null,
              cost_pending: false,
            })
            setError(url || notes ? null : 'La grabación se está enlazando. Abre esta ficha de nuevo en unos segundos.')
            const withinWindow = Date.now() - call.endedAt < COST_POLL_WINDOW_MS
            if (!url && call.answered && withinWindow) {
              pollRef.current = window.setTimeout(() => void load(true), COST_POLL_MS)
            }
            return
          } catch {
            /* cae al mensaje de abajo */
          }
        }
        setError(
          e instanceof CrmApiError
            ? e.endpointMissing
              ? 'La llamada está guardada en api-crm, pero no se pudo leer la grabación. Vuelve a entrar y ábrela de nuevo.'
              : e.status === 404
                ? 'Esta llamada no está en api-crm (se marcó sin registro).'
                : e.message
            : 'No se pudo cargar el detalle.',
        )
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load(false)
    return () => {
      cancelled = true
      window.clearTimeout(pollRef.current)
    }
  }, [call.logId, call.endedAt, enabled])

  const missed = detail ? !detail.fecha_respuesta && !['completed', 'answered'].includes(String(detail.estado)) : !call.answered
  const Icon = missed ? PhoneMissed : call.direction === 'incoming' ? PhoneIncoming : PhoneOutgoing
  const duration = detail?.duracion_seg ?? call.durationSec
  const cost = detail?.cost ?? null
  const transcript: TranscriptLine[] = detail && hasStoredTranscript(detail.notas)
    ? parseStoredTranscript(detail.notas)
    : call.transcript
  const summary = detail && detail.notas && !hasStoredTranscript(detail.notas) ? detail.notas : null

  return (
    <section className="phone-detail" aria-label="Detalle de la llamada">
      <header className="phone-detail-head">
        <button type="button" className="phone-detail-back" onClick={onBack} aria-label="Volver al historial">
          <ArrowLeft size={16} />
        </button>
        <span className={`phone-history-icon${missed ? ' is-missed' : ''}`} aria-hidden>
          <Icon size={14} />
        </span>
        <div className="phone-detail-title">
          <strong>{call.label && call.label !== call.number ? call.label : call.number}</strong>
          <span className="font-mono">
            {call.label && call.label !== call.number ? `${call.number} · ` : ''}
            {fmtDateTime(detail?.fecha_inicio ?? call.endedAt - call.durationSec * 1000)}
          </span>
        </div>
        <button
          type="button"
          className="phone-history-call"
          onClick={() => onCall(call.number, call.label)}
          aria-label={`Volver a llamar a ${call.number}`}
          title="Volver a llamar"
        >
          <Phone size={14} />
        </button>
      </header>

      <div className="phone-detail-stats">
        <Stat
          icon={<Timer size={14} />}
          label="Duración"
          value={fmtSeconds(duration)}
          tone={missed ? 'missed' : 'ok'}
        />
        <Stat
          icon={<Coins size={14} />}
          label="Coste"
          value={
            cost ? (
              fmtMoney(cost.amount, cost.currency)
            ) : detail?.cost_pending ? (
              <span className="phone-stat-pending">
                <RefreshCw size={11} className="animate-spin" aria-hidden /> Telnyx…
              </span>
            ) : (
              '—'
            )
          }
        />
        <Stat
          icon={missed ? <PhoneMissed size={14} /> : <Phone size={14} />}
          label="Resultado"
          value={estadoLabel(detail?.estado, Boolean(detail?.fecha_respuesta) || call.answered)}
          tone={missed ? 'missed' : 'ok'}
        />
        <Stat icon={<User size={14} />} label="Asesor" value={detail?.agente || 'Tú'} />
      </div>

      {error ? <p className="phone-pad-hint lead-calls-error">{error}</p> : null}
      {loading && !detail ? (
        <p className="phone-pad-hint">
          <RefreshCw size={12} className="animate-spin" aria-hidden /> Cargando detalle…
        </p>
      ) : null}

      <div className="phone-detail-cards">
        <article className="phone-detail-card lg-surface">
          <h4>
            <Mic size={13} aria-hidden /> Grabación
          </h4>
          {detail?.recording.url ? (
            <>
              <RecordingPlayer src={detail.recording.url} />
              <div className="phone-detail-card-foot">
                <span>{fmtSeconds(detail.recording.duration_sec ?? duration)}</span>
                <a className="ghost-button phone-detail-link" href={detail.recording.url} download target="_blank" rel="noreferrer">
                  <Download size={12} aria-hidden /> Descargar
                </a>
              </div>
            </>
          ) : missed ? (
            <p className="phone-pad-hint phone-detail-empty">La llamada no se contestó, así que no hay grabación.</p>
          ) : detail && !detail.recording.available ? (
            <p className="phone-pad-hint phone-detail-empty">
              La grabación se guarda unos segundos después de colgar. Se actualizará aquí sola.
            </p>
          ) : !enabled ? (
            <p className="phone-pad-hint phone-detail-empty">Llamada sin registro en api-crm.</p>
          ) : null}
        </article>

        <article className="phone-detail-card lg-surface">
          <h4>
            <Coins size={13} aria-hidden /> Coste Telnyx
          </h4>
          {cost ? (
            <>
              <p className="phone-detail-cost">{fmtMoney(cost.amount, cost.currency, { precise: true })}</p>
              <dl className="phone-detail-dl">
                <dt>Tarifa</dt>
                <dd>{cost.rate_per_min != null ? `${fmtMoney(cost.rate_per_min, cost.currency, { precise: true })}/min` : '—'}</dd>
                <dt>Facturado</dt>
                <dd>{cost.billed_sec != null ? `${fmtSeconds(cost.billed_sec)} (${cost.billed_sec} s)` : '—'}</dd>
                <dt>Actualizado</dt>
                <dd>{fmtDateTime(cost.updated_at)}</dd>
              </dl>
              {cost.breakdown.length > 0 ? (
                <>
                  <button type="button" className="ghost-button phone-detail-link" onClick={() => setShowBreakdown((v) => !v)}>
                    {showBreakdown ? 'Ocultar desglose' : `Desglose (${cost.breakdown.length})`}
                  </button>
                  {showBreakdown ? (
                    <ul className="phone-detail-breakdown">
                      {cost.breakdown.map((item, i) => (
                        <li key={`${item.product}-${i}`}>
                          <span>{productLabel(item.product)}</span>
                          <span className="font-mono">
                            {item.billed_sec != null ? `${item.billed_sec} s · ` : ''}
                            {fmtMoney(item.cost, item.currency || cost.currency, { precise: true })}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </>
              ) : null}
            </>
          ) : detail?.cost_pending ? (
            <p className="phone-pad-hint phone-detail-empty">
              Telnyx publica el coste real entre 1 y 10 minutos después de colgar. Se actualizará solo.
            </p>
          ) : missed ? (
            <p className="phone-pad-hint phone-detail-empty">Sin coste: la llamada no llegó a establecerse.</p>
          ) : (
            <p className="phone-pad-hint phone-detail-empty">Sin datos de coste para esta llamada.</p>
          )}
        </article>
      </div>

      <article className="phone-detail-card lg-surface phone-detail-transcript">
        <h4>
          <FileText size={13} aria-hidden /> Transcripción
        </h4>
        {summary ? <p className="phone-detail-summary">{summary}</p> : null}
        <TranscriptLines
          lines={transcript}
          emptyText={
            missed
              ? 'No hubo conversación que transcribir.'
              : 'Esta llamada no tiene transcripción guardada.'
          }
        />
      </article>

      <dl className="phone-detail-dl phone-detail-meta">
        <dt>Inicio</dt>
        <dd>{fmtDateTime(detail?.fecha_inicio ?? null)}</dd>
        <dt>Contestada</dt>
        <dd>{fmtDateTime(detail?.fecha_respuesta ?? null)}</dd>
        <dt>Fin</dt>
        <dd>{fmtDateTime(detail?.fecha_fin ?? call.endedAt)}</dd>
        <dt>Motivo de fin</dt>
        <dd>{hangupLabel(detail?.hangup_cause ?? call.hangupCause)}</dd>
        {detail?.telefono_origen ? (
          <>
            <dt>Número mostrado</dt>
            <dd className="font-mono">{detail.direccion === 'incoming' ? detail.telefono_destino : detail.telefono_origen}</dd>
          </>
        ) : null}
        {detail?.cliente ? (
          <>
            <dt>Cliente CRM</dt>
            <dd>{detail.cliente}</dd>
          </>
        ) : null}
        {detail?.call_session_id ? (
          <>
            <dt>Sesión Telnyx</dt>
            <dd className="font-mono phone-detail-id">{detail.call_session_id}</dd>
          </>
        ) : null}
      </dl>
    </section>
  )
}
