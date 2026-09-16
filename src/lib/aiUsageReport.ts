import { isSuperAdminUser, isTallerAdminUser } from './crmAccess'
import { isCrmUuid } from './crmUuid'
import { readLocalPreview } from './localPreview'
import { supabase, supabaseAviOld, supabaseOperations } from './supabase'
import { fetchAllSupabasePages } from './supabaseFetchAll'

export type AiUsageReport = {
  from: string
  to: string
  kpis: {
    requests: number
    tokens: number
    estimatedCostUsd: number
    errorCount: number
  }
  series: Array<{ date: string; requests: number; tokens: number; costUsd: number }>
  byFeature: Array<{ feature: string; label: string; requests: number; tokens: number; costUsd: number }>
  byModel: Array<{ model: string; requests: number; tokens: number; costUsd: number }>
  features: Array<{ feature: string; label: string }>
}

export type AiUsageScope = 'taller' | 'cuenta'

const AI_FEATURE_LABELS: Record<string, string> = {
  call_audit: 'Auditoría de llamadas',
  audit_rules: 'Reglas de auditoría',
  argumentario: 'Guion / argumentario IA',
  script_parser: 'Parser de guion',
  live_suggestions: 'Sugerencias en llamada',
  call_tags: 'Tags de llamada',
  call_summary: 'Resumen de llamada',
  sql_ask: 'Consultas NL→SQL / GPT',
  auto_assign: 'Auto-asignación',
  postpone: 'Recomendación aplazamiento',
  customer_insight: 'Insight cliente',
  dashboard_alerts: 'Alertas dashboard',
  survey_template: 'Plantillas encuesta',
  whatsapp_day_summary: 'Resumen WhatsApp día',
  comm_titular: 'Titular SMS/email',
  whatsapp_transcribe: 'Transcripción notas de voz',
  tts: 'TTS flujos telefónicos',
  embeddings: 'Embeddings RAG',
  unknown: 'Sin clasificar',
}

const EVENT_SELECT = 'created_at, feature, model, total_tokens, estimated_cost_usd, status'
const ID_CHUNK = 80

type AiUsageEventRow = {
  created_at: string
  feature: string | null
  model: string | null
  total_tokens: number | null
  estimated_cost_usd: number | null
  status: string | null
}

function featureLabel(feature: string): string {
  return AI_FEATURE_LABELS[feature] || feature || AI_FEATURE_LABELS.unknown
}

function madridDay(value: Date | string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(typeof value === 'string' ? new Date(value) : value)
}

function daySeries(fromIso: string, toIso: string): string[] {
  const out: string[] = []
  let cursor = new Date(fromIso)
  const end = new Date(toIso)
  let guard = 0
  while (cursor < end && guard < 400) {
    out.push(madridDay(cursor))
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000)
    guard += 1
  }
  return [...new Set(out)].sort()
}

function emptyReport(from: string, to: string): AiUsageReport {
  return {
    from,
    to,
    kpis: { requests: 0, tokens: 0, estimatedCostUsd: 0, errorCount: 0 },
    series: daySeries(from, to).map((date) => ({ date, requests: 0, tokens: 0, costUsd: 0 })),
    byFeature: [],
    byModel: [],
    features: Object.keys(AI_FEATURE_LABELS)
      .filter((key) => key !== 'unknown')
      .sort((a, b) => featureLabel(a).localeCompare(featureLabel(b), 'es'))
      .map((feature) => ({ feature, label: featureLabel(feature) })),
  }
}

function applyFeatureFilter<T extends { eq: (column: string, value: string) => T }>(query: T, feature: string | null): T {
  return feature ? query.eq('feature', feature) : query
}

function chunkIds(ids: string[]): string[][] {
  const chunks: string[][] = []
  for (let i = 0; i < ids.length; i += ID_CHUNK) chunks.push(ids.slice(i, i + ID_CHUNK))
  return chunks
}

async function tallerMemberIds(idtaller: string, sessionUserId: string | null): Promise<string[]> {
  const ids = new Set<string>()
  if (sessionUserId && isCrmUuid(sessionUserId)) ids.add(sessionUserId)

  try {
    const rows = await fetchAllSupabasePages(() =>
      supabaseOperations.from('taller_users').select('user_id, legacy_idusuario').eq('idtaller', idtaller),
    )
    for (const row of rows as Array<{ user_id?: unknown; legacy_idusuario?: unknown }>) {
      const userId = String(row.user_id || '').trim()
      const legacyId = String(row.legacy_idusuario || '').trim()
      if (isCrmUuid(userId)) ids.add(userId)
      if (isCrmUuid(legacyId)) ids.add(legacyId)
    }
  } catch {
    /* RLS puede limitar el listado; seguimos con el usuario de la sesión. */
  }

  try {
    const rows = await fetchAllSupabasePages(() =>
      supabaseAviOld.from('talleresusuariorol').select('idusuario').eq('idtaller', idtaller),
    )
    for (const row of rows as Array<{ idusuario?: unknown }>) {
      const userId = String(row.idusuario || '').trim()
      if (isCrmUuid(userId)) ids.add(userId)
    }
  } catch {
    /* Sin acceso a la tabla legacy no bloqueamos el informe. */
  }

  return [...ids]
}

