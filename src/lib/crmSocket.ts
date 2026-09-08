/**
 * Socket.io hacia api-crm: transcripción en vivo (`call_transcription`) y
 * eventos de llamada (`call_event`) que emite el webhook de Telnyx.
 */

import { io, type Socket } from 'socket.io-client'
import { crmAccessToken, crmApiBase } from './crmApi'

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

let socket: Socket | null = null
let registeredUser: string | null = null

export function getCrmSocket(): Socket | null {
  const base = crmApiBase()
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
    if (registeredUser) socket?.emit('register_user', registeredUser)
  })
  return socket
}

/** Identifica al operador (id de `aviold.usuarios`) para eventos dirigidos. */
export function registerCrmSocketUser(crmUserId: string | null | undefined) {
  registeredUser = crmUserId?.trim() || null
  const s = getCrmSocket()
  if (s?.connected && registeredUser) s.emit('register_user', registeredUser)
}

/** Se suscribe a la sala privada de una llamada después de validar su propiedad en api-crm. */
export function subscribeCrmSocketCall(call: {
  logId?: string | null
  callControlId?: string | null
  sessionId?: string | null
}) {
  if (!call.logId || (!call.callControlId && !call.sessionId)) return
  const s = getCrmSocket()
  if (!s) return
  s.emit('subscribe_call', {
    logId: call.logId,
    callControlId: call.callControlId || undefined,
    sessionId: call.sessionId || undefined,
  })
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
