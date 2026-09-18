import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Bell, LayoutGrid, Moon, Search, Server, Sparkles, Sun } from 'lucide-react'
import { OPEN_TASKBAR_EVENT, useTaskbarVisible } from '../lib/apps'
import { headerNoticeItems, searchPeticionesAi } from '../lib/aiHeaderSearch'
import { loadReadNoticeIds, mergeReadNoticeIds } from '../lib/headerNoticeReads'
import { useNoticeHistory } from '../lib/headerNoticeHistory'
import { resolveDateRange } from '../lib/dateRangePresets'
import { formatFecha, type PeticionPendiente } from '../lib/peticionesPendientes'
import TicketClientBlock from './TicketClientBlock'
import { isSlaCritico } from '../lib/tallerStations'
import { invalidateOperationalData, useOperationalData } from '../hooks/useOperationalData'
import type { DashboardShellRoute } from './Sidebar'
import type { CrmAppRole } from '../lib/crmRoles'
import type { Workshop } from '../types'
import TicketPlate from './TicketPlate'
import NoticeCountBadge from './NoticeCountBadge'
import NoticeCenter from './NoticeCenter'

type TriageTab = 'kanban' | 'tabla' | 'calendario'

type Props = {
  route: DashboardShellRoute
  triageTab?: TriageTab
  workshop: Workshop
  botName: string
  appRole?: CrmAppRole
  isDarkMode: boolean
  onToggleTheme: () => void
  onOpenLead: (peticion: PeticionPendiente) => void
  onOpenTriage: (opts?: { slaOnly?: boolean }) => void
  onSynced: () => void
}

function pageCopy(
  route: DashboardShellRoute,
  triageTab: TriageTab | undefined,
  botName: string,
  appRole: CrmAppRole | undefined,
) {
  if (route === 'pending-citas' && triageTab === 'calendario') {
    return {
      title: 'Calendario',
      subtitle: 'Agenda del taller por día, semana, mes o año.',
    }
  }
  if (route === 'reportes' || (route === 'pending-citas' && triageTab === 'tabla')) {
    return {
      title: 'Listado de consultas',
      subtitle: 'Todas las consultas del periodo seleccionado.',
    }
  }
  switch (route) {
    case 'dashboard-general':
      return appRole === 'asesor'
        ? {
            title: 'Dashboard',
            subtitle: 'Tus tareas de hoy y el volumen de consultas del día, la semana, el mes o el año.',
          }
        : {
            title: 'Dashboard',
            subtitle: 'Consultas, volumen del taller y trabajo del equipo por periodo.',
          }
    case 'pending-citas':
      return {
        title: 'Triage operativo',
        subtitle: 'Llamadas y tareas del chatbot: cuántas están hechas y cuántas faltan.',
      }
    case 'equipos':
    case 'contrasenas':
      return appRole === 'asesor'
        ? {
            title: 'Mi equipo',
            subtitle: 'Pulsa un grupo para ver a tus compañeros. Aquí no se cambia nada.',
          }
        : {
            title: 'Cuentas y equipos',
            subtitle: 'Suelta cada tarjeta en el equipo que le toque.',
          }
    case 'asignar-tarea':
      return {
        title: 'Asignar tarea',
        subtitle: 'A quién, qué hay que hacer y para qué día.',
      }
    case 'stats-equipo':
      return {
        title: 'Operadores',
        subtitle: 'Foto, datos, tickets y rendimiento de cada persona.',
      }
    case 'licencias':
      return {
        title: 'Grupos y licencias',
        subtitle: 'Primero las personas. Dentro, los grupos, licencias y centros que tienen activos.',
      }
    case 'gasto-ia':
      return {
        title: 'Gasto de IA',
        subtitle: 'Tokens de OpenAI. El teléfono Telnyx está en Laura → Costes.',
      }
    case 'tareas-hoy':
      return {
        title: 'Historial',
        subtitle: 'Consultas del periodo que elijas: día, semana, mes o año.',
      }
    case 'boards':
      return {
        title: 'Gestor de tableros',
        subtitle:
          appRole === 'asesor'
            ? 'Tu trabajo de hoy, por tipo de consulta.'
            : 'El trabajo de hoy del taller, por tipo de consulta.',
      }
    case 'laura':
      return {
        title: `Asistente de IA ${botName}`,
        subtitle: 'Monitor de telemetría conversacional, precisión de diagnosis y derivación a taller.',
      }
    case 'bot-identity':
      return {
        title: 'Identidad del asistente de voz',
        subtitle: 'Elige quién atiende las llamadas y personaliza nombre, saludo y foto.',
      }
    case 'configuration':
      return {
        title: 'Ajustes',
        subtitle: 'Gestiona los parámetros generales de la plataforma.',
      }
    default:
      return {
        title: 'Control operativo',
        subtitle: 'Visión ejecutiva de llamadas, derivaciones a taller y estado de boxes',
      }
  }
}

