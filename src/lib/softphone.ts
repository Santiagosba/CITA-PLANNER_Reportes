/**
 * Softphone Telnyx (WebRTC en el navegador) para el CRM.
 *
 * Flujo:
 *  1. api-crm → `GET /api/webrtc/credentials` (SIP del operador) y
 *     `GET /api/call/outbound-cli` (número que ve el cliente).
 *  2. `@telnyx/webrtc` conecta con ese SIP; el audio va navegador ↔ Telnyx.
 *  3. Cada llamada se registra en api-crm (`/api/calls/log`) al empezar y al
 *     terminar, para que aparezca en el historial del CRM.
 *  4. Grabación: la arranca api-crm en el webhook `call.answered` (mp3, dos
 *     canales) y la deja enlazada a la fila de `llamadas_softphone`.
 *  5. Transcripción: api-crm hace streaming a Deepgram y emite
 *     `call_transcription` por Socket.io; aquí se muestra en vivo y al colgar
 *     se guarda en `notas` de la llamada.
 *
 * Estado fuera de React (singleton) para que la llamada sobreviva a cambios de
 * vista; los componentes se suscriben con `useSoftphone()`.
 */

import { useSyncExternalStore } from 'react'
import type { TelnyxRTC as TelnyxClient, Call, INotification } from '@telnyx/webrtc'
import {
  CrmApiError,
  fetchOutboundCli,
  fetchWebrtcCredentials,
  isCrmApiConfigured,
  logCallStart,
  patchCallLog,
} from './crmApi'
import { onCrmTranscription, registerCrmSocketUser, type TranscriptionEvent } from './crmSocket'

export type SoftphoneStatus = 'off' | 'connecting' | 'ready' | 'error'
export type CallDirection = 'outgoing' | 'incoming'
export type CallPhase = 'dialing' | 'ringing' | 'active' | 'held' | 'ending'
export type TranscriptSpeaker = 'asesor' | 'cliente'

export type TranscriptLine = {
  id: string
  speaker: TranscriptSpeaker
  text: string
  final: boolean
  at: string
}

export type ActiveCall = {
  id: string
  direction: CallDirection
  phase: CallPhase
  number: string
  label: string
  /** Petición del CRM desde la que se marcó (para anotar la llamada en su ficha). */
  peticionId: string | null
  startedAt: number
  answeredAt: number | null
  muted: boolean
  logId: string | null
  callControlId: string | null
  sessionId: string | null
  /** api-crm graba automáticamente en cuanto la llamada se contesta. */
  recording: boolean
  transcript: TranscriptLine[]
}

export type FinishedCall = {
  logId: string | null
  number: string
  label: string
  peticionId: string | null
  direction: CallDirection
  answered: boolean
  durationSec: number
  endedAt: number
  transcript: TranscriptLine[]
}

export type SoftphoneState = {
  status: SoftphoneStatus
  error: string | null
  callerId: string | null
  call: ActiveCall | null
  /** Última llamada terminada (para refrescar historiales y mostrar su transcripción). */
  lastCall: FinishedCall | null
  /** Último aviso (p. ej. «Sin micrófono»), se limpia solo. */
  toast: string | null
  /** Historial local de llamadas hechas/recibidas en este navegador (más reciente primero). */
  history: FinishedCall[]
}

const REMOTE_AUDIO_ID = 'avi-softphone-remote-audio'
const HISTORY_KEY = 'avi-softphone-history'
const HISTORY_MAX = 200

function loadHistory(): FinishedCall[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as FinishedCall[]
    return Array.isArray(parsed) ? parsed.filter((c) => c && typeof c.number === 'string') : []
  } catch {
    return []
  }
}

function saveHistory(history: FinishedCall[]) {
  try {
    // La transcripción ya viaja a api-crm; en local guardamos solo la constancia.
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.map((c) => ({ ...c, transcript: [] }))))
  } catch {
    /* sin espacio o modo privado: seguimos sin persistir */
  }
}