async function loadEvents(opts: {
  from: string
  to: string
  idtaller: string | null
  feature: string | null
  memberIds: string[]
}): Promise<AiUsageEventRow[]> {
  const ranged = () => {
    const query = supabaseAviOld
      .from('ai_usage_events')
      .select(EVENT_SELECT)
      .gte('created_at', opts.from)
      .lt('created_at', opts.to)
    return applyFeatureFilter(query, opts.feature)
  }

  if (!opts.idtaller) {
    return fetchAllSupabasePages<AiUsageEventRow>(() => ranged())
  }

  const tagged = await fetchAllSupabasePages<AiUsageEventRow>(() => ranged().eq('idtaller', opts.idtaller as string))
  if (opts.memberIds.length === 0) return tagged

  const unattributed = await Promise.all(
    chunkIds(opts.memberIds).map((chunk) =>
      fetchAllSupabasePages<AiUsageEventRow>(() => ranged().is('idtaller', null).in('idusuario', chunk)),
    ),
  )
  return [...tagged, ...unattributed.flat()]
}

function buildReport(from: string, to: string, rows: AiUsageEventRow[]): AiUsageReport {
  const seriesMap = new Map<string, { date: string; requests: number; tokens: number; costUsd: number }>()
  const byFeatureMap = new Map<string, { feature: string; requests: number; tokens: number; costUsd: number }>()
  const byModelMap = new Map<string, { model: string; requests: number; tokens: number; costUsd: number }>()
  let tokens = 0
  let costUsd = 0
  let errorCount = 0

  for (const row of rows) {
    const day = madridDay(row.created_at)
    const rowTokens = Number(row.total_tokens) || 0
    const rowCost = Number(row.estimated_cost_usd) || 0
    tokens += rowTokens
    costUsd += rowCost
    if (row.status === 'error') errorCount += 1

    const dayRow = seriesMap.get(day) ?? { date: day, requests: 0, tokens: 0, costUsd: 0 }
    dayRow.requests += 1
    dayRow.tokens += rowTokens
    dayRow.costUsd += rowCost
    seriesMap.set(day, dayRow)

    const feature = String(row.feature || 'unknown')
    const featureRow = byFeatureMap.get(feature) ?? { feature, requests: 0, tokens: 0, costUsd: 0 }
    featureRow.requests += 1
    featureRow.tokens += rowTokens
    featureRow.costUsd += rowCost
    byFeatureMap.set(feature, featureRow)

    const model = String(row.model || '').trim() || '(sin modelo)'
    const modelRow = byModelMap.get(model) ?? { model, requests: 0, tokens: 0, costUsd: 0 }
    modelRow.requests += 1
    modelRow.tokens += rowTokens
    modelRow.costUsd += rowCost
    byModelMap.set(model, modelRow)
  }

  const knownFeatures = new Set([...Object.keys(AI_FEATURE_LABELS), ...byFeatureMap.keys()])

  return {
    from,
    to,
    kpis: {
      requests: rows.length,
      tokens,
      estimatedCostUsd: costUsd,
      errorCount,
    },
    series: daySeries(from, to).map((date) => seriesMap.get(date) ?? { date, requests: 0, tokens: 0, costUsd: 0 }),
    byFeature: [...byFeatureMap.values()]
      .sort((a, b) => b.costUsd - a.costUsd || b.requests - a.requests)
      .map((row) => ({ ...row, label: featureLabel(row.feature) })),
    byModel: [...byModelMap.values()].sort((a, b) => b.costUsd - a.costUsd || b.requests - a.requests),
    features: [...knownFeatures]
      .filter((feature) => feature !== 'unknown' || knownFeatures.size === 1)
      .sort((a, b) => featureLabel(a).localeCompare(featureLabel(b), 'es'))
      .map((feature) => ({ feature, label: featureLabel(feature) })),
  }
}

/** Informe de tokens desde `aviold.ai_usage_events`, acotado al taller si no es AviAdmin. */
export async function fetchAiUsageReportFromSupabase(opts: {
  from: string
  to: string
  idtaller?: string | null
  feature?: string | null
}): Promise<AiUsageReport & { scope: AiUsageScope }> {
  const preview = readLocalPreview()
  const { data } = await supabase.auth.getSession()
  const user = data.session?.user
  const canRead = Boolean(user && (isTallerAdminUser(user) || isSuperAdminUser(user)))
  if (!user || !canRead) {
    return { ...emptyReport(opts.from, opts.to), scope: opts.idtaller || preview ? 'taller' : 'cuenta' }
  }

  const idtaller = isCrmUuid(opts.idtaller) ? String(opts.idtaller).trim() : null
  const isSuper = isSuperAdminUser(user)
  if (!idtaller && !isSuper) return { ...emptyReport(opts.from, opts.to), scope: 'taller' }

  const feature = opts.feature && opts.feature !== 'all' ? opts.feature : null
  const memberIds = idtaller ? await tallerMemberIds(idtaller, user.id) : []
  const rows = await loadEvents({
    from: opts.from,
    to: opts.to,
    idtaller,
    feature,
    memberIds,
  })
  return { ...buildReport(opts.from, opts.to, rows), scope: idtaller ? 'taller' : 'cuenta' }
}
