import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import AppShell from '../components/AppShell'
import ViewPageHeader from '../components/ViewPageHeader'
import GestionBubbleDock, { MAX_TASKS, type AgendaSessionItem } from '../components/GestionBubbleDock'
import SoftphoneDock from '../components/SoftphoneDock'
import AppWindows from '../components/AppWindows'
import { OPEN_TASKBAR_EVENT, APP_META, apps, setAppZProvider, useActiveAppId, useTaskbarPinned } from '../lib/apps'
import LeadGestionDrawer, { type WinRect } from '../components/LeadGestionDrawer'
import WindowSnapGuides from '../components/os/WindowSnapGuides'
import WindowSwitcher from '../components/os/WindowSwitcher'
import { resolvePlacement, type OsPlacement } from '../lib/osGeometry'
import NewInboundDrawer from '../components/NewInboundDrawer'
import type { ActionStatus } from '../components/ui/ActionButton'
import { type DashboardShellRoute } from '../components/Sidebar'
import SettingsShellView from './SettingsShellView'
import PendingCitasView from './PendingCitasView'
import DashboardGeneralView from './DashboardGeneralView'
import BoardsManagerView from './BoardsManagerView'
import LauraIntelligenceView from './LauraIntelligenceView'
import BotIdentityView from './BotIdentityView'
import TeamsManagerView from './TeamsManagerView'
import AssignTaskView from './AssignTaskView'
import EmployeeStatsView from './EmployeeStatsView'
import TodayTasksView from './TodayTasksView'
import { mapSessionUserToCrmUser, type Workshop } from '../types'
import { isGlobalAviAdmin } from '../lib/operationsConnect'
import {
  bindCrmAppRole,
  canSeeTelnyxCosts,
  crmAppRoleLabel,
  defaultRouteForRole,
  resolveCrmAppRole,
  routeAllowedForRole,
  type CrmAppRole,
} from '../lib/crmRoles'
import { getAppProductName } from '../lib/appIdentity'
import { BOT_CONFIG_EVENT, loadActiveBotProfile } from '../lib/botProfiles'
import {
  updatePeticionGestion,
  type PeticionPendiente,
} from '../lib/peticionesPendientes'
import { resolveDateRange } from '../lib/dateRangePresets'
import { callNoteLine, useSoftphone } from '../lib/softphone'
import { useOperationalData } from '../hooks/useOperationalData'
import { useAdvisorWorkspace } from '../hooks/useAdvisorWorkspace'
import { isDemoTicketId } from '../lib/demoTickets'
import { applyPeticionPatch, PETICIONES_PATCHED_EVENT } from '../lib/ticketOps'
import { isIdleDeskClick } from '../lib/osDeskClick'
import { ticketClientLabel } from '../lib/ticketClient'

type Props = {
  workshop: Workshop
  sessionUser: unknown
  licenseLogoUrl?: string | null
  onLogout: () => void
  onClearWorkshop: () => void
  isDarkMode: boolean
  onToggleTheme: () => void
  onLocalPreviewRole?: (role: CrmAppRole) => void
}

type GestionSession = {
  id: string
  peticion: PeticionPendiente
  gestionObs: string
  saveStatus: ActionStatus
  minimized: boolean
  maximized: boolean
  placement: OsPlacement
  rect: WinRect
  preMaxRect: WinRect | null
  z: number
  enterFrom: 'spawn' | 'restore'
}