let client: TelnyxClient | null = null
let rtcCall: Call | null = null
let state: SoftphoneState = {
  status: 'off',
  error: null,
  callerId: null,
  call: null,
  lastCall: null,
  toast: null,
  history: typeof window !== 'undefined' ? loadHistory() : [],
}
let connectPromise: Promise<void> | null = null
let toastTimer = 0
let unsubscribeTranscription: (() => void) | null = null
let lineSeq = 0
const listeners = new Set<() => void>()

function emit() {
  for (const fn of listeners) fn()
}

function setState(patch: Partial<SoftphoneState>) {
  state = { ...state, ...patch }
  emit()
}

function patchCall(patch: Partial<ActiveCall>) {
  if (!state.call) return
  setState({ call: { ...state.call, ...patch } })
}

function showToast(message: string, ms = 4200) {
  window.clearTimeout(toastTimer)
  setState({ toast: message })
  toastTimer = window.setTimeout(() => setState({ toast: null }), ms)
}

/**
 * Comprueba que hay micrófono utilizable antes de marcar/contestar y traduce
 * el motivo si no lo hay. Devuelve null si todo va bien.
 */
async function microphoneProblem(): Promise<string | null> {
  if (!navigator.mediaDevices?.getUserMedia) {
    return 'Este navegador no permite usar el micrófono (¿página sin HTTPS?).'
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
    stream.getTracks().forEach((t) => t.stop())
    return null
  } catch (e) {
    const name = e instanceof Error ? e.name : ''
    switch (name) {
      case 'NotFoundError':
      case 'DevicesNotFoundError':
      case 'OverconstrainedError':
        return 'No se detecta ningún micrófono. Conecta unos auriculares o un micro y vuelve a intentarlo.'
      case 'NotAllowedError':
      case 'PermissionDeniedError':
      case 'SecurityError':
        return 'El micrófono está bloqueado. Permítelo en el candado de la barra de direcciones (y en la privacidad de Windows).'
      case 'NotReadableError':
      case 'TrackStartError':
        return 'Otra aplicación está usando el micrófono. Ciérrala y vuelve a intentarlo.'
      default:
        return 'No se pudo acceder al micrófono.'
    }
  }
}

/** Normaliza un teléfono español/E.164 para Telnyx. */
export function toDialNumber(raw: string): string {
  let digits = raw.replace(/[^\d+]/g, '')
  if (digits.startsWith('00')) digits = `+${digits.slice(2)}`
  if (digits.startsWith('+')) return digits
  if (/^[6789]\d{8}$/.test(digits)) return `+34${digits}`
  return digits
}

/** Últimos 9 dígitos, para comparar teléfonos con/sin prefijo. */
export function phoneTail(raw: string | null | undefined): string {
  const digits = String(raw || '').replace(/\D/g, '')
  return digits.length >= 9 ? digits.slice(-9) : digits
}

/** Transcripción en texto plano, lista para guardar en notas. */
export function transcriptToText(lines: TranscriptLine[]): string {
  return lines
    .filter((line) => line.final && line.text.trim())
    .map((line) => `${line.speaker === 'asesor' ? 'Asesor' : 'Cliente'}: ${line.text.trim()}`)
    .join('\n')
}

function ensureRemoteAudio(): HTMLAudioElement {
  let el = document.getElementById(REMOTE_AUDIO_ID) as HTMLAudioElement | null
  if (!el) {
    el = document.createElement('audio')
    el.id = REMOTE_AUDIO_ID
    el.autoplay = true
    el.setAttribute('playsinline', '')
    el.style.display = 'none'
    document.body.appendChild(el)
  }
  return el
}

function syncTelnyxIds(call: Call) {
  const ids = call.telnyxIDs
  const current = state.call
  if (!current) return
  const callControlId = ids?.telnyxCallControlId || current.callControlId
  const sessionId = ids?.telnyxSessionId || current.sessionId
  if (callControlId !== current.callControlId || sessionId !== current.sessionId) {
    patchCall({ callControlId, sessionId })
  }
}

