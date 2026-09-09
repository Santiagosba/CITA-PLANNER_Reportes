/**
 * Socket.io hacia api-crm: transcripción en vivo (`call_transcription`) y
 * eventos de llamada (`call_event`) que emite el webhook de Telnyx.
 */

import { io, type Socket } from 'socket.io-client'
import { crmAccessToken, crmRealtimeBase } from './crmApi'

export type TranscriptionEvent = {
  call_control_id: string
  call_leg_id?: string
  call_session_id?: string
  transcription_track: 'inbound' | 'outbound' | string
  is_final: boolean
  transcript: string
  confidence?: number
  timestamp: string
}

export type CallSocketEvent = {
  event_type: string
  call_control_id: string
  call_leg_id?: string
  call_session_id?: string
  from?: string
  to?: string
  direction?: string
  hangup_cause?: string
  timestamp: string
}

type CallSubscription = {
  logId: string
  callControlId?: string
  sessionId?: string
  onAck?: (ok: boolean) => void
}

let socket: Socket | null = null
let registeredUser: string | null = null
/**
 * Salas de llamada activas. Socket.io pierde las salas al reconectar, así que
 * las guardamos y las volvemos a pedir en cada `connect`.
 */
const subscriptions = new Map<string, CallSubscription>()

function subscriptionKey(sub: CallSubscription): string {
  return `${sub.logId}|${sub.callControlId || ''}|${sub.sessionId || ''}`
}

function emitSubscribe(s: Socket, sub: CallSubscription) {
  s.timeout(8000).emit(
    'subscribe_call',
    {
      logId: sub.logId,
      callControlId: sub.callControlId || undefined,
      sessionId: sub.sessionId || undefined,
    },
    (err: unknown, res?: { ok?: boolean }) => {
      // Sin respuesta (versión antigua de api-crm) no lo tratamos como rechazo.
      if (err) return
      sub.onAck?.(Boolean(res?.ok))
    },
  )
}

export function getCrmSocket(): Socket | null {
  const base = crmRealtimeBase()
  if (!base) return null
  if (socket) return socket
  socket = io(base, {
    auth: async (done) => {
      done({ token: (await crmAccessToken()) || '' })
    },
    withCredentials: true,
    transports: ['websocket', 'polling'],
    reconnectionAttempts: Infinity,
    reconnectionDelayMax: 8000,
  })
  socket.on('connect', () => {
    const s = socket
    if (!s) return
    if (registeredUser) s.emit('register_user', registeredUser)
    for (const sub of subscriptions.values()) emitSubscribe(s, sub)
  })
  return socket
}

/** Identifica al operador (id de `aviold.usuarios`) para eventos dirigidos. */
export function registerCrmSocketUser(crmUserId: string | null | undefined) {
  registeredUser = crmUserId?.trim() || null
  const s = getCrmSocket()
  if (s?.connected && registeredUser) s.emit('register_user', registeredUser)
}

/**
 * Se suscribe a la sala privada de una llamada después de validar su propiedad
 * en api-crm. Idempotente por (logId, ids); `onAck(false)` = sin permiso.
 */
export function subscribeCrmSocketCall(call: {
  logId?: string | null
  callControlId?: string | null
  sessionId?: string | null
  onAck?: (ok: boolean) => void
}) {
  if (!call.logId || (!call.callControlId && !call.sessionId)) return
  const sub: CallSubscription = {
    logId: call.logId,
    callControlId: call.callControlId || undefined,
    sessionId: call.sessionId || undefined,
    onAck: call.onAck,
  }
  const key = subscriptionKey(sub)
  if (subscriptions.has(key)) return
  subscriptions.set(key, sub)
  const s = getCrmSocket()
  if (!s) return
  if (s.connected) emitSubscribe(s, sub)
  // Si aún no está conectado, `connect` reenvía todas las suscripciones.
}

/** Olvida las salas de la llamada (o de todas) al colgar. */
export function clearCrmSocketCallSubscriptions(logId?: string | null) {
  if (!logId) {
    subscriptions.clear()
    return
  }
  for (const [key, sub] of subscriptions) {
    if (sub.logId === logId) subscriptions.delete(key)
  }
}

export function isCrmSocketConnected(): boolean {
  return Boolean(socket?.connected)
}

export function onCrmTranscription(handler: (evt: TranscriptionEvent) => void): () => void {
  const s = getCrmSocket()
  if (!s) return () => undefined
  s.on('call_transcription', handler)
  return () => {
    s.off('call_transcription', handler)
  }
}

export function onCrmCallEvent(handler: (evt: CallSocketEvent) => void): () => void {
  const s = getCrmSocket()
  if (!s) return () => undefined
  s.on('call_event', handler)
  return () => {
    s.off('call_event', handler)
  }
}