function defaultRect(index: number): WinRect {
  const margin = 20
  const topGap = 56
  // Ventana algo más estrecha para que quepan varias columnas ordenadas
  const w = Math.min(680, Math.max(400, Math.round(window.innerWidth * 0.4)))
  const h = Math.min(760, Math.round(window.innerHeight * 0.78))

  // Cascada diagonal: cada ficha se desplaza un poco respecto a la anterior
  // para que su barra de título (con la X de cerrar) quede siempre accesible.
  const stepX = 34
  const stepY = 38
  const usableH = Math.max(stepY, window.innerHeight - h - topGap - margin)
  const perColumn = Math.max(1, Math.floor(usableH / stepY) + 1)
  const col = Math.floor(index / perColumn)
  const row = index % perColumn

  // Cada nueva columna arranca desplazada a la derecha para no solaparse
  const columnShift = Math.min(Math.round(w * 0.55), 320)
  const baseX = margin + col * columnShift
  const x = Math.min(
    Math.max(margin, window.innerWidth - w - margin),
    baseX + row * stepX,
  )
  const y = Math.min(
    Math.max(topGap, window.innerHeight - h - margin),
    topGap + row * stepY,
  )
  return { x: Math.max(margin, x), y, w, h }
}

type SessionWindowProps = {
  session: GestionSession
  workshop: Workshop
  currentUser: { name: string; email: string }
  appRole: CrmAppRole
  minimizeRequest: number
  staggerMs: number
  onFocus: (id: string) => void
  onRectChange: (id: string, rect: WinRect) => void
  onObsChange: (id: string, obs: string) => void
  onMarkGestionado: (id: string, gestionado: boolean) => void
  onClose: (id: string) => void
  onMinimize: (id: string) => void
  onPlace: (id: string, placement: OsPlacement) => void
}

const SessionWindow = memo(function SessionWindow({
  session,
  workshop,
  currentUser,
  appRole,
  minimizeRequest,
  staggerMs,
  onFocus,
  onRectChange,
  onObsChange,
  onMarkGestionado,
  onClose,
  onMinimize,
  onPlace,
}: SessionWindowProps) {
  const workshopId = workshop.containerIdTaller || workshop.id
  const { workspace } = useAdvisorWorkspace(workshopId, currentUser, true)
  const id = session.id
  const handleFocus = useCallback(() => onFocus(id), [id, onFocus])
  const handleRect = useCallback((rect: WinRect) => onRectChange(id, rect), [id, onRectChange])
  const handleObs = useCallback((obs: string) => onObsChange(id, obs), [id, onObsChange])
  const handleMark = useCallback(
    (gestionado: boolean) => onMarkGestionado(id, gestionado),
    [id, onMarkGestionado],
  )
  const handleClose = useCallback(() => onClose(id), [id, onClose])
  const handleMinimize = useCallback(() => onMinimize(id), [id, onMinimize])
  const handlePlace = useCallback((placement: OsPlacement) => onPlace(id, placement), [id, onPlace])

  return (
    <LeadGestionDrawer
      peticion={session.peticion}
      saveStatus={session.saveStatus}
      gestionObs={session.gestionObs}
      rect={session.rect}
      zIndex={session.z}
      placement={session.placement}
      maximized={session.maximized}
      enterFrom={session.enterFrom}
      minimizeRequest={minimizeRequest}
      minimizeStyle="side"
      staggerMs={staggerMs}
      onFocus={handleFocus}
      onRectChange={handleRect}
      onGestionObsChange={handleObs}
      onMarkGestionado={handleMark}
      onClose={handleClose}
      onMinimize={handleMinimize}
      onPlace={handlePlace}
      workshop={workshop}
      workspace={workspace}
      currentUser={currentUser}
      appRole={appRole}
    />
  )
})

