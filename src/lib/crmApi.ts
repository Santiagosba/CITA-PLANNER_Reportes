/**
 * Cliente HTTP hacia api-crm (CRM-API-main): softphone Telnyx, historial de llamadas…
 *
 * Autenticación: `Authorization: Bearer <access_token de Supabase>` (misma sesión
 * Hub Connect con la que entra el asesor). Sin sesión real, la API cae al SIP
 * compartido (si está configurado en el servidor).
 */

import { supabase } from './supabase'
import { handleExpiredSession } from './sessionGuard'

export class CrmApiError extends Error {
  status: number
  constructor(message: string, status = 0) {
    super(message)
    this.name = 'CrmApiError'
    this.status = status
  }
}

function isLoopbackHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
}

function pageIsLocal(): boolean {
  return typeof window !== 'undefined' && isLoopbackHost(window.location.hostname)
}

function isUsableCrmUrl(raw: string): boolean {
  try {
    const target = new URL(raw)
    // Una web pública no puede llamar a localhost (Private Network Access).
    if (isLoopbackHost(target.hostname) && !pageIsLocal()) return false
    if (typeof window !== 'undefined' && window.location.protocol === 'https:' && target.protocol === 'http:') {
      return false
    }
  } catch {
    return false
  }
  return true
}

export function crmApiBase(): string {
  const raw = (import.meta.env.VITE_CRM_API_URL as string | undefined)?.trim()
  const cleaned = raw ? raw.replace(/\/+$/, '') : ''
  if (cleaned && isUsableCrmUrl(cleaned)) return cleaned
  // En Vercel / preview: /api/webrtc, /api/call* y /socket.io los reescribe vercel.json.
  // Se devuelve el origen absoluto porque socket.io interpreta una ruta relativa
  // como namespace, no como URL base.
  const sameOrigin = String(import.meta.env.VITE_CRM_API_SAME_ORIGIN || '').trim().toLowerCase()
  const allowSameOrigin = sameOrigin === '1' || sameOrigin === 'true' || (typeof window !== 'undefined' && !pageIsLocal())
  if (allowSameOrigin && typeof window !== 'undefined') {
    return window.location.origin
  }
  return ''
}

export function isCrmApiConfigured(): boolean {
  return Boolean(crmApiBase())
}

export async function crmAccessToken(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession()
    const token = data?.session?.access_token
    return token && !token.startsWith('demo-') ? token : null
  } catch {
    return null
  }
}

async function crmFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const base = crmApiBase()
  if (!base) throw new CrmApiError('Falta VITE_CRM_API_URL (URL de api-crm) en el .env del frontend.')

  const headers = new Headers(init.headers)
  if (!headers.has('Content-Type') && init.body) headers.set('Content-Type', 'application/json')
  const token = await crmAccessToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  let res: Response
  try {
    res = await fetch(`${base}${path.startsWith('/') ? path : `/${path}`}`, {
      ...init,
      headers,
      credentials: 'include',
    })
  } catch {
    throw new CrmApiError('No se pudo contactar con api-crm. Comprueba que está arrancada y el CORS.', 0)
  }

  let body: unknown = null
  try {
    body = await res.json()
  } catch {
    body = null
  }

  if (!res.ok) {
    if (res.status === 401 && token && !(await handleExpiredSession())) {
      throw new CrmApiError('Tu sesión ha caducado. Vuelve a entrar.', 401)
    }
    const apiError =
      body && typeof body === 'object' && 'error' in body ? String((body as { error: unknown }).error) : ''
    throw new CrmApiError(apiError || `Error api-crm (${res.status})`, res.status)
  }
  return body as T
}

/* ───── Softphone / Telnyx ─────────────────────────────────────────────── */

export type WebrtcCredentials = {
  login: string
  password: string
  crmUserId?: string
}

/** SIP del operador para `@telnyx/webrtc` (`GET /api/webrtc/credentials`). */
export function fetchWebrtcCredentials(): Promise<WebrtcCredentials> {
  return crmFetch<WebrtcCredentials>('/api/webrtc/credentials')
}

export type OutboundCli = {
  from: string | null
  source: string | null
  flowName?: string | null
}

/** Número que se presenta al cliente (`GET /api/call/outbound-cli`). */
export function fetchOutboundCli(): Promise<OutboundCli> {
  return crmFetch<OutboundCli>('/api/call/outbound-cli')
}

export type CallLogStart = {
  telefono_destino: string
  telefono_origen?: string | null
  direccion?: 'outgoing' | 'incoming'
  call_control_id?: string | null
  call_session_id?: string | null
  idcliente?: string | null
}

