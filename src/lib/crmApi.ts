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
  /**
   * `true` cuando el 404 lo devuelve Express por ruta inexistente (HTML, sin
   * `{ error }`), es decir, el api-crm desplegado es más antiguo que este
   * frontend y no tiene el endpoint. Distinto de «registro no encontrado».
   */
  endpointMissing: boolean
  constructor(message: string, status = 0, endpointMissing = false) {
    super(message)
    this.name = 'CrmApiError'
    this.status = status
    this.endpointMissing = endpointMissing
  }
}

export function isEndpointMissing(e: unknown): boolean {
  return e instanceof CrmApiError && e.endpointMissing
}

export const CRM_OUTDATED_MESSAGE =
  'El api-crm desplegado no tiene este endpoint (versión antigua). Hay que actualizar api-crm.avigo.es.'

/**
 * Endpoints que ya sabemos que no existen en el api-crm desplegado. Evita
 * repetir peticiones (y 404 en consola) durante la sesión.
 */
const unsupportedEndpoints = new Set<string>()

export function isCrmEndpointUnsupported(key: string): boolean {
  return unsupportedEndpoints.has(key)
}

function isLoopbackHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
}

function pageIsLocal(): boolean {
  return typeof window !== 'undefined' && isLoopbackHost(window.location.hostname)
}

/** Host público de api-crm. Vercel no puede proxificar WebSockets. */
export const CRM_PUBLIC_ORIGIN = 'https://api-crm.avigo.es'

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
  // HTTP en Vercel: /api/webrtc y /api/call* los reescribe vercel.json (mismo origen).
  const sameOrigin = String(import.meta.env.VITE_CRM_API_SAME_ORIGIN || '').trim().toLowerCase()
  const allowSameOrigin = sameOrigin === '1' || sameOrigin === 'true' || (typeof window !== 'undefined' && !pageIsLocal())
  if (allowSameOrigin && typeof window !== 'undefined') {
    return window.location.origin
  }
  return ''
}

/** Socket.io tiene que ir al host real de api-crm: Vercel no hace proxy de WebSockets. */
export function crmRealtimeBase(): string {
  const raw = (import.meta.env.VITE_CRM_API_URL as string | undefined)?.trim()
  const cleaned = raw ? raw.replace(/\/+$/, '') : ''
  if (cleaned && isUsableCrmUrl(cleaned)) return cleaned
  if (typeof window !== 'undefined' && !pageIsLocal()) return CRM_PUBLIC_ORIGIN
  return crmApiBase()
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

/** Id del usuario autenticado en Supabase (coincide con `aviold.usuarios.idusuario` en operadores vinculados). */
export async function crmAuthUserId(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession()
    const id = data?.session?.user?.id
    return id && !id.startsWith('demo-') ? id : null
  } catch {
    return null
  }
}

type CrmFetchOptions = RequestInit & {
  /** Clave estable del endpoint (sin ids) para recordar que la API desplegada no lo tiene. */
  endpointKey?: string
}

