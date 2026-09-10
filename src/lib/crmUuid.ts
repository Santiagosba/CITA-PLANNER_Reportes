/**
 * IDs de taller en CRM / Hub / SQL Server son GUID.
 * Valores de vista previa (`local-preview`) no deben ir a Postgres ni a mssql.
 */

const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isCrmUuid(value: unknown): boolean {
  return GUID_RE.test(String(value ?? '').trim())
}

export function filterCrmUuids(ids: readonly unknown[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of ids) {
    const id = String(raw ?? '').trim().toLowerCase()
    if (!GUID_RE.test(id) || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

export function isSyntheticTallerId(value: unknown): boolean {
  const id = String(value ?? '').trim().toLowerCase()
  if (!id) return true
  if (GUID_RE.test(id)) return false
  return id === 'local-preview' || id.startsWith('local-') || id.startsWith('demo-')
}

export function isExpectedDemoIdError(message: string): boolean {
  return /local-preview|invalid guid|invalid input syntax for type uuid/i.test(message)
}