/** Abre la fila en `aviold.llamadas_softphone` (`POST /api/calls/log`). */
export function logCallStart(payload: CallLogStart): Promise<{ id: string }> {
  return crmFetch<{ id: string }>('/api/calls/log', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export type CallLogPatch = {
  estado?: 'answered' | 'completed' | 'missed' | 'failed' | 'rejected'
  fecha_respuesta?: string
  fecha_fin?: string
  duracion_seg?: number
  hangup_cause?: string
  notas?: string
}

/** Actualiza la fila de la llamada (`PATCH /api/calls/log/:id`). */
export function patchCallLog(callId: string, patch: CallLogPatch): Promise<{ ok: true }> {
  return crmFetch<{ ok: true }>(`/api/calls/log/${encodeURIComponent(callId)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
}

export type CustomerCallItem = {
  id: string
  fecha: string
  completada: boolean
  nocontesta: boolean
  agente: string
  agenteId: string
  cliente: string
  telefono: string
  campana: string
  observaciones: string
  tieneCita: boolean
  /** Notas de la llamada: aquí guardamos la transcripción. */
  resumen: string
  titular: string
  duracionSeg: number | null
  tipo: 'llamada' | 'sms' | 'whatsapp' | 'email'
  entrante?: boolean
  hasRecording?: boolean
  softphoneLogId?: string | null
  esCallbot?: boolean
}

/**
 * Llamadas previas con un teléfono (`GET /api/calls/customer-history`).
 * La API acota a 100 como máximo; pedimos ese tope.
 */
export async function fetchCustomerCalls(phone: string): Promise<CustomerCallItem[]> {
  const qs = new URLSearchParams({ phone, limit: '100' })
  const res = await crmFetch<{ items: CustomerCallItem[] }>(`/api/calls/customer-history?${qs.toString()}`)
  return (res.items || []).filter((item) => item.tipo === 'llamada' || !item.tipo)
}

export type CallCostBreakdownItem = {
  product: string
  cost: number
  currency: string
  billed_sec: number | null
  rate: number | null
  rate_measured_in: string | null
}

export type CallCost = {
  amount: number
  currency: string
  rate_per_min: number | null
  billed_sec: number | null
  breakdown: CallCostBreakdownItem[]
  updated_at: string | null
}

export type CallDetail = {
  id: string
  telefono_destino: string | null
  telefono_origen: string | null
  direccion: 'outgoing' | 'incoming' | string | null
  estado: string | null
  fecha_inicio: string | null
  fecha_respuesta: string | null
  fecha_fin: string | null
  duracion_seg: number | null
  hangup_cause: string | null
  /** Transcripción («Transcripción de la llamada\nAsesor: …») o resumen. */
  notas: string | null
  notas_titular: string | null
  tags: unknown[]
  agente: string | null
  cliente: string | null
  call_control_id: string | null
  call_session_id: string | null
  recording: { available: boolean; url: string | null; duration_sec: number | null }
  cost: CallCost | null
  /** Telnyx todavía no ha publicado el coste; conviene volver a preguntar. */
  cost_pending: boolean
}

/** Detalle completo de una llamada del softphone (`GET /api/calls/log/:id`). */
export function fetchCallDetail(callId: string): Promise<CallDetail> {
  return crmFetch<CallDetail>(`/api/calls/log/${encodeURIComponent(callId)}`)
}

export type RateEstimate = {
  ratePerMin: number
  currency: string
  source: 'history' | 'default'
}

/** Tarifa estimada por minuto hacia un destino (`GET /api/calls/rate-estimate`). */
export async function fetchRateEstimate(to: string): Promise<RateEstimate | null> {
  const qs = new URLSearchParams({ to })
  const res = await crmFetch<{ estimate: RateEstimate | null }>(`/api/calls/rate-estimate?${qs.toString()}`)
  return res.estimate ?? null
}

/** URL firmada (5 min) de la grabación (`GET /api/calls/:id/recording`). Requiere rol supervisor+. */
export async function fetchRecordingUrl(callId: string): Promise<string> {
  const res = await crmFetch<{ url: string }>(`/api/calls/${encodeURIComponent(callId)}/recording`)
  return res.url
}

/** Arranca el streaming Deepgram de api-crm (`POST /api/call/transcription/start`). */
export function startCallTranscription(refs: {
  call_control_id: string
  call_session_id?: string | null
}): Promise<{ success: boolean }> {
  return crmFetch<{ success: boolean }>('/api/call/transcription/start', {
    method: 'POST',
    body: JSON.stringify({
      call_control_id: refs.call_control_id,
      call_session_id: refs.call_session_id || undefined,
    }),
  })
}

export type CallCostDay = {
  day: string
  calls: number
  cost: number
  duration_sec: number
}

export type CallCostStats = {
  from: string
  to: string
  currency: string
  calls: number
  answered: number
  duration_sec: number
  cost: number
  with_cost: number
  with_recording: number
  with_transcript: number
  series: CallCostDay[]
}

/** Totales y serie diaria de costes del softphone (`GET /api/calls/cost-stats`). */
export function fetchCallCostStats(range?: { from?: string; to?: string }): Promise<CallCostStats> {
  const qs = new URLSearchParams()
  if (range?.from) qs.set('from', range.from)
  if (range?.to) qs.set('to', range.to)
  const suffix = qs.toString() ? `?${qs.toString()}` : ''
  return crmFetch<CallCostStats>(`/api/calls/cost-stats${suffix}`)
}

/** Cuelga por Call Control si conocemos el `call_control_id` (`POST /api/call/hangup`). */
export function hangupByCallControl(callControlId: string): Promise<{ success: boolean }> {
  return crmFetch<{ success: boolean }>('/api/call/hangup', {
    method: 'POST',
    body: JSON.stringify({ call_control_id: callControlId }),
  })
}