export default function ViewPageHeader({
  route,
  triageTab,
  workshop,
  botName,
  appRole,
  isDarkMode,
  onToggleTheme,
  onOpenLead,
  onOpenTriage,
  onSynced,
}: Props) {
  const range = resolveDateRange('mes', '', '')
  const { items, loading, refresh, refreshLive } = useOperationalData(workshop, range)
  const [query, setQuery] = useState('')
  const copy = pageCopy(route, triageTab, botName, appRole)

  const slaItems = useMemo(
    () =>
      items.filter(
        (item) =>
          !item.gestionado && (isSlaCritico(item.fechainicio) || isSlaCritico(item.cita?.fecha)),
      ),
    [items],
  )
  const slaCount = slaItems.length

  const [searchOpen, setSearchOpen] = useState(false)
  const [noticesOpen, setNoticesOpen] = useState(false)
  const taskbarVisible = useTaskbarVisible()
  const [syncing, setSyncing] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)
  const noticesRef = useRef<HTMLDivElement>(null)

  const hits = useMemo(() => searchPeticionesAi(items, query), [items, query])
  const notices = useMemo(() => headerNoticeItems(items), [items])
  const liveNoticeIds = useMemo(() => notices.map((item) => item.idpeticion), [notices])
  const workshopNoticeKey = workshop.containerIdTaller || workshop.id
  const { entries: noticeHistory, statusOf, setStatus } = useNoticeHistory(workshop, notices)
  const [readIds, setReadIds] = useState(() => loadReadNoticeIds(workshop))
  const unreadNotices = useMemo(
    () => notices.filter((item) => statusOf(item.idpeticion) === 'inbox' && !readIds.has(item.idpeticion)),
    [notices, readIds, statusOf],
  )
  const noticeCount = unreadNotices.length
  const [bellRing, setBellRing] = useState(false)
  const lastNoticeCount = useRef<number | null>(null)

  useEffect(() => {
    setReadIds(loadReadNoticeIds(workshop))
  }, [workshopNoticeKey])

  const markNoticesRead = (ids: string[]) => {
    setStatus(ids, 'read')
    setReadIds((current) => mergeReadNoticeIds(workshop, current, ids, liveNoticeIds))
  }

  const deleteNotices = (ids: string[]) => {
    setStatus(ids, 'deleted')
    setReadIds((current) => mergeReadNoticeIds(workshop, current, ids, liveNoticeIds))
  }

  useEffect(() => {
    const pull = () => {
      if (document.visibilityState === 'visible') void refreshLive()
    }
    const id = window.setInterval(pull, 20_000)
    document.addEventListener('visibilitychange', pull)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', pull)
    }
  }, [refreshLive])

  useEffect(() => {
    if (loading && lastNoticeCount.current == null) return
    if (lastNoticeCount.current == null) {
      lastNoticeCount.current = noticeCount
      return
    }
    if (noticeCount <= lastNoticeCount.current) {
      lastNoticeCount.current = noticeCount
      return
    }
    lastNoticeCount.current = noticeCount
    setBellRing(true)
    const calm = window.setTimeout(() => setBellRing(false), 800)
    return () => window.clearTimeout(calm)
  }, [loading, noticeCount])

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node
      if (!searchRef.current?.contains(t)) setSearchOpen(false)
      if (!noticesRef.current?.contains(t)) setNoticesOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSearchOpen(false)
        setNoticesOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [])

  const openHit = (item: PeticionPendiente) => {
    markNoticesRead([item.idpeticion])
    setSearchOpen(false)
    setNoticesOpen(false)
    setQuery('')
    onOpenLead(item)
  }

  const submitSearch = (e: FormEvent) => {
    e.preventDefault()
    setSearchOpen(true)
    if (hits[0]) openHit(hits[0].item)
  }

  const syncDms = async () => {
    setSyncing(true)
    invalidateOperationalData(workshop)
    await refresh()
    onSynced()
    setSyncing(false)
  }

  return (
    <header className="view-page-header flex flex-wrap items-start justify-between gap-4 px-5 pb-1 pt-[18px]">
      <div className="min-w-[min(100%,280px)] flex-[1_1_320px]">
        <h1 className="section-title">{copy.title}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {workshop.groupName ? <span className="badge tone-neutral">{workshop.groupName}</span> : null}
          <span className="badge tone-neutral">{workshop.name}</span>
          {workshop.centerName ? <span className="badge tone-neutral">{workshop.centerName}</span> : null}
          <button
            type="button"
            className={`badge cursor-pointer border-0 ${slaCount > 0 ? 'tone-negative' : 'tone-positive'}`}
            onClick={() => onOpenTriage({ slaOnly: slaCount > 0 })}
          >
            {loading ? '…' : slaCount} SLA crítico
          </button>
        </div>
        <p className="section-subtitle mt-1">{copy.subtitle}</p>
      </div>

      <div className="flex flex-[1_1_340px] flex-wrap items-center justify-end gap-2.5">
        <div className="view-page-search" ref={searchRef}>
          <form className="view-page-search-field" onSubmit={submitSearch}>
            <label className="sr-only" htmlFor="avi-ai-search">
              Buscar con IA
            </label>
            <Search size={18} className="view-page-search-icon" aria-hidden />
            <input
              id="avi-ai-search"
              className="view-page-search-input"
              type="search"
              value={query}
              placeholder="Buscar cliente, teléfono, matrícula o avería…"
              onChange={(e) => {
                setQuery(e.target.value)
                setSearchOpen(true)
              }}
              onFocus={() => setSearchOpen(true)}
              autoComplete="off"
            />
            <Sparkles size={16} className="view-page-search-ai" aria-hidden />
          </form>
          {searchOpen && query.trim() ? (
            <div className="view-page-popover glass glass-lite" role="listbox" aria-label="Resultados de Laura">
              <p className="view-page-popover-hint">
                <Sparkles size={14} aria-hidden />
                Laura interpreta «{query.trim()}»
              </p>
              {loading && hits.length === 0 ? (
                <p className="section-subtitle view-page-popover-empty">Buscando en las consultas de este mes…</p>
              ) : hits.length === 0 ? (
                <p className="section-subtitle view-page-popover-empty">No hay coincidencias en las consultas de este mes.</p>
              ) : (
                <ul className="view-page-popover-list custom-scrollbar-light">
                  {hits.map((hit) => (
                    <li key={hit.item.idpeticion}>
                      <button type="button" className="view-page-popover-row" onClick={() => openHit(hit.item)}>
                        <span className="view-page-popover-row-top">
                          <TicketClientBlock peticion={hit.item} size="sm" />
                          <span className="badge tone-muted">{hit.reason}</span>
                        </span>
                        <span className="view-page-popover-row-meta">
                          <TicketPlate peticion={hit.item} />
                          <span>{hit.item.tipopeticion || 'Sin tipo'}</span>
                          <time>{formatFecha(hit.item.fechainicio)}</time>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </div>

        <button type="button" className="ghost-button" onClick={() => void syncDms()} disabled={syncing || loading}>
          <Server size={16} className={syncing ? 'animate-spin' : ''} aria-hidden />
          Sync DMS
        </button>

        <button
          type="button"
          className="ghost-button"
          onClick={onToggleTheme}
          aria-pressed={isDarkMode}
        >
          {isDarkMode ? <Sun size={16} aria-hidden /> : <Moon size={16} aria-hidden />}
          {isDarkMode ? 'Claro' : 'Oscuro'}
        </button>

        <button
          type="button"
          className={`view-page-bell-btn view-page-taskbar-btn${taskbarVisible ? ' is-open' : ''}`}
          onClick={() => window.dispatchEvent(new CustomEvent(OPEN_TASKBAR_EVENT))}
          title={taskbarVisible ? 'Minimizar barra de tareas' : 'Abrir barra de tareas'}
          aria-label={taskbarVisible ? 'Minimizar barra de tareas' : 'Abrir barra de tareas'}
          aria-pressed={taskbarVisible}
        >
          <LayoutGrid size={18} aria-hidden />
        </button>

        <div className="view-page-bell" ref={noticesRef}>
          <button
            type="button"
            className={`view-page-bell-btn transition-[color,border-color,transform,box-shadow] duration-200 hover:scale-105 active:scale-95 ${
              noticesOpen ? 'is-open' : ''
            }`}
            onClick={() => setNoticesOpen((open) => !open)}
            aria-expanded={noticesOpen}
            aria-haspopup="dialog"
            title="Notificaciones"
          >
            <Bell
              size={18}
              aria-hidden
              className={bellRing ? 'animate-notice-bell' : ''}
            />
            <NoticeCountBadge count={noticeCount} ready={!loading || noticeCount > 0} />
            <span className="sr-only" aria-live="polite">
              {noticeCount > 0 ? `${noticeCount} avisos` : 'Sin avisos'}
            </span>
          </button>
          {noticesOpen ? (
            <NoticeCenter
              inbox={unreadNotices}
              history={noticeHistory}
              tickets={items}
              loading={loading}
              onClose={() => setNoticesOpen(false)}
              onOpen={openHit}
              onRead={markNoticesRead}
              onDelete={deleteNotices}
            />
          ) : null}
        </div>
      </div>
    </header>
  )
}
