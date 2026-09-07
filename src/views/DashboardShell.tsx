import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import AppShell from '../components/AppShell'
import ViewPageHeader from '../components/ViewPageHeader'
import GestionBubbleDock, { MAX_TASKS, type AgendaSessionItem } from '../components/GestionBubbleDock'
import SoftphoneDock from '../components/SoftphoneDock'
import AppWindows from '../components/AppWindows'
import { OPEN_TASKBAR_EVENT, apps, setAppZProvider, useTaskbarPinned } from '../lib/apps'
import LeadGestionDrawer, { type WinRect } from '../components/LeadGestionDrawer'
import NewInboundDrawer from '../components/NewInboundDrawer'
import type { ActionStatus } from '../components/ui/ActionButton'
import { type DashboardShellRoute } from '../components/Sidebar'
import SettingsShellView from './SettingsShellView'
import PendingCitasView from './PendingCitasView'
import DashboardGeneralView from './DashboardGeneralView'
import BoardsManagerView from './BoardsManagerView'
import LauraIntelligenceView from './LauraIntelligenceView'
import BotIdentityView from './BotIdentityView'
import { mapSessionUserToCrmUser, type Workshop } from '../types'
import { isGlobalAviAdmin } from '../lib/operationsConnect'
import { getAppProductName } from '../lib/appIdentity'
import { BOT_CONFIG_EVENT, loadActiveBotProfile } from '../lib/botProfiles'
import {
  updatePeticionGestion,
  type PeticionPendiente,
} from '../lib/peticionesPendientes'
import { resolveDateRange } from '../lib/dateRangePresets'
import { callNoteLine, useSoftphone } from '../lib/softphone'
import { useOperationalData } from '../hooks/useOperationalData'

type Props = {
  workshop: Workshop
  sessionUser: unknown
  licenseLogoUrl?: string | null
  onLogout: () => void
  onClearWorkshop: () => void
  isDarkMode: boolean
  onToggleTheme: () => void
}

type GestionSession = {
  id: string
  peticion: PeticionPendiente
  gestionObs: string
  saveStatus: ActionStatus
  minimized: boolean
  maximized: boolean
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
  minimizeRequest: number
  staggerMs: number
  onFocus: (id: string) => void
  onRectChange: (id: string, rect: WinRect) => void
  onObsChange: (id: string, obs: string) => void
  onMarkGestionado: (id: string, gestionado: boolean) => void
  onClose: (id: string) => void
  onMinimize: (id: string) => void
  onToggleMaximize: (id: string) => void
}