async function crmFetch<T>(path: string, init: CrmFetchOptions = {}): Promise<T> {
  const base = crmApiBase()
  if (!base) throw new CrmApiError('Falta VITE_CRM_API_URL (URL de api-crm) en el .env del frontend.')

  const { endpointKey, ...requestInit } = init
  if (endpointKey && unsupportedEndpoints.has(endpointKey)) {
    throw new CrmApiError(CRM_OUTDATED_MESSAGE, 404, true)
  }

  const headers = new Headers(requestInit.headers)
  if (!headers.has('Content-Type') && init.body) headers.set('Content-Type', 'application/json')
  const token = await crmAccessToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  let res: Response
  try {
    res = await fetch(`${base}${path.startsWith('/') ? path : `/${path}`}`, {
      ...requestInit,
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
    // Express responde a rutas inexistentes con HTML («Cannot GET …»), nunca con `{ error }`.
    const endpointMissing = res.status === 404 && !apiError
    if (endpointMissing && endpointKey) unsupportedEndpoints.add(endpointKey)
    throw new CrmApiError(
      apiError || (endpointMissing ? CRM_OUTDATED_MESSAGE : `Error api-crm (${res.status})`),
      res.status,
      endpointMissing,
    )
  }
  return body as T
}

/* ───── Softphone / Telnyx ─────────────────────────────────────────────── */

export type WebrtcCredentials = {
  login: string
  password: string
  crmUserId?: string
}

/**
 * SIP del operador para `@telnyx/webrtc` (`GET /api/webrtc/credentials`).
 * Mandamos `idUsuario` explícito (como la app móvil): las versiones antiguas de
 * api-crm resuelven el operador por ese parámetro y devuelven `crmUserId`.
 */
export async function fetchWebrtcCredentials(): Promise<WebrtcCredentials> {
  const authId = await crmAuthUserId()
  const qs = authId ? `?${new URLSearchParams({ idUsuario: authId }).toString()}` : ''
  return crmFetch<WebrtcCredentials>(`/api/webrtc/credentials${qs}`)
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

/**
 * Abre la fila en `aviold.llamadas_softphone` (`POST /api/calls/log`).
 * La versión actual de api-crm ignora `idusuario` (lo saca del token); las
 * antiguas lo necesitan para asociar la llamada al operador.
 */
export async function logCallStart(payload: CallLogStart): Promise<{ id: string }> {
  const authId = await crmAuthUserId()
  return crmFetch<{ id: string }>('/api/calls/log', {
    method: 'POST',
    body: JSON.stringify(authId ? { ...payload, idusuario: authId, idUsuario: authId } : payload),
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
  /** Códigos de cierre (cita, no contesta, gestionado…). */
  tags?: string[]
  hasRecording?: boolean
  softphoneLogId?: string | null
  esCallbot?: boolean
}

/**
 * Historial del cliente (`GET /api/calls/customer-history`): llamadas, WhatsApp, SMS y email.
 * La API acota a 100 por petición; pedimos ese tope y devolvemos todas las filas.
 */
export async function fetchCustomerCalls(phone: string): Promise<CustomerCallItem[]> {
  const qs = new URLSearchParams({ phone, limit: '100' })
  const res = await crmFetch<{ items: CustomerCallItem[] }>(`/api/calls/customer-history?${qs.toString()}`)
  return res.items || []
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

export const CALL_DETAIL_ENDPOINT = 'GET /api/calls/log/:id'

/** Detalle completo de una llamada del softphone (`GET /api/calls/log/:id`). */
export function fetchCallDetail(callId: string): Promise<CallDetail> {
  return crmFetch<CallDetail>(`/api/calls/log/${encodeURIComponent(callId)}`, {
    endpointKey: CALL_DETAIL_ENDPOINT,
  })
}

export type RateEstimate = {
  ratePerMin: number
  currency: string
  source: 'history' | 'default'
}

/** Tarifa estimada por minuto hacia un destino (`GET /api/calls/rate-estimate`). */
export async function fetchRateEstimate(to: string): Promise<RateEstimate | null> {
  const qs = new URLSearchParams({ to })
  try {
    const res = await crmFetch<{ estimate: RateEstimate | null }>(`/api/calls/rate-estimate?${qs.toString()}`, {
      endpointKey: 'GET /api/calls/rate-estimate',
    })
    return res.estimate ?? null
  } catch (e) {
    if (e instanceof CrmApiError && (e.status === 404 || e.status === 0)) return null
    throw e
  }
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
  return crmFetch<CallCostStats>(`/api/calls/cost-stats${suffix}`, { endpointKey: 'GET /api/calls/cost-stats' })
}

/** Cuelga por Call Control si conocemos el `call_control_id` (`POST /api/call/hangup`). */
export function hangupByCallControl(callControlId: string): Promise<{ success: boolean }> {
  return crmFetch<{ success: boolean }>('/api/call/hangup', {
    method: 'POST',
    body: JSON.stringify({ call_control_id: callControlId }),
  })
}
