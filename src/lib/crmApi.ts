/**
 * Cliente HTTP hacia api-crm (CRM-API-main): softphone Telnyx, historial de llamadas…
 *
 * Autenticación: `Authorization: Bearer <access_token de Supabase>` (misma sesión
 * Hub Connect con la que entra el asesor). Sin sesión real, la API cae al SIP
 * compartido (si está configurado en el servidor).
 */

import { supabase } from './supabase'

export class CrmApiError extends Error {
  status: number
  constructor(message: string, status = 0) {
    super(message)
    this.name = 'CrmApiError'
    this.status = status
  }
}

export function crmApiBase(): string {
  const raw = (import.meta.env.VITE_CRM_API_URL as string | undefined)?.trim()
  return raw ? raw.replace(/\/+$/, '') : ''
}

export function isCrmApiConfigured(): boolean {
  return Boolean(crmApiBase())
}

async function bearerToken(): Promise<string | null> {
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
  const token = await bearerToken()
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

/** URL firmada (5 min) de la grabación (`GET /api/calls/:id/recording`). Requiere rol supervisor+. */
export async function fetchRecordingUrl(callId: string): Promise<string> {
  const res = await crmFetch<{ url: string }>(`/api/calls/${encodeURIComponent(callId)}/recording`)
  return res.url
}

/** Cuelga por Call Control si conocemos el `call_control_id` (`POST /api/call/hangup`). */
export function hangupByCallControl(callControlId: string): Promise<{ success: boolean }> {
  return crmFetch<{ success: boolean }>('/api/call/hangup', {
    method: 'POST',
    body: JSON.stringify({ call_control_id: callControlId }),
  })
}
