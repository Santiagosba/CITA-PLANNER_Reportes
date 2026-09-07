import { useState } from 'react'
import { FileText, Mic, Pause, Phone, PhoneIncoming, PhoneMissed, Play, RefreshCw } from 'lucide-react'
import { CrmApiError, fetchRecordingUrl, type CustomerCallItem } from '../lib/crmApi'
import { formatFecha } from '../lib/peticionesPendientes'
import { phoneTail, useSoftphone, type TranscriptLine } from '../lib/softphone'
import type { useCustomerCalls } from '../hooks/useCustomerCalls'

type CallsState = ReturnType<typeof useCustomerCalls>

function fmtSecs(total: number | null | undefined): string {
  if (!total || total <= 0) return '—'
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function hasTranscript(item: CustomerCallItem): boolean {
  return /transcripci[oó]n/i.test(item.resumen || '')
}

type HistoryProps = {
  phone: string
  calls: CallsState
  selectedId: string | null
  onSelect: (item: CustomerCallItem) => void
}

/** Lista de llamadas con este teléfono: grabación (play) y acceso a la transcripción. */
export function LeadCallHistory({ phone, calls, selectedId, onSelect }: HistoryProps) {
  const { call } = useSoftphone()
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [audioError, setAudioError] = useState<string | null>(null)
  const [loadingId, setLoadingId] = useState<string | null>(null)

  const live = call && phoneTail(call.number) === phoneTail(phone) ? call : null

  const play = async (item: CustomerCallItem) => {
    if (playingId === item.id) {
      setPlayingId(null)
      setAudioUrl(null)
      return
    }
    setLoadingId(item.id)
    setAudioError(null)
    try {
      const url = await fetchRecordingUrl(item.id)
      setPlayingId(item.id)
      setAudioUrl(url)
    } catch (e) {
      const status = e instanceof CrmApiError ? e.status : 0
      setAudioError(
        status === 403
          ? 'Tu perfil no puede escuchar grabaciones (solo supervisores en api-crm).'
          : status === 404
            ? 'La grabación aún no está disponible. Vuelve a intentarlo en unos segundos.'
            : e instanceof CrmApiError
              ? e.message
              : 'No se pudo cargar la grabación.',
      )
    } finally {
      setLoadingId(null)
    }
  }

  if (!calls.enabled) {
    return (
      <div className="lead-voice-card lead-calls-card">
        <p className="lead-voice-hint">
          <Mic size={12} />
          Configura VITE_CRM_API_URL para grabar y transcribir las llamadas desde el CRM.
        </p>
      </div>
    )
  }

  return (
    <div className="lead-voice-card lead-calls-card">
      <div className="lead-voice-meta">
        <div className="lead-voice-label">
          <span className={`lead-voice-dot ${live?.recording ? 'is-live' : ''}`} />
          <span>
            {live
              ? live.recording
                ? 'Grabando la llamada en curso'
                : 'Llamada en curso'
              : `Llamadas con este cliente · ${calls.items.length}`}
          </span>
        </div>
        <button
          type="button"
          className="ghost-button lead-icon-btn"
          title="Actualizar historial"
          onClick={() => void calls.refresh()}
          disabled={calls.loading}
        >
          <RefreshCw size={14} className={calls.loading ? 'animate-spin' : ''} aria-hidden />
        </button>
      </div>

      {calls.error ? <p className="lead-voice-hint lead-calls-error">{calls.error}</p> : null}

      {!calls.loading && !calls.error && calls.items.length === 0 ? (
        <p className="lead-voice-hint">
          <Phone size={12} />
          Aún no hay llamadas. Pulsa «Llamar»: la conversación se graba y se transcribe sola.
        </p>
      ) : null}

      {calls.items.length > 0 ? (
        <ul className="lead-calls-list">
          {calls.items.map((item) => {
            const missed = item.nocontesta || !item.completada
            const selected = selectedId === item.id
            return (
              <li key={item.id} className={`lead-calls-row ${selected ? 'is-selected' : ''}`}>
                <span className={`lead-calls-icon ${missed ? 'is-missed' : ''}`} aria-hidden>
                  {missed ? <PhoneMissed size={14} /> : item.entrante ? <PhoneIncoming size={14} /> : <Phone size={14} />}
                </span>
                <button type="button" className="lead-calls-main" onClick={() => onSelect(item)}>
                  <span className="lead-calls-top">
                    <strong>{formatFecha(item.fecha)}</strong>
                    <span className="font-mono">{fmtSecs(item.duracionSeg)}</span>
                  </span>
                  <span className="lead-calls-sub">
                    {item.agente || 'Asesor'}
                    {missed ? ' · Sin respuesta' : ''}
                    {hasTranscript(item) ? ' · Transcripción' : ''}
                  </span>
                </button>
                <span className="lead-calls-actions">
                  {hasTranscript(item) ? (
                    <button
                      type="button"
                      className="ghost-button lead-icon-btn"
                      title="Ver transcripción"
                      onClick={() => onSelect(item)}
                    >
                      <FileText size={14} aria-hidden />
                    </button>
                  ) : null}
                  {item.hasRecording ? (
                    <button
                      type="button"
                      className={`lead-play-btn ${playingId === item.id ? 'is-playing' : ''}`}
                      onClick={() => void play(item)}
                      disabled={loadingId === item.id}
                      aria-label={playingId === item.id ? 'Detener grabación' : 'Escuchar grabación'}
                    >
                      {playingId === item.id ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
                    </button>
                  ) : null}
                </span>
              </li>
            )
          })}
        </ul>
      ) : null}

      {audioError ? <p className="lead-voice-hint lead-calls-error">{audioError}</p> : null}
      {audioUrl ? (
        <audio
          className="lead-calls-audio"
          src={audioUrl}
          controls
          autoPlay
          onEnded={() => {
            setPlayingId(null)
            setAudioUrl(null)
          }}
        />
      ) : null}
    </div>
  )
}

type TranscriptProps = {
  phone: string
  selected: CustomerCallItem | null
}

function LiveLines({ lines }: { lines: TranscriptLine[] }) {
  if (lines.length === 0) {
    return <p className="lead-voice-hint">Escuchando… la transcripción aparecerá en cuanto haya conversación.</p>
  }
  return (
    <div className="lead-transcript">
      {lines.map((line) => (
        <p key={line.id} className={line.final ? '' : 'is-partial'}>
          <strong>{line.speaker === 'asesor' ? 'Asesor:' : 'Cliente:'}</strong> {line.text}
        </p>
      ))}
    </div>
  )
}

function StoredLines({ text }: { text: string }) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !/^transcripci[oó]n de la llamada$/i.test(line))
  return (
    <div className="lead-transcript">
      {lines.map((line, index) => {
        const match = /^(Asesor|Cliente):\s*(.*)$/.exec(line)
        return match ? (
          <p key={index}>
            <strong>{match[1]}:</strong> {match[2]}
          </p>
        ) : (
          <p key={index}>{line}</p>
        )
      })}
    </div>
  )
}

