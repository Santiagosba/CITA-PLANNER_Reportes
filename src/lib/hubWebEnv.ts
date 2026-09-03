/**
 * Identidad canónica de la web Hub en la que corre esta SPA.
 * UUID proviene de operations.hub_webs.id (slug según tu proyecto); no hardcodear UUIDs entre despliegues.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** Normaliza UUID hub_webs para comparar con JWT connect_site_ids. */
export function normalizeHubWebUuid(raw: string | null | undefined): string {
  return String(raw || '').trim().toLowerCase()
}

export function getCrmHubWebIdFromEnv(): string | null {
  const raw = import.meta.env.VITE_HUB_WEB_ID as string | undefined
  const v = normalizeHubWebUuid(raw)
  if (!v || !UUID_RE.test(v)) return null
  return v
}

export const MISSING_VITE_HUB_WEB_ID_MESSAGE =
  "Falta o no es válido VITE_HUB_WEB_ID: en BD localiza operations.hub_webs la fila de ESTE producto (por slug/nombre que uses), copia id (UUID) y ponla en .env como VITE_HUB_WEB_ID=... sin comillas. Reinicia npm run dev. En Vercel u otro host, define la misma variable en Environment Variables."
