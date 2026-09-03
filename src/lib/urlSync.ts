import { getAppBasePath } from './routePath';

/** Tras `replaceState` no hay `popstate`; la SPA se sincroniza escuchando este evento. */
export const HUB_WEB_PATH_SYNC_EVENT = 'hub-web-path-sync';

/** @deprecated Usar `HUB_WEB_PATH_SYNC_EVENT`; se mantiene por compat con código que importe el nombre antiguo. */
export const CRM_PATH_CHANGE_EVENT = HUB_WEB_PATH_SYNC_EVENT;

export function replaceStateToRoot(slug: string | null | undefined): void {
  if (typeof window === 'undefined') return;

  const base = getAppBasePath();
  const s = (slug ?? '').trim().toLowerCase();
  const target = !base ? (s ? `/${s}` : '/') : s ? `${base}/${s}` : base;
  if (window.location.pathname === target) return;

  const fullTarget = target + (window.location.search || '') + (window.location.hash || '');
  try {
    window.history.replaceState({}, '', fullTarget);
    window.dispatchEvent(new Event(HUB_WEB_PATH_SYNC_EVENT));
  } catch {
    /* ignore */
  }
}
