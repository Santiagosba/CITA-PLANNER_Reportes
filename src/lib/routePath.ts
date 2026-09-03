/**
 * Slug de licencia / contenedor desde la URL (patrón tipo Hub Connect).
 * Tras aplicar `VITE_APP_BASE_PATH`, el primer segmento no reservado (regex [a-z0-9_-]+) identifica la licencia si es la única ruta (`/slug`).
 */

export function getAppBasePath(): string {
  const raw = (import.meta.env.VITE_APP_BASE_PATH || '').trim();
  if (!raw || raw === '/') return '';
  const withSlash = raw.startsWith('/') ? raw : `/${raw}`;
  return withSlash.replace(/\/+$/, '') || '';
}

export function stripAppBasePathFromPathname(pathname: string): string {
  const base = getAppBasePath();
  let p = String(pathname ?? '/').trim() || '/';
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  if (!p.startsWith('/')) p = `/${p}`;
  if (!base) return p;
  if (p === base || p === `${base}/`) return '/';
  if (p.startsWith(`${base}/`)) {
    const rest = p.slice(base.length);
    return rest.startsWith('/') ? rest : `/${rest}`;
  }
  return p;
}

/** Segmentos que nunca cuentan como slug de taller/licencia */
export const RESERVED_FIRST_SEGMENT = new Set([
  'api',
  'assets',
  'auth',
  'sb',
  'favicon.ico',
  'robots.txt',
  'login',
  'logout',
  'static',
  'dashboard',
  'callback',
]);

const SLUG_REGEX = /^[a-z0-9_-]+$/;

const HUB_ROUTING_PREFIX_SEGMENTS = new Set(['sb']);

function collapseHubRoutingPrefixes(segments: string[]): string[] {
  let s = segments;
  while (s.length > 1 && HUB_ROUTING_PREFIX_SEGMENTS.has(s[0].toLowerCase())) {
    s = s.slice(1);
  }
  return s;
}

export function parseWorkshopSlugFromPathname(pathname: string | null | undefined): string | null {
  const stripped = stripAppBasePathFromPathname(String(pathname ?? '/').trim());
  if (!stripped || stripped === '/') return null;

  let segments = stripped.split('/').filter((x) => x.length > 0);
  segments = collapseHubRoutingPrefixes(segments);
  if (segments.length !== 1) return null;

  const seg = segments[0].toLowerCase();
  if (RESERVED_FIRST_SEGMENT.has(seg)) return null;
  if (!SLUG_REGEX.test(seg)) return null;
  return seg;
}
