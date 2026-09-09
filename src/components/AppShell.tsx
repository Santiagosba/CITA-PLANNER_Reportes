import {
  BadgeCheck,
  BarChart3,
  CalendarCheck2,
  ClipboardList,
  Columns3,
  LayoutDashboard,
  LogOut,
  Moon,
  PhoneCall,
  Plus,
  RefreshCw,
  Settings,
  Sparkles,
  Sun,
  UserPlus,
  Users,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { DashboardShellRoute } from './Sidebar'
import { SoftphoneStatusChip } from './SoftphoneDock'
import { BOT_CONFIG_EVENT, loadActiveBotProfile } from '../lib/botProfiles'
import type { CrmAppRole } from '../lib/crmRoles'

const ADMIN_NAV: { id: DashboardShellRoute; label: string; icon: LucideIcon }[] = [
  { id: 'dashboard-general', label: 'Dashboard general', icon: LayoutDashboard },
  { id: 'pending-citas', label: 'Triage operativo', icon: ClipboardList },
  { id: 'equipos', label: 'Equipos', icon: Users },
  { id: 'asignar-tarea', label: 'Asignar tarea', icon: UserPlus },
  { id: 'tareas-hoy', label: 'Tareas de hoy', icon: CalendarCheck2 },
  { id: 'stats-equipo', label: 'Estadísticas', icon: BarChart3 },
  { id: 'boards', label: 'Gestor de tableros', icon: Columns3 },
  { id: 'laura', label: 'Asistente de IA Laura', icon: Sparkles },
  { id: 'bot-identity', label: 'Identidad del bot', icon: BadgeCheck },
]

const ASESOR_NAV: { id: DashboardShellRoute; label: string; icon: LucideIcon }[] = [
  { id: 'dashboard-general', label: 'Dashboard general', icon: LayoutDashboard },
  { id: 'pending-citas', label: 'Triage operativo', icon: ClipboardList },
  { id: 'tareas-hoy', label: 'Tareas de hoy', icon: CalendarCheck2 },
  { id: 'equipos', label: 'Mi equipo', icon: Users },
  { id: 'boards', label: 'Gestor de tableros', icon: Columns3 },
  { id: 'laura', label: 'Asistente de IA Laura', icon: Sparkles },
]

/** Pieza extruida: apila capas del mismo vector en Z para darle grosor 3D real. */
function ExtrudedPiece({
  className,
  z = 0,
  layers = 7,
  spacing = 0.8,
  children,
}: {
  className?: string
  z?: number
  layers?: number
  spacing?: number
  children: ReactNode
}) {
  const half = ((layers - 1) * spacing) / 2
  return (
    <span className={`a3d-piece ${className ?? ''}`.trim()} style={{ transform: `translateZ(${z}px)` }}>
      {Array.from({ length: layers }).map((_, i) => (
        <span
          key={i}
          className="a3d-piece-layer"
          style={{
            transform: `translateZ(${(half - i * spacing).toFixed(2)}px)`,
            filter:
              i === 0
                ? 'drop-shadow(0 2px 3px rgba(8, 15, 30, 0.35))'
                : `brightness(${Math.max(0.32, 0.7 - (i / (layers - 1)) * 0.38).toFixed(2)})`,
          }}
        >
          {children}
        </span>
      ))}
    </span>
  )
}

/* Icono oficial AVIBOT (imagen real) que se extruye en capas para el efecto 3D */
const AVIBOT_ICON = <img src="/avibot-logo.png" alt="" draggable={false} />

/** Iniciales del centro para cuando el dealer no tiene logo cargado. */
function dealerInitials(name: string): string {
  const words = name
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
  if (words.length === 0) return 'AV'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

/** Marca del centro del dealer: su logo o, si no hay, las iniciales. */
function DealerMark({ name, logoUrl }: { name: string; logoUrl?: string | null }) {
  const [broken, setBroken] = useState(false)
  const src = (logoUrl ?? '').trim()
  useEffect(() => setBroken(false), [src])
  if (src && !broken) {
    return (
      <span className="dealer-mark has-logo" aria-hidden>
        <img src={src} alt="" draggable={false} referrerPolicy="no-referrer" onError={() => setBroken(true)} />
      </span>
    )
  }
  return (
    <span className="dealer-mark" aria-hidden>
      {dealerInitials(name)}
    </span>
  )
}

type Props = {
  workshopName: string
  /** Logo propio del taller (`licencia_module_talleres.logo`). */
  workshopLogoUrl?: string | null
  /** Logo de la licencia (`crm_config.ui_branding.logo_url`), respaldo del anterior. */
  licenseLogoUrl?: string | null
  productName: string
  activeRoute: DashboardShellRoute
  onNavigate: (route: DashboardShellRoute) => void
  onLogout: () => void
  onChangeWorkshop: () => void
  onNewInbound: () => void
  isDarkMode: boolean
  onToggleTheme: () => void
  asesorName?: string | null
  asesorRole?: string | null
  appRole?: CrmAppRole
  onLocalPreviewRole?: (role: CrmAppRole) => void
  children: ReactNode
}

export default function AppShell({
  workshopName,
  workshopLogoUrl,
  licenseLogoUrl,
  productName,
  activeRoute,
  onNavigate,
  onLogout,
  onChangeWorkshop,
  onNewInbound,
  isDarkMode,
  onToggleTheme,
  asesorName,
  asesorRole,
  appRole = 'asesor',
  onLocalPreviewRole,
  children,
}: Props) {
  const navItems = appRole === 'admin' ? ADMIN_NAV : ASESOR_NAV
  const [botName, setBotName] = useState(() => loadActiveBotProfile().name)
  useEffect(() => {
    const sync = () => setBotName(loadActiveBotProfile().name)
    window.addEventListener(BOT_CONFIG_EVENT, sync)
    return () => window.removeEventListener(BOT_CONFIG_EVENT, sync)
  }, [])

  // El logo 3D de marca sigue el puntero del ratón (rotación suave).
  const cubeRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const cube = cubeRef.current
    if (!cube) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))
    const toDegrees = 180 / Math.PI
    let raf = 0
    let last: MouseEvent | null = null
    let lastRy = 0
    let lastRx = 0
    let rect = cube.getBoundingClientRect()
    const refreshRect = () => {
      rect = cube.getBoundingClientRect()
    }
    // La entrada del sidebar usa transform; al terminar se guarda el centro real.
    const settleTimer = window.setTimeout(refreshRect, 520)
    const flush = () => {
      raf = 0
      const e = last
      if (!e) return
      const cx = rect.left + rect.width / 2
      const cy = rect.top + rect.height / 2
      const dx = e.clientX - cx
      const dy = e.clientY - cy
      // Orientación perspectiva real: el vector logo→puntero define ambos
      // ángulos. No depende de la distancia del logo a los bordes del viewport.
      const ry = clamp(Math.atan2(dx, 180) * toDegrees, -34, 34)
      const rx = clamp(-Math.atan2(dy, 220) * toDegrees, -24, 24)
      if (Math.abs(ry - lastRy) < 0.2 && Math.abs(rx - lastRx) < 0.2) return
      lastRy = ry
      lastRx = rx
      cube.style.setProperty('--cube-ry', `${ry.toFixed(2)}deg`)
      cube.style.setProperty('--cube-rx', `${rx.toFixed(2)}deg`)
    }
    const onMove = (e: MouseEvent) => {
      last = e
      if (!raf) raf = requestAnimationFrame(flush)
    }
    window.addEventListener('mousemove', onMove, { passive: true })
    window.addEventListener('resize', refreshRect)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('resize', refreshRect)
      window.clearTimeout(settleTimer)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <div className={`dashboard-shell app-shell-enter ${isDarkMode ? '' : 'is-light'}`.trim()}>
      <a href="#main-content" className="skip-link">
        Ir al contenido
      </a>

      <aside className="dashboard-sidebar glass glass-lite app-sidebar-enter" aria-label="Navegación principal">
        <div className="dashboard-sidebar-brand">
          <div className="dashboard-sidebar-dealer">
            <DealerMark name={workshopName} logoUrl={workshopLogoUrl || licenseLogoUrl} />
            <div className="dashboard-sidebar-dealer-copy">
              <p className="section-eyebrow">Centro</p>
              <p className="dashboard-sidebar-workshop">{workshopName}</p>
            </div>
          </div>
          {asesorName ? (
            <p className="dashboard-sidebar-asesor">
              <strong>{asesorName}</strong>
              {asesorRole ? <span>{asesorRole}</span> : null}
            </p>
          ) : null}
        </div>

        {appRole === 'admin' ? (
          <div className="px-2">
            <button type="button" className="dashboard-inbound-btn" onClick={onNewInbound}>
              <Plus size={16} strokeWidth={2.5} aria-hidden />
              Nueva tarea / Inbound
              <PhoneCall size={14} aria-hidden />
            </button>
          </div>
        ) : null}

        <nav className="dashboard-nav">
          {navItems.map((item) => {
            const Icon = item.icon
            const active = activeRoute === item.id
            const label = item.id === 'laura' ? `Asistente de IA ${botName}` : item.label
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                title={label}
                className={`dashboard-nav-item ${active ? 'is-active' : ''}`}
                aria-current={active ? 'page' : undefined}
              >
                <Icon size={18} aria-hidden />
                {label}
              </button>
            )
          })}
        </nav>

        <div className="dashboard-sidebar-footer">
          {onLocalPreviewRole ? (
            <div className="local-preview-switch" role="group" aria-label="Ver como en local">
              <p className="section-eyebrow">Ver como (local)</p>
              <div className="local-preview-switch-row">
                <button
                  type="button"
                  className={`ghost-button ${appRole === 'admin' ? 'is-active' : ''}`}
                  onClick={() => onLocalPreviewRole('admin')}
                  aria-pressed={appRole === 'admin'}
                >
                  Admin
                </button>
                <button
                  type="button"
                  className={`ghost-button ${appRole === 'asesor' ? 'is-active' : ''}`}
                  onClick={() => onLocalPreviewRole('asesor')}
                  aria-pressed={appRole === 'asesor'}
                >
                  Asesor
                </button>
              </div>
            </div>
          ) : null}
          <SoftphoneStatusChip />
          <button
            type="button"
            className={`dashboard-nav-item ${activeRoute === 'configuration' ? 'is-active' : ''}`}
            onClick={() => onNavigate('configuration')}
            aria-current={activeRoute === 'configuration' ? 'page' : undefined}
          >
            <Settings size={18} aria-hidden />
            Ajustes
          </button>
          <button
            type="button"
            className="dashboard-nav-item"
            onClick={onToggleTheme}
            aria-pressed={!isDarkMode}
          >
            {isDarkMode ? <Sun size={18} aria-hidden /> : <Moon size={18} aria-hidden />}
            {isDarkMode ? 'Modo claro' : 'Modo oscuro'}
          </button>
          <button type="button" className="dashboard-nav-item" onClick={onChangeWorkshop}>
            <RefreshCw size={18} aria-hidden />
            Cambiar taller
          </button>
          <button type="button" className="dashboard-nav-item dashboard-nav-item-muted" onClick={onLogout}>
            <LogOut size={18} aria-hidden />
            Salir
          </button>

          <div className="dashboard-sidebar-avibot">
            <div className="logo-slot logo-slot-sm">
              <div className="logo-cube" ref={cubeRef} aria-label="AVIBOT">
                <span className="logo-cube-core">
                  <ExtrudedPiece className="a3d-icon" z={0} layers={12} spacing={0.75}>
                    {AVIBOT_ICON}
                  </ExtrudedPiece>
                </span>
                {/* Recubrimiento liquid glass con reflejos RTX sobre el icono */}
                <span className="logo-glass" aria-hidden />
              </div>
            </div>
            <div className="dashboard-sidebar-avibot-copy">
              <p className="section-eyebrow">{productName}</p>
              <span>Powered by AVIBOT</span>
            </div>
          </div>
        </div>
      </aside>

      <main id="main-content" className="dashboard-main">
        {children}
      </main>
    </div>
  )
}