function finishCall(cause?: string) {
  const current = state.call
  rtcCall = null
  if (!current) return

  const endedAt = Date.now()
  const answered = current.answeredAt
  const duration = answered ? Math.max(0, Math.round((endedAt - answered) / 1000)) : 0
  const transcriptText = transcriptToText(current.transcript)

  if (current.logId) {
    const estado = answered
      ? 'completed'
      : current.direction === 'incoming'
        ? 'missed'
        : cause && /reject|busy|decline/i.test(cause)
          ? 'rejected'
          : 'failed'
    void patchCallLog(current.logId, {
      estado,
      ...(answered ? { fecha_respuesta: new Date(answered).toISOString() } : {}),
      fecha_fin: new Date(endedAt).toISOString(),
      duracion_seg: duration,
      ...(cause ? { hangup_cause: cause } : {}),
      ...(transcriptText ? { notas: `Transcripción de la llamada\n${transcriptText}` } : {}),
    }).catch(() => undefined)
  }

  const finished: FinishedCall = {
    logId: current.logId,
    number: current.number,
    label: current.label,
    peticionId: current.peticionId,
    direction: current.direction,
    answered: Boolean(answered),
    durationSec: duration,
    endedAt,
    transcript: current.transcript.filter((line) => line.final),
  }
  const history = [finished, ...state.history].slice(0, HISTORY_MAX)
  saveHistory(history)
  setState({ call: null, lastCall: finished, history })
}

function stateName(call: Call): string {
  return String(call.state || '').toLowerCase()
}

function onCallUpdate(call: Call) {
  const name = stateName(call)
  const inbound = String(call.direction || '').toLowerCase() === 'inbound'

  // Llamada entrante nueva
  if (!state.call && inbound && (name === 'ringing' || name === 'new')) {
    rtcCall = call
    const number = call.options?.remoteCallerNumber || call.options?.callerNumber || ''
    const label = call.options?.remoteCallerName || number || 'Llamada entrante'
    const ids = call.telnyxIDs
    setState({
      call: {
        id: call.id,
        direction: 'incoming',
        phase: 'ringing',
        number,
        label,
        peticionId: null,
        startedAt: Date.now(),
        answeredAt: null,
        muted: false,
        logId: null,
        callControlId: ids?.telnyxCallControlId || null,
        sessionId: ids?.telnyxSessionId || null,
        recording: false,
        transcript: [],
      },
    })
    void logCallStart({
      telefono_destino: state.callerId || number || 'desk',
      telefono_origen: number || null,
      direccion: 'incoming',
      call_control_id: ids?.telnyxCallControlId || null,
      call_session_id: ids?.telnyxSessionId || null,
    })
      .then((row) => patchCall({ logId: row.id }))
      .catch(() => undefined)
    return
  }

  if (!state.call || state.call.id !== call.id) {
    // Otra llamada mientras ya hay una: la rechazamos para no duplicar audio.
    if (inbound && name === 'ringing' && rtcCall && call.id !== rtcCall.id) {
      void call.hangup().catch(() => undefined)
    }
    return
  }

  syncTelnyxIds(call)

  switch (name) {
    case 'requesting':
    case 'trying':
      patchCall({ phase: 'dialing' })
      break
    case 'ringing':
    case 'early':
      patchCall({ phase: 'ringing' })
      break
    case 'active':
      patchCall({
        phase: 'active',
        answeredAt: state.call.answeredAt ?? Date.now(),
        muted: call.isAudioMuted,
        recording: true,
      })
      break
    case 'held':
      patchCall({ phase: 'held' })
      break
    case 'hangup':
      patchCall({ phase: 'ending' })
      finishCall(call.cause || call.sipReason || undefined)
      break
    case 'destroy':
    case 'purge':
      finishCall(call.cause || undefined)
      break
    default:
      break
  }
}

function onNotification(n: INotification) {
  if (n.type === 'callUpdate' && n.call) {
    onCallUpdate(n.call)
    return
  }
  if (n.type === 'userMediaError') {
    void microphoneProblem().then((problem) =>
      showToast(problem ?? 'No hay micrófono disponible o el permiso está bloqueado.', 7000),
    )
    if (state.call) finishCall('media_error')
  }
}

/**
 * Transcripción en vivo. El streaming lo abre api-crm sobre la pata del
 * cliente; comparte `call_session_id` con nuestra pata WebRTC.
 * `inbound` = voz del cliente, `outbound` = voz del asesor.
 */