const SessionWindow = memo(function SessionWindow({
  session,
  minimizeRequest,
  staggerMs,
  onFocus,
  onRectChange,
  onObsChange,
  onMarkGestionado,
  onClose,
  onMinimize,
  onToggleMaximize,
}: SessionWindowProps) {
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
  const handleMax = useCallback(() => onToggleMaximize(id), [id, onToggleMaximize])

  return (
    <LeadGestionDrawer
      peticion={session.peticion}
      saveStatus={session.saveStatus}
      gestionObs={session.gestionObs}
      rect={session.rect}
      zIndex={session.z}
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
      onToggleMaximize={handleMax}
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
}: Props) {
  const [shellRoute, setShellRoute] = useState<DashboardShellRoute>('pending-citas')
  const asesor = mapSessionUserToCrmUser(sessionUser)
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
  const zRef = useRef(100)
  // La agenda comparte el orden de apilado con las fichas: nace por debajo de la
  // primera ficha y sube al frente cuando se pulsa.
  const [agendaZ, setAgendaZ] = useState(99)
  const canEditHubBranding = isGlobalAviAdmin({ user: sessionUser })

  useEffect(() => {
    const sync = () => setBotName(loadActiveBotProfile().name)
    window.addEventListener(BOT_CONFIG_EVENT, sync)
    return () => window.removeEventListener(BOT_CONFIG_EVENT, sync)
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
    setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, minimized: true, maximized: false } : s)))
  }, [])

  const minimizeAllToSides = useCallback(() => {
    setSideMinWave((n) => n + 1)
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
    setAgendaZ(bumpZ())
  }, [bumpZ])

  const untuckAgenda = useCallback(() => {
    setAgendaTucked(false)
    setAgendaZ(bumpZ())
  }, [bumpZ])

  const tuckAgenda = useCallback(() => {
    setAgendaTucked(true)
  }, [])

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
  const sessionsRef = useRef(sessions)
  const agendaTuckedRef = useRef(agendaTucked)

  useEffect(() => {
    openWindowsRef.current = openWindows
  }, [openWindows])

  useEffect(() => {
    sessionsRef.current = sessions
  }, [sessions])

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

    const tuckDesk = () => {
      const hasWindows = hasOpenWindows()
      const hasAgenda = taskbarPresent() && !agendaTuckedRef.current
      if (!hasWindows && !hasAgenda) return
      if (hasWindows) minimizeAllToSides()
      if (hasAgenda) setAgendaTucked(true)
    }

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return
      const t = e.target as HTMLElement | null
      if (!t) return

      // Escritorio: una ficha o la agenda traen su propia ventana al frente
      // (lo hacen ellas mismas con onFocus); nunca minimizan el resto.
      if (t.closest('.lead-os-window, .call-agenda-root')) return
      if (
        t.closest(
          '.inbound-modal-root, .gestion-capacity-toast, .agenda-peek, .softphone-dock, .softphone-toast, .view-page-search',
        )
      ) {
        return
      }

      // El chip del teléfono abre su app: no toca el escritorio.
      if (t.closest('.softphone-chip')) return

      // Sidebar (Dashboard, triage, etc.): primer clic guarda, segundo restaura
      if (t.closest('.dashboard-sidebar')) {
        if (hasOpenWindows()) tuckDesk()
        else if (hasMinimizedDesk()) restoreDesk()
        return
      }

      // Apartados «importantes»: controles y elementos que abren o navegan
      // (tarjetas kanban, filas, eventos, botones…). Se dejan pasar sin tocar
      // el escritorio. Los contenedores (cabecera, paneles, fondo) no cuentan:
      // pulsar en su superficie libre minimiza todo, como en un escritorio.
      if (
        t.closest(
          [
            'button',
            'a',
            'input',
            'textarea',
            'select',
            'label',
            'summary',
            '[role="button"]',
            '[role="link"]',
            '[role="menuitem"]',
            '[role="tab"]',
            '[role="option"]',
            '[role="checkbox"]',
            '[role="switch"]',
            '[contenteditable]',
            '.ops-feed-row',
            '.report-row-clickable',
            '.prow',
            '.prow-toggle',
            '.triage-view-btn',
            '.fc-event',
            '.calendar-event',
            '.calendar-slot',
            '.calendar-chip',
            '.calendar-schedule',
            '.calendar-month-cell',
            '.calendar-year-day',
            '.calendar-year-month',
            '.elevator-slot.is-clickable',
            '.is-clickable',
            '.kanban-card',
            '.kanban-card-slot',
          ].join(', '),
        )
      ) {
        return
      }

      if (!hasOpenWindows() && hasMinimizedDesk()) {
        restoreDesk()
        return
      }

      tuckDesk()
    }

    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [minimizeAllToSides, restoreDesk])

  const toggleMaximize = useCallback((id: string) => {
    setSessions((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s
        if (s.maximized) {
          return {
            ...s,
            maximized: false,
            rect: s.preMaxRect ?? s.rect,
            preMaxRect: null,
          }
        }
        return {
          ...s,
          maximized: true,
          preMaxRect: s.rect,
        }
      }),
    )
  }, [])

  const updateObs = useCallback((id: string, obs: string) => {
    setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, gestionObs: obs } : s)))
  }, [])

  const updateRect = useCallback((id: string, rect: WinRect) => {
    setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, rect, maximized: false, preMaxRect: null } : s)))
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

      if (id.startsWith('inbound-') || id.startsWith('cita-')) {
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
    [asesor.email, closeSession, sessions],
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
    <AppShell
      workshopName={workshop.name}
      workshopLogoUrl={workshop.logo}
      licenseLogoUrl={licenseLogoUrl}
      productName={getAppProductName()}
      activeRoute={shellRoute}
      onNavigate={(route) => {
        if (route === 'pending-citas') setTriageTab('kanban')
        if (route === 'reportes') setTriageTab('tabla')
        setShellRoute(route)
      }}
      onLogout={onLogout}
      onChangeWorkshop={onClearWorkshop}
      onNewInbound={() => setInboundOpen(true)}
      isDarkMode={isDarkMode}
      onToggleTheme={onToggleTheme}
      asesorName={asesor.displayName}
      asesorRole={asesor.role}
    >
      <ViewPageHeader
        route={shellRoute}
        triageTab={shellRoute === 'reportes' ? 'tabla' : triageTab}
        workshop={workshop}
        botName={botName}
        isDarkMode={isDarkMode}
        onToggleTheme={onToggleTheme}
        onOpenLead={openLead}
        onOpenTriage={(opts) => {
          setTriageSlaOnly(Boolean(opts?.slaOnly))
          setTriageTab('kanban')
          setShellRoute('pending-citas')
        }}
        onSynced={() => setGestionBump((n) => n + 1)}
      />
      {shellRoute === 'dashboard-general' ? (
        <DashboardGeneralView
          workshop={workshop}
          onOpenTriage={() => {
            setTriageTab('kanban')
            setShellRoute('pending-citas')
          }}
          onOpenCalendar={() => {
            setTriageTab('calendario')
            setShellRoute('pending-citas')
          }}
          onOpenLead={openLead}
          refreshToken={gestionBump}
        />
      ) : shellRoute === 'boards' ? (
        <BoardsManagerView workshop={workshop} onOpenLead={openLead} refreshToken={gestionBump} />
      ) : shellRoute === 'laura' ? (
        <LauraIntelligenceView workshopName={workshop.name} />
      ) : shellRoute === 'bot-identity' ? (
        <BotIdentityView />
      ) : shellRoute === 'configuration' ? (
        <div className="dashboard-page">
          <SettingsShellView
            workshop={workshop}
            isDarkMode={isDarkMode}
            showBrandingTab={canEditHubBranding}
          />
        </div>
      ) : (
        <PendingCitasView
          workshop={workshop}
          isDarkMode={isDarkMode}
          initialTab={shellRoute === 'reportes' ? 'tabla' : triageTab}
          initialSlaOnly={triageSlaOnly}
          key={`${shellRoute}-${triageTab}`}
          refreshToken={gestionBump}
          onOpenLead={openLead}
        />
      )}

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
                  minimizeRequest={sideMinWave}
                  staggerMs={index * 45}
                  onFocus={focusSession}
                  onRectChange={updateRect}
                  onObsChange={updateObs}
                  onMarkGestionado={handleMarkGestionado}
                  onClose={closeSession}
                  onMinimize={minimizeSession}
                  onToggleMaximize={toggleMaximize}
                />
              ))}

              <AppWindows minimizeRequest={sideMinWave} staggerOffset={openWindows.length} />

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
    </AppShell>
  )
}
