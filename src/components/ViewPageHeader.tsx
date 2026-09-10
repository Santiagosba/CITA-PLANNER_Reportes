import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Bell, LayoutGrid, Moon, Search, Server, Sparkles, Sun } from 'lucide-react'
import { OPEN_TASKBAR_EVENT, useTaskbarVisible } from '../lib/apps'
import { headerNoticeItems, searchPeticionesAi } from '../lib/aiHeaderSearch'
import { resolveDateRange } from '../lib/dateRangePresets'
import { formatFecha, isPeticionPendiente, type PeticionPendiente } from '../lib/peticionesPendientes'
import TicketClientBlock from './TicketClientBlock'
import { isSlaCritico } from '../lib/tallerStations'
import { invalidateOperationalData, useOperationalData } from '../hooks/useOperationalData'
import type { DashboardShellRoute } from './Sidebar'
import type { CrmAppRole } from '../lib/crmRoles'
import type { Workshop } from '../types'
import VehiclePlate from './ui/VehiclePlate'

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
            subtitle: 'Tareas de hoy, volumen del taller y trabajo del equipo por periodo.',
          }
    case 'pending-citas':
      return {
        title: 'Triage operativo',
        subtitle: 'Llamadas y tareas del chatbot: cuántas están hechas y cuántas faltan.',
      }
    case 'equipos':
      return appRole === 'asesor'
        ? {
            title: 'Mi equipo',
            subtitle: 'Tus compañeros y el grupo con el que compartes tickets.',
          }
        : {
            title: 'Equipos',
            subtitle: 'Crea equipos de asesores y asígnales tipos de tarea y tableros.',
          }
    case 'asignar-tarea':
      return {
        title: 'Asignar tarea',
        subtitle: 'Elige asesor, tipo y día. La tarea aparece en su bandeja.',
      }
    case 'stats-equipo':
      return {
        title: 'Estadísticas',
        subtitle: 'Trabajo de cada asesor: tareas asignadas y consultas cerradas.',
      }
    case 'gasto-ia':
      return {
        title: 'Gasto de IA',
        subtitle: 'Tokens y coste estimado de OpenAI en este taller.',
      }
    case 'tareas-hoy':
      return {
        title: 'Tareas de hoy',
        subtitle: 'Lo que te toca cerrar hoy.',
      }
    case 'boards':
      return {
        title: 'Gestor de tableros',
        subtitle: 'Elige departamento y mueve las tarjetas según la prioridad del asesor.',
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
  const allRange = resolveDateRange('todas', '', '')
  const { items, loading, refresh } = useOperationalData(workshop, range)
  const [query, setQuery] = useState('')
  const searchRange = query.trim() ? allRange : range
  const { items: searchPool, loading: searchLoading } = useOperationalData(workshop, searchRange)
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

  const hits = useMemo(() => searchPeticionesAi(searchPool, query), [searchPool, query])
  const notices = useMemo(() => headerNoticeItems(items), [items])

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
    <header className="view-page-header">
      <div className="view-page-header-copy">
        <h1 className="section-title">{copy.title}</h1>
        <div className="view-page-header-meta">
          <span className="badge tone-neutral">{workshop.name}</span>
          <button
            type="button"
            className={`badge ${slaCount > 0 ? 'tone-negative' : 'tone-positive'}`}
            onClick={() => onOpenTriage({ slaOnly: slaCount > 0 })}
          >
            {loading ? '…' : slaCount} SLA crítico
          </button>
        </div>
        <p className="section-subtitle mt-1">{copy.subtitle}</p>
      </div>

      <div className="view-page-header-tools">
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
              {searchLoading && hits.length === 0 ? (
                <p className="section-subtitle view-page-popover-empty">Buscando en todas las consultas…</p>
              ) : hits.length === 0 ? (
                <p className="section-subtitle view-page-popover-empty">No hay coincidencias en este taller.</p>
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
                          {hit.item.cita?.matricula ? (
                            <VehiclePlate value={hit.item.cita.matricula} compact />
                          ) : (
                            <span>{hit.item.tipopeticion || 'Sin tipo'}</span>
                          )}
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
            className={`view-page-bell-btn ${noticesOpen ? 'is-open' : ''}`}
            onClick={() => setNoticesOpen((open) => !open)}
            aria-expanded={noticesOpen}
            aria-haspopup="dialog"
            title="Notificaciones"
          >
            <Bell size={18} aria-hidden />
            {notices.length > 0 ? (
              <span className="view-page-bell-dot" aria-hidden />
            ) : null}
            <span className="sr-only">
              {notices.length > 0 ? `${notices.length} avisos` : 'Sin avisos'}
            </span>
          </button>
          {noticesOpen ? (
            <div className="view-page-popover glass glass-lite view-page-notices" role="dialog" aria-label="Notificaciones">
              <div className="view-page-notices-head">
                <strong>Avisos del taller</strong>
                <button type="button" className="ghost-button" onClick={() => setNoticesOpen(false)}>
                  Cerrar
                </button>
              </div>
              {notices.length === 0 ? (
                <p className="section-subtitle view-page-popover-empty">No hay avisos pendientes.</p>
              ) : (
                <ul className="view-page-popover-list custom-scrollbar-light">
                  {notices.map((item) => {
                    const sla = isSlaCritico(item.fechainicio) || isSlaCritico(item.cita?.fecha)
                    return (
                      <li key={item.idpeticion}>
                        <button type="button" className="view-page-popover-row" onClick={() => openHit(item)}>
                          <span className="view-page-popover-row-top">
                            <TicketClientBlock peticion={item} size="sm" />
                            <span className={`badge ${sla ? 'tone-negative' : 'tone-warning'}`}>
                              {sla ? 'SLA crítico' : isPeticionPendiente(item) ? 'Pendiente' : 'Aviso'}
                            </span>
                          </span>
                          <span className="view-page-popover-row-meta">
                            <span>{item.tipopeticion || item.descripcion || 'Sin detalle'}</span>
                            <time>{formatFecha(item.fechainicio)}</time>
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </header>
  )
}