function onTranscription(evt: TranscriptionEvent) {
  const current = state.call
  if (!current || current.phase === 'ending') return
  const sameSession = Boolean(current.sessionId) && evt.call_session_id === current.sessionId
  const sameLeg = Boolean(current.callControlId) && evt.call_control_id === current.callControlId
  // Sin ids todavía (Telnyx aún no los ha mandado al SDK) aceptamos el evento si es
  // la única llamada activa del operador: el socket sólo trae nuestras llamadas.
  const idsUnknown = !current.sessionId && !current.callControlId
  if (!sameSession && !sameLeg && !idsUnknown) return

  const text = evt.transcript.trim()
  if (!text) return
  const speaker: TranscriptSpeaker = evt.transcription_track === 'outbound' ? 'asesor' : 'cliente'
  const lines = current.transcript.slice()
  const lastIdx = lines.length - 1
  const last = lines[lastIdx]

  if (last && !last.final && last.speaker === speaker) {
    lines[lastIdx] = { ...last, text, final: evt.is_final, at: evt.timestamp }
  } else {
    lines.push({ id: `t${++lineSeq}`, speaker, text, final: evt.is_final, at: evt.timestamp })
  }
  patchCall({ transcript: lines })
}

async function doConnect(): Promise<void> {
  if (!isCrmApiConfigured()) {
    setState({ status: 'off', error: 'Falta VITE_CRM_API_URL para activar el softphone.' })
    return
  }
  setState({ status: 'connecting', error: null })

  let TelnyxRTC: typeof import('@telnyx/webrtc').TelnyxRTC
  try {
    ;({ TelnyxRTC } = await import('@telnyx/webrtc'))
  } catch {
    setState({ status: 'error', error: 'No se pudo cargar el módulo de llamadas.' })
    return
  }
  if (!TelnyxRTC.webRTCInfo || typeof RTCPeerConnection === 'undefined') {
    setState({ status: 'error', error: 'Este navegador no soporta llamadas WebRTC.' })
    return
  }

  let creds: Awaited<ReturnType<typeof fetchWebrtcCredentials>>
  try {
    creds = await fetchWebrtcCredentials()
  } catch (e) {
    const msg = e instanceof CrmApiError ? e.message : 'No se pudieron obtener las credenciales SIP.'
    setState({ status: 'error', error: msg })
    return
  }

  fetchOutboundCli()
    .then((cli) => setState({ callerId: cli.from }))
    .catch(() => setState({ callerId: null }))

  registerCrmSocketUser(creds.crmUserId)
  unsubscribeTranscription?.()
  unsubscribeTranscription = onCrmTranscription(onTranscription)

  ensureRemoteAudio()

  const next = new TelnyxRTC({
    login: creds.login,
    password: creds.password,
    hangupOnBeforeUnload: true,
  })
  next.remoteElement = REMOTE_AUDIO_ID

  await new Promise<void>((resolve) => {
    let settled = false
    const done = () => {
      if (settled) return
      settled = true
      resolve()
    }
    next.on('telnyx.ready', () => {
      setState({ status: 'ready', error: null })
      done()
    })
    next.on('telnyx.error', (evt) => {
      const msg = (evt as { error?: { message?: string } })?.error?.message || 'Error de conexión con Telnyx.'
      setState({ status: 'error', error: msg })
      done()
    })
    next.on('telnyx.socket.close', () => {
      if (state.status === 'ready') setState({ status: 'connecting' })
    })
    next.on('telnyx.notification', onNotification)
    client = next
    next.connect().catch((e: unknown) => {
      setState({ status: 'error', error: e instanceof Error ? e.message : 'No se pudo conectar.' })
      done()
    })
  })
}

