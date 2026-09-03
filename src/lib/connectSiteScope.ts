/**
 * Alcance Hub Connect por UUID de web (`hub_webs.id`), alineado con JWT `connect_site_ids`.
 */

export type ConnectSiteIdsParseResult =
  | { mode: 'legacy' }
  | { mode: 'scoped'; siteIds: ReadonlySet<string> }

function normalizeUuid(raw: string | null | undefined): string {
  return String(raw || '').trim().toLowerCase()
}

function rawClaimToUuidList(raw: unknown): string[] {
  if (raw == null) return []
  if (Array.isArray(raw)) {
    return raw.map((x) => String(x).trim()).filter(Boolean)
  }
  if (typeof raw === 'string') {
    return raw
      .split(/[,;\s]+/)
      .map((s) => s.trim())
      .filter(Boolean)
  }
  return []
}

export function parseConnectSiteIds(user: any | null | undefined): ConnectSiteIdsParseResult {
  if (!user || typeof user !== 'object') return { mode: 'legacy' }
  const am =
    (user as any).app_metadata && typeof (user as any).app_metadata === 'object'
      ? ((user as any).app_metadata as Record<string, unknown>)
      : {}
  const um =
    (user as any).user_metadata && typeof (user as any).user_metadata === 'object'
      ? ((user as any).user_metadata as Record<string, unknown>)
      : {}
  const hasAm = Object.prototype.hasOwnProperty.call(am, 'connect_site_ids')
  const hasUm = Object.prototype.hasOwnProperty.call(um, 'connect_site_ids')
  if (!hasAm && !hasUm) return { mode: 'legacy' }
  const raw = hasAm ? am.connect_site_ids : um.connect_site_ids
  const list = rawClaimToUuidList(raw).map(normalizeUuid).filter(Boolean)
  return { mode: 'scoped', siteIds: new Set(list) }
}

export function scopedSitesEmptyDenied(parse: ConnectSiteIdsParseResult): boolean {
  return parse.mode === 'scoped' && parse.siteIds.size === 0
}

export function containerAllowedForConnectSites(
  hubWebId: string | null | undefined,
  parse: ConnectSiteIdsParseResult,
  isGlobalAviAdmin: boolean,
): boolean {
  if (isGlobalAviAdmin) return true
  if (parse.mode === 'legacy') return true
  const id = normalizeUuid(hubWebId)
  if (!id) return false
  return parse.siteIds.has(id)
}

export function sessionAllowsThisHubWeb(
  parse: ConnectSiteIdsParseResult,
  hubWebUuid: string | null | undefined,
  isGlobalAviAdmin: boolean,
): boolean {
  if (isGlobalAviAdmin) return true
  const id = normalizeUuid(hubWebUuid)
  if (!id) return false
  if (parse.mode === 'legacy') return true
  return parse.siteIds.has(id)
}

export function jwtDeclaresConnectSiteIds(user: any | null | undefined): boolean {
  const p = parseConnectSiteIds(user)
  return p.mode === 'scoped'
}
