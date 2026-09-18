import type { DashboardShellRoute } from '../components/Sidebar'

export type ShellTriageTab = 'kanban' | 'tabla' | 'calendario'

export type ShellLocation = {
  route: DashboardShellRoute
  tab: ShellTriageTab
}

const ROUTE_TO_VISTA: Record<DashboardShellRoute, string> = {
  'dashboard-general': 'dashboard',
  boards: 'tableros',
  'pending-citas': 'triage',
  equipos: 'equipos',
  'asignar-tarea': 'asignar',
  contrasenas: 'equipos',
  'tareas-hoy': 'historial',
  'stats-equipo': 'operadores',
  'gasto-ia': 'gasto-ia',
  laura: 'laura',
  'bot-identity': 'bot',
  licencias: 'licencias',
  configuration: 'ajustes',
  reportes: 'informe',
}

const VISTA_TO_ROUTE: Record<string, DashboardShellRoute> = {
  dashboard: 'dashboard-general',
  tableros: 'boards',
  triage: 'pending-citas',
  equipos: 'equipos',
  asignar: 'asignar-tarea',
  historial: 'tareas-hoy',
  operadores: 'stats-equipo',
  'gasto-ia': 'gasto-ia',
  laura: 'laura',
  bot: 'bot-identity',
  licencias: 'licencias',
  ajustes: 'configuration',
  informe: 'reportes',
  'dashboard-general': 'dashboard-general',
  boards: 'boards',
  'pending-citas': 'pending-citas',
  'asignar-tarea': 'asignar-tarea',
  'tareas-hoy': 'tareas-hoy',
  'stats-equipo': 'stats-equipo',
  'bot-identity': 'bot-identity',
  configuration: 'configuration',
  reportes: 'reportes',
}

const TABS = new Set<ShellTriageTab>(['kanban', 'tabla', 'calendario'])

function parseTab(value: string | null): ShellTriageTab | null {
  if (!value) return null
  return TABS.has(value as ShellTriageTab) ? (value as ShellTriageTab) : null
}

export function defaultTabForRoute(route: DashboardShellRoute, tab?: ShellTriageTab | null): ShellTriageTab {
  if (route === 'reportes') return 'tabla'
  if (route === 'pending-citas') return tab && TABS.has(tab) ? tab : 'kanban'
  return tab && TABS.has(tab) ? tab : 'kanban'
}

export function readShellLocation(search = typeof window === 'undefined' ? '' : window.location.search): ShellLocation | null {
  const params = new URLSearchParams(search)
  const raw = (params.get('vista') || params.get('view') || '').trim().toLowerCase()
  if (!raw) return null
  const route = VISTA_TO_ROUTE[raw]
  if (!route) return null
  return {
    route,
    tab: defaultTabForRoute(route, parseTab(params.get('tab'))),
  }
}

function buildHref(route: DashboardShellRoute, tab: ShellTriageTab): string {
  const params = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search)
  params.set('vista', ROUTE_TO_VISTA[route] || route)
  params.delete('view')
  if (route === 'pending-citas' && tab !== 'kanban') params.set('tab', tab)
  else params.delete('tab')
  const query = params.toString()
  const path = typeof window === 'undefined' ? '/' : window.location.pathname
  const hash = typeof window === 'undefined' ? '' : window.location.hash
  return `${path}${query ? `?${query}` : ''}${hash}`
}

function currentHref(): string {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`
}

export function writeShellLocation(location: ShellLocation, mode: 'push' | 'replace'): void {
  if (typeof window === 'undefined') return
  const tab = defaultTabForRoute(location.route, location.tab)
  const next = buildHref(location.route, tab)
  if (next === currentHref()) return
  const state = { ...(window.history.state && typeof window.history.state === 'object' ? window.history.state : {}), aviShell: { route: location.route, tab } }
  if (mode === 'push') window.history.pushState(state, '', next)
  else window.history.replaceState(state, '', next)
}

export function clearShellLocation(mode: 'push' | 'replace' = 'replace'): void {
  if (typeof window === 'undefined') return
  const params = new URLSearchParams(window.location.search)
  if (!params.has('vista') && !params.has('view') && !params.has('tab')) return
  params.delete('vista')
  params.delete('view')
  params.delete('tab')
  const query = params.toString()
  const next = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`
  if (next === currentHref()) return
  if (mode === 'push') window.history.pushState({ ...(window.history.state || {}), aviShell: null }, '', next)
  else window.history.replaceState({ ...(window.history.state || {}), aviShell: null }, '', next)
}

export function hasShellLocation(search = typeof window === 'undefined' ? '' : window.location.search): boolean {
  const params = new URLSearchParams(search)
  return params.has('vista') || params.has('view')
}