/** Pestaña «Transcripción»: en vivo si hay llamada con este número, si no la guardada. */
export function LeadCallTranscript({ phone, selected }: TranscriptProps) {
  const { call, lastCall } = useSoftphone()
  const tail = phoneTail(phone)
  const live = call && phoneTail(call.number) === tail ? call : null
  const recent = lastCall && phoneTail(lastCall.number) === tail && lastCall.transcript.length > 0 ? lastCall : null

  if (live) {
    return (
      <section className="lead-info-card">
        <p className="lead-info-eyebrow">
          <span className="lead-voice-dot is-live" /> En vivo · {live.recording ? 'grabando' : 'conectando'}
        </p>
        <LiveLines lines={live.transcript} />
      </section>
    )
  }

  if (selected) {
    return (
      <section className="lead-info-card">
        <p className="lead-info-eyebrow">
          Llamada del {formatFecha(selected.fecha)} · {selected.agente || 'Asesor'} · {fmtSecs(selected.duracionSeg)}
        </p>
        {hasTranscript(selected) ? (
          <StoredLines text={selected.resumen} />
        ) : (
          <p className="lead-voice-hint">Esta llamada no tiene transcripción guardada.</p>
        )}
      </section>
    )
  }

  if (recent) {
    return (
      <section className="lead-info-card">
        <p className="lead-info-eyebrow">
          Última llamada · {fmtSecs(recent.durationSec)} · guardada en el historial
        </p>
        <LiveLines lines={recent.transcript} />
      </section>
    )
  }

  return (
    <section className="lead-info-card">
      <p className="lead-info-eyebrow">Turno a turno</p>
      <p className="lead-voice-hint">
        Sin transcripción todavía. Llama al cliente desde esta ficha: la conversación se graba y se transcribe en
        vivo, y queda guardada aquí al colgar.
      </p>
    </section>
  )
}