export default function DashboardShell({
  workshop,
  sessionUser,
  licenseLogoUrl,
  onLogout,
  onClearWorkshop,
  isDarkMode,
  onToggleTheme,
  onLocalPreviewRole,
}: Props) {
  const appRole = resolveCrmAppRole(sessionUser)
  const [shellRoute, setShellRoute] = useState<DashboardShellRoute>(() => defaultRouteForRole(appRole))
  const asesor = mapSessionUserToCrmUser(sessionUser)
  const currentUser = { name: asesor.displayName, email: asesor.email }
  const [triageTab, setTriageTab] = useState<'kanban' | 'tabla' | 'calendario'>('kanban')
  const [sessions, setSessions] = useState<GestionSession[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [inboundOpen, setInboundOpen] = useState(false)
  const [gestionBump, setGestionBump] = useState(0)
  const [triageSlaOnly, setTriageSlaOnly] = useState(false)
  const [botName, setBotName] = useState(() => loadActiveBotProfile().name)
  const [capacityNotice, setCapacityNotice] = useState<string | null>(null)
  const [agendaTucked, setAgendaTucked] = useState(false)
  const [sideMinWave, setSideMinWave] = useState(0)
  const [switcher, setSwitcher] = useState<{
    items: { id: string; kind: 'ficha' | 'app'; title: string }[]
    index: number
  } | null>(null)
  const switcherRef = useRef(switcher)
  const activeAppId = useActiveAppId()
  const zRef = useRef(100)
  // La agenda comparte el orden de apilado con las fichas: nace por debajo de la
  // primera ficha y sube al frente cuando se pulsa.
  const [agendaZ, setAgendaZ] = useState(99)
  const canEditHubBranding = isGlobalAviAdmin({ user: sessionUser })
  bindCrmAppRole(appRole)
  const showCallCosts = canSeeTelnyxCosts(appRole)

  useEffect(() => {
    bindCrmAppRole(appRole)
    return () => bindCrmAppRole(null)
  }, [appRole])

  useEffect(() => {
    if (!routeAllowedForRole(shellRoute, appRole)) {
      setShellRoute(defaultRouteForRole(appRole))
    }
  }, [appRole, shellRoute])

  useEffect(() => {
    const sync = () => setBotName(loadActiveBotProfile().name)
    window.addEventListener(BOT_CONFIG_EVENT, sync)
    return () => window.removeEventListener(BOT_CONFIG_EVENT, sync)
  }, [])

  useEffect(() => {
    const onPatch = (event: Event) => {
      const detail = (event as CustomEvent<{ idpeticion?: string; patch?: Partial<PeticionPendiente> }>).detail
      if (!detail?.idpeticion || !detail.patch) return
      setSessions((prev) =>
        prev.map((session) =>
          session.id === detail.idpeticion
            ? { ...session, peticion: { ...session.peticion, ...detail.patch } }
            : session,
        ),
      )
    }
    window.addEventListener(PETICIONES_PATCHED_EVENT, onPatch)
    return () => window.removeEventListener(PETICIONES_PATCHED_EVENT, onPatch)
  }, [])

  const bumpZ = useCallback(() => {
    zRef.current += 1
    return zRef.current
  }, [])

  // Las apps (teléfono, notas) se apilan con las fichas y la barra.
  useEffect(() => {
    setAppZProvider(bumpZ)
  }, [bumpZ])

  const openLead = useCallback(
    (peticion: PeticionPendiente) => {
      apps.blurActive()
      setInboundOpen(false)
      setCapacityNotice(null)
      setAgendaTucked(false)
      setSessions((prev) => {
        const existing = prev.find((s) => s.id === peticion.idpeticion)
        if (existing) {
          const z = bumpZ()
          setActiveId(existing.id)
          return prev.map((s) =>
            s.id === existing.id
              ? {
                  ...s,
                  peticion,
                  minimized: false,
                  z,
                  enterFrom: s.minimized ? 'restore' : s.enterFrom,
                }
              : s,
          )
        }
        if (prev.length >= MAX_TASKS) {
          setCapacityNotice(`Máximo ${MAX_TASKS} tareas en agenda. Cierra alguna para abrir otra.`)
          return prev
        }
        const z = bumpZ()
        const id = peticion.idpeticion
        setActiveId(id)
        const next: GestionSession = {
          id,
          peticion,
          gestionObs: peticion.gestionobservaciones ?? '',
          saveStatus: 'idle',
          minimized: false,
          maximized: false,
          placement: 'free',
          rect: defaultRect(prev.length),
          preMaxRect: null,
          z,
          enterFrom: 'spawn',
        }
        return [...prev, next]
      })
    },
    [bumpZ],
  )

  const focusSession = useCallback(
    (id: string) => {
      apps.blurActive()
      setAgendaTucked(false)
      setActiveId(id)
      const z = bumpZ()
      setSessions((prev) =>
        prev.map((s) =>
          s.id === id
            ? {
                ...s,
                z,
                minimized: false,
                enterFrom: s.minimized ? 'restore' : s.enterFrom,
              }
            : s,
        ),
      )
    },
    [bumpZ],
  )

  const closeSession = useCallback((id: string) => {
    setSessions((prev) => prev.filter((s) => s.id !== id))
    setActiveId((cur) => (cur === id ? null : cur))
    setCapacityNotice(null)
  }, [])

  const closeAll = useCallback(() => {
    setSessions([])
    setActiveId(null)
    setCapacityNotice(null)
    setAgendaTucked(false)
  }, [])

  const minimizeSession = useCallback((id: string) => {
    setSessions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, minimized: true, maximized: false, placement: 'free' } : s)),
    )
  }, [])

  const minimizeAllToSides = useCallback(() => {
    setSideMinWave((n) => n + 1)
  }, [])

  const sessionsRef = useRef(sessions)
  useEffect(() => {
    sessionsRef.current = sessions
  }, [sessions])

  /** Recoge fichas y apps abiertas al cambiar de panel. No crea ni abre la barra si no había ventanas. */
  const hideDeskWindows = useCallback(() => {
    const openSessions = sessionsRef.current.some((session) => !session.minimized)
    const openApps = apps.getState().windows.some((win) => !win.minimized)
    if (!openSessions && !openApps) return
    if (openApps) apps.pinTaskbar()
    setSideMinWave((n) => n + 1)
    setActiveId(null)
  }, [])

  const restoreDesk = useCallback(() => {
    setAgendaTucked(false)
    apps.restoreAll()
    setSessions((prev) => {
      const hidden = prev.filter((s) => s.minimized)
      if (hidden.length === 0) return prev
      let z = zRef.current
      const next = prev.map((s) => {
        if (!s.minimized) return s
        z += 1
        return { ...s, minimized: false, enterFrom: 'restore' as const, z }
      })
      zRef.current = z
      setActiveId(hidden[hidden.length - 1]?.id ?? null)
      return next
    })
  }, [])

  const focusAgenda = useCallback(() => {
    apps.blurActive()
    setAgendaZ(bumpZ())
  }, [bumpZ])

  const untuckAgenda = useCallback(() => {
    apps.blurActive()
    setAgendaTucked(false)
    setAgendaZ(bumpZ())
  }, [bumpZ])

  const tuckAgenda = useCallback(() => {
    apps.blurActive()
    setAgendaZ(bumpZ())
    setAgendaTucked(true)
  }, [bumpZ])

  // Botón de la cabecera (junto a la campana): alterna la barra. Si está
  // desplegada la recoge; si está recogida o no existe, la fija y la trae al frente.
  const taskbarPinned = useTaskbarPinned()
  const taskbarPresent = sessions.length > 0 || taskbarPinned
  const taskbarVisible = taskbarPresent && !agendaTucked
  useEffect(() => {
    apps.setTaskbarVisible(taskbarVisible)
  }, [taskbarVisible])
  const taskbarVisibleRef = useRef(taskbarVisible)
  useEffect(() => {
    taskbarVisibleRef.current = taskbarVisible
  }, [taskbarVisible])

  useEffect(() => {
    const toggle = () => {
      if (taskbarVisibleRef.current) {
        tuckAgenda()
        return
      }
      apps.pinTaskbar()
      untuckAgenda()
    }
    window.addEventListener(OPEN_TASKBAR_EVENT, toggle)
    return () => window.removeEventListener(OPEN_TASKBAR_EVENT, toggle)
  }, [tuckAgenda, untuckAgenda])

  const openWindows = useMemo(() => sessions.filter((s) => !s.minimized), [sessions])
  const openWindowsRef = useRef(openWindows)
  const agendaTuckedRef = useRef(agendaTucked)

  useEffect(() => {
    openWindowsRef.current = openWindows
  }, [openWindows])

  useEffect(() => {
    agendaTuckedRef.current = agendaTucked
  }, [agendaTucked])

  // Al colgar una llamada hecha desde una petición, dejamos constancia en sus
  // notas de gestión (y abrimos la ficha si no estaba abierta) para que el
  // asesor solo tenga que completar y guardar.
  const { lastCall } = useSoftphone()
  const callNoteRange = useMemo(() => resolveDateRange('mes', '', ''), [])
  const { items: operationalItems } = useOperationalData(workshop, callNoteRange)
  const notedCallRef = useRef(0)
  useEffect(() => {
    if (!lastCall?.peticionId || lastCall.endedAt === notedCallRef.current) return
    notedCallRef.current = lastCall.endedAt
    const pid = lastCall.peticionId
    const line = callNoteLine(lastCall)
    const open = sessionsRef.current.some((s) => s.id === pid)
    if (!open) {
      const peticion = operationalItems.find((item) => item.idpeticion === pid)
      if (!peticion) return
      openLead(peticion)
    }
    setSessions((prev) =>
      prev.map((s) => {
        if (s.id !== pid) return s
        const current = s.gestionObs.trimEnd()
        if (current.includes(line)) return s
        return { ...s, gestionObs: current ? `${current}\n${line}` : line }
      }),
    )
  }, [lastCall, operationalItems, openLead])

  useEffect(() => {
    const appWindows = () => apps.getState().windows
    const openAppCount = () => appWindows().filter((w) => !w.minimized).length
    const hasOpenWindows = () => openWindowsRef.current.length > 0 || openAppCount() > 0

    const taskbarPresent = () => sessionsRef.current.length > 0 || apps.getState().taskbarPinned

    const hasMinimizedDesk = () => {
      const sessions = sessionsRef.current
      return (
        sessions.some((s) => s.minimized) ||
        appWindows().some((w) => w.minimized) ||
        (taskbarPresent() && agendaTuckedRef.current)
      )
    }

    const taskbarShowing = () => taskbarPresent() && !agendaTuckedRef.current

    const tuckDesk = () => {
      const windowsOut = hasOpenWindows()
      const barOut = taskbarShowing()
      if (!windowsOut && !barOut) return
      if (windowsOut) {
        apps.pinTaskbar()
        minimizeAllToSides()
      } else if (barOut) {
        apps.pinTaskbar()
      }
      if (barOut) tuckAgenda()
    }

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return
      // Fondo, cabecera o hueco sin otra acción. Un ticket, filtro o botón no.
      if (!isIdleDeskClick(e)) return

      if (hasOpenWindows() || taskbarShowing()) {
        tuckDesk()
        return
      }

      if (hasMinimizedDesk()) restoreDesk()
    }

    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [minimizeAllToSides, restoreDesk, tuckAgenda])

  const activeIdRef = useRef(activeId)
  const activeAppIdRef = useRef(activeAppId)
  useEffect(() => {
    activeIdRef.current = activeId
  }, [activeId])
  useEffect(() => {
    activeAppIdRef.current = activeAppId
  }, [activeAppId])
  useEffect(() => {
    switcherRef.current = switcher
  }, [switcher])

  useEffect(() => {
    const typing = (target: EventTarget | null) =>
      Boolean((target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable="true"]'))

    const openItems = () => {
      const fichas = sessionsRef.current
        .filter((s) => !s.minimized)
        .map((s) => ({ id: s.id, kind: 'ficha' as const, title: ticketClientLabel(s.peticion) }))
      const tools = apps
        .getState()
        .windows.filter((w) => !w.minimized)
        .map((w) => ({ id: w.id, kind: 'app' as const, title: APP_META[w.id].label }))
      return [...fichas, ...tools]
    }

    const focusedKey = () => {
      if (activeAppIdRef.current) return `app:${activeAppIdRef.current}`
      if (activeIdRef.current) return `ficha:${activeIdRef.current}`
      return null
    }

    const applySwitcher = (items: { id: string; kind: 'ficha' | 'app' }[], index: number) => {
      const item = items[index]
      if (!item) return
      if (item.kind === 'app') apps.focus(item.id as 'phone' | 'notes' | 'contacts' | 'guide')
      else focusSession(item.id)
    }

    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (!mod) return

      if (e.key === 'Tab') {
        const items = openItems()
        if (items.length < 2) return
        e.preventDefault()
        const current = switcherRef.current
        const list = current?.items ?? items
        const from = current
          ? current.index
          : list.findIndex((item) => `${item.kind}:${item.id}` === focusedKey())
        const next = (Math.max(0, from) + (e.shiftKey ? -1 : 1) + list.length) % list.length
        setSwitcher({ items: list, index: next })
        return
      }

      if (typing(e.target)) return
      if (e.key === 'w' || e.key === 'W') {
        e.preventDefault()
        if (e.altKey) {
          const items = openItems()
          const key = focusedKey()
          const focused = items.find((item) => `${item.kind}:${item.id}` === key)
          if (focused?.kind === 'app') {
            for (const win of apps.getState().windows) apps.close(win.id)
          } else {
            closeAll()
          }
          return
        }
        if (activeAppIdRef.current) {
          apps.close(activeAppIdRef.current)
          return
        }
        if (activeIdRef.current) closeSession(activeIdRef.current)
        return
      }
      if (e.key === 'm' || e.key === 'M') {
        e.preventDefault()
        if (activeAppIdRef.current) {
          apps.minimize(activeAppIdRef.current)
          return
        }
        if (activeIdRef.current) minimizeSession(activeIdRef.current)
        return
      }
    }

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key !== 'Control' && e.key !== 'Meta') return
      const current = switcherRef.current
      if (!current) return
      applySwitcher(current.items, current.index)
      setSwitcher(null)
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [closeAll, closeSession, focusSession, minimizeSession])

  const placeSession = useCallback((id: string, placement: OsPlacement) => {
    setSessions((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s
        const current = resolvePlacement(s.placement, s.maximized)
        if (placement === 'free' || current === placement) {
          return {
            ...s,
            placement: 'free',
            maximized: false,
            rect: s.preMaxRect ?? s.rect,
            preMaxRect: null,
          }
        }
        return {
          ...s,
          placement,
          maximized: placement === 'fill',
          preMaxRect: current === 'free' ? s.rect : (s.preMaxRect ?? s.rect),
        }
      }),
    )
  }, [])

  const updateObs = useCallback((id: string, obs: string) => {
    setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, gestionObs: obs } : s)))
  }, [])

  const updateRect = useCallback((id: string, rect: WinRect) => {
    setSessions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, rect, maximized: false, placement: 'free', preMaxRect: null } : s)),
    )
  }, [])

  const handleMarkGestionado = useCallback(
    async (id: string, gestionado: boolean) => {
      const session = sessions.find((s) => s.id === id)
      if (!session) return

      const applyLocal = () => {
        setSessions((prev) =>
          prev.map((s) =>
            s.id === id
              ? {
                  ...s,
                  saveStatus: 'success' as const,
                  peticion: {
                    ...s.peticion,
                    gestionado,
                    gestionobservaciones: s.gestionObs.trim() || null,
                  },
                }
              : s,
          ),
        )
        window.setTimeout(() => {
          setSessions((prev) =>
            prev.map((s) => (s.id === id ? { ...s, saveStatus: 'idle' as const } : s)),
          )
          if (gestionado) closeSession(id)
        }, 800)
      }

      if (id.startsWith('inbound-') || id.startsWith('cita-') || isDemoTicketId(id)) {
        if (isDemoTicketId(id)) {
          void applyPeticionPatch(workshop, session.peticion, {
            gestionado,
            gestionobservaciones: session.gestionObs.trim() || undefined,
            gestionemail: session.peticion.gestionemail || asesor.email || '',
          })
        }
        applyLocal()
        return
      }

      setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, saveStatus: 'loading' } : s)))
      try {
        await updatePeticionGestion(id, {
          gestionado,
          gestionobservaciones: session.gestionObs.trim() || undefined,
          gestionemail: asesor.email || session.peticion.gestionemail || undefined,
        })
        setGestionBump((n) => n + 1)
        applyLocal()
      } catch {
        setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, saveStatus: 'idle' } : s)))
      }
    },
    [asesor.email, closeSession, sessions, workshop],
  )

  const goToSection = useCallback(
    (route: DashboardShellRoute) => {
      hideDeskWindows()
      if (route === 'pending-citas') setTriageTab('kanban')
      if (route === 'reportes') setTriageTab('tabla')
      setShellRoute(route)
    },
    [hideDeskWindows],
  )

  const agendaSessions = useMemo<AgendaSessionItem[]>(
    () =>
      sessions.map((s) => ({
        id: s.id,
        peticion: s.peticion,
        minimized: s.minimized,
        active: s.id === activeId,
      })),
    [sessions, activeId],
  )

  return (
    <>
    <AppShell
      workshopName={workshop.name}
      workshopLogoUrl={workshop.logo}
      licenseLogoUrl={licenseLogoUrl}
      productName={getAppProductName()}
      activeRoute={shellRoute}
      onNavigate={goToSection}
      onLogout={onLogout}
      onChangeWorkshop={onClearWorkshop}
      onNewInbound={() => setInboundOpen(true)}
      isDarkMode={isDarkMode}
      onToggleTheme={onToggleTheme}
      asesorName={asesor.displayName}
      asesorRole={crmAppRoleLabel(appRole)}
      appRole={appRole}
      onLocalPreviewRole={onLocalPreviewRole}
    >
      <ViewPageHeader
        route={shellRoute}
        triageTab={shellRoute === 'reportes' ? 'tabla' : triageTab}
        workshop={workshop}
        botName={botName}
        appRole={appRole}
        isDarkMode={isDarkMode}
        onToggleTheme={onToggleTheme}
        onOpenLead={openLead}
        onOpenTriage={(opts) => {
          hideDeskWindows()
          setTriageSlaOnly(Boolean(opts?.slaOnly))
          setTriageTab('kanban')
          setShellRoute('pending-citas')
        }}
        onSynced={() => setGestionBump((n) => n + 1)}
      />
      <div key={shellRoute} className="app-view-enter">
      {shellRoute === 'dashboard-general' ? (
        <DashboardGeneralView
          workshop={workshop}
          currentUser={currentUser}
          appRole={appRole}
          onOpenTriage={() => {
            hideDeskWindows()
            setTriageTab('kanban')
            setShellRoute('pending-citas')
          }}
          onOpenCalendar={() => {
            hideDeskWindows()
            setTriageTab('calendario')
            setShellRoute('pending-citas')
          }}
          onOpenTodayTasks={() => {
            hideDeskWindows()
            setShellRoute('tareas-hoy')
          }}
          onOpenLead={openLead}
          refreshToken={gestionBump}
        />
      ) : shellRoute === 'equipos' ? (
        <TeamsManagerView
          workshop={workshop}
          currentUser={currentUser}
          readOnly={appRole === 'asesor'}
        />
      ) : shellRoute === 'asignar-tarea' ? (
        <AssignTaskView workshop={workshop} currentUser={currentUser} />
      ) : shellRoute === 'stats-equipo' ? (
        <EmployeeStatsView workshop={workshop} currentUser={currentUser} />
      ) : shellRoute === 'tareas-hoy' ? (
        <TodayTasksView workshop={workshop} currentUser={currentUser} appRole={appRole} onOpenLead={openLead} />
      ) : shellRoute === 'boards' ? (
        <BoardsManagerView
          workshop={workshop}
          currentUser={currentUser}
          appRole={appRole}
          onOpenLead={openLead}
          refreshToken={gestionBump}
        />
      ) : shellRoute === 'laura' ? (
        <LauraIntelligenceView workshopName={workshop.name} showCallCosts={showCallCosts} />
      ) : shellRoute === 'bot-identity' ? (
        <BotIdentityView />
      ) : shellRoute === 'configuration' ? (
        <div className="dashboard-page">
          <SettingsShellView
            workshop={workshop}
            isDarkMode={isDarkMode}
            showBrandingTab={canEditHubBranding}
            showTeamTab={appRole === 'admin'}
          />
        </div>
      ) : (
        <PendingCitasView
          workshop={workshop}
          currentUser={currentUser}
          isDarkMode={isDarkMode}
          initialTab={shellRoute === 'reportes' ? 'tabla' : triageTab}
          initialSlaOnly={triageSlaOnly}
          key={`${shellRoute}-${triageTab}`}
          refreshToken={gestionBump}
          onOpenLead={openLead}
          appRole={appRole}
        />
      )}
      </div>
    </AppShell>

      {typeof document !== 'undefined'
        ? createPortal(
            <div className={`os-desk-layer dashboard-shell${isDarkMode ? '' : ' is-light'}`}>
              {capacityNotice ? (
                <div className="gestion-capacity-toast" role="status">
                  {capacityNotice}
                  <button type="button" className="ghost-button" onClick={() => setCapacityNotice(null)}>
                    Entendido
                  </button>
                </div>
              ) : null}

              {openWindows.map((session, index) => (
                <SessionWindow
                  key={session.id}
                  session={session}
                  workshop={workshop}
                  currentUser={currentUser}
                  appRole={appRole}
                  minimizeRequest={sideMinWave}
                  staggerMs={index * 45}
                  onFocus={focusSession}
                  onRectChange={updateRect}
                  onObsChange={updateObs}
                  onMarkGestionado={handleMarkGestionado}
                  onClose={closeSession}
                  onMinimize={minimizeSession}
                  onPlace={placeSession}
                />
              ))}

              <AppWindows minimizeRequest={sideMinWave} staggerOffset={openWindows.length} />
              <WindowSnapGuides />
              {switcher ? <WindowSwitcher items={switcher.items} index={switcher.index} /> : null}

              <GestionBubbleDock
                sessions={agendaSessions}
                tucked={agendaTucked}
                zIndex={agendaZ}
                onFocus={focusAgenda}
                onUntuck={untuckAgenda}
                onTuck={tuckAgenda}
                onOpen={focusSession}
                onMinimize={minimizeSession}
                onClose={closeSession}
                onCloseAll={closeAll}
              />

              <SoftphoneDock />

              {inboundOpen ? (
                <NewInboundDrawer
                  workshopName={workshop.name}
                  onClose={() => setInboundOpen(false)}
                  onSubmit={(payload) => {
                    const now = new Date().toISOString()
                    const draft: PeticionPendiente = {
                      idpeticion: `inbound-${Date.now()}`,
                      idtaller: String(workshop.originalId || workshop.containerIdTaller || ''),
                      descripcion: payload.descripcion,
                      idtipopeticion: null,
                      tipopeticion: payload.canal === 'voz' ? 'Voz Laura' : 'WhatsApp',
                      fechainicio: now,
                      fechafin: null,
                      fechacreacion: now,
                      caller: payload.caller,
                      gestionado: false,
                      gestionemail: null,
                      gestionfecha: null,
                      gestionobservaciones: `Inbound manual · ${payload.cliente || 'Sin nombre'}`,
                      idcita: null,
                      cita: payload.matricula
                        ? {
                            idcita: `draft-${Date.now()}`,
                            fecha: null,
                            nombre: payload.cliente || null,
                            apellidos: null,
                            matricula: payload.matricula,
                            marca: null,
                            modelo: payload.modelo || null,
                            email: null,
                            telefono: payload.caller,
                            movil: payload.caller,
                            asunto: payload.descripcion,
                          }
                        : null,
                    }
                    setInboundOpen(false)
                    openLead(draft)
                  }}
                />
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