export const softphone = {
  getState: () => state,

  subscribe(fn: () => void) {
    listeners.add(fn)
    return () => {
      listeners.delete(fn)
    }
  },

  /** Conecta el softphone (idempotente). */
  connect(): Promise<void> {
    if (state.status === 'ready') return Promise.resolve()
    if (!connectPromise) {
      connectPromise = doConnect().finally(() => {
        connectPromise = null
      })
    }
    return connectPromise
  },

  async disconnect() {
    if (rtcCall) {
      await rtcCall.hangup().catch(() => undefined)
    }
    finishCall('client_disconnect')
    unsubscribeTranscription?.()
    unsubscribeTranscription = null
    if (client) {
      await client.disconnect().catch(() => undefined)
      client = null
    }
    setState({ status: 'off', error: null })
  },

  /** Marca a un cliente. Devuelve false si el softphone no está listo. */
  async call(rawNumber: string, opts: { label?: string; peticionId?: string | null } = {}): Promise<boolean> {
    if (state.call) {
      showToast('Ya hay una llamada en curso.')
      return true
    }
    if (state.status !== 'ready' || !client) {
      await softphone.connect()
      if (state.status !== 'ready' || !client) return false
    }

    const number = toDialNumber(rawNumber)
    if (!number) {
      showToast('El número no es válido.')
      return true
    }

    const micProblem = await microphoneProblem()
    if (micProblem) {
      showToast(micProblem, 7000)
      return true
    }

    const call = client.newCall({
      destinationNumber: number,
      callerNumber: state.callerId || undefined,
      audio: true,
      video: false,
      remoteElement: REMOTE_AUDIO_ID,
    })
    rtcCall = call

    setState({
      call: {
        id: call.id,
        direction: 'outgoing',
        phase: 'dialing',
        number,
        label: opts.label?.trim() || number,
        peticionId: opts.peticionId?.trim() || null,
        startedAt: Date.now(),
        answeredAt: null,
        muted: false,
        logId: null,
        callControlId: call.telnyxIDs?.telnyxCallControlId || null,
        sessionId: call.telnyxIDs?.telnyxSessionId || null,
        recording: false,
        transcript: [],
      },
    })

    // Sin ids Telnyx todavía: api-crm los enlaza después por teléfono
    // (`linkRecentSoftphoneToTelnyxLeg`) para colgar la grabación en esta fila.
    void logCallStart({
      telefono_destino: number,
      telefono_origen: state.callerId,
      direccion: 'outgoing',
      call_control_id: call.telnyxIDs?.telnyxCallControlId || `webrtc-${call.id}`,
      call_session_id: call.telnyxIDs?.telnyxSessionId || null,
    })
      .then((row) => patchCall({ logId: row.id }))
      .catch(() => undefined)

    return true
  },

  async answer() {
    if (!rtcCall || state.call?.direction !== 'incoming') return
    const micProblem = await microphoneProblem()
    if (micProblem) {
      showToast(micProblem, 7000)
      return
    }
    await rtcCall.answer({ remoteElement: REMOTE_AUDIO_ID }).catch(() => undefined)
  },

  async hangup() {
    if (!rtcCall) {
      finishCall('local_hangup')
      return
    }
    patchCall({ phase: 'ending' })
    await rtcCall.hangup().catch(() => undefined)
    finishCall('local_hangup')
  },

  toggleMute() {
    if (!rtcCall) return
    rtcCall.toggleAudioMute()
    patchCall({ muted: rtcCall.isAudioMuted })
  },

  async toggleHold() {
    if (!rtcCall) return
    await rtcCall.toggleHold().catch(() => undefined)
  },

  dtmf(digit: string) {
    if (!rtcCall || !/^[0-9*#]$/.test(digit)) return
    rtcCall.dtmf(digit)
  },

  clearLastCall() {
    if (state.lastCall) setState({ lastCall: null })
  },

  clearHistory() {
    saveHistory([])
    setState({ history: [] })
  },
}

/** Línea de constancia para las notas de gestión de la petición. */
export function callNoteLine(call: FinishedCall): string {
  const when = new Date(call.endedAt)
  const date = when.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' })
  const time = when.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
  const m = Math.floor(call.durationSec / 60)
  const s = call.durationSec % 60
  const duration = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  const kind = call.direction === 'incoming' ? 'Llamada entrante' : 'Llamada saliente'
  const result = call.answered ? `atendida (${duration})` : 'sin respuesta'
  const extra = call.answered && call.transcript.length > 0 ? ' · transcripción guardada' : ''
  return `${kind} ${date} ${time} · ${result}${extra}`
}

export function useSoftphone(): SoftphoneState {
  return useSyncExternalStore(softphone.subscribe, softphone.getState, softphone.getState)
}
