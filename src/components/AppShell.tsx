import {
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
  Table2,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import type { DashboardShellRoute } from './Sidebar'

const NAV: { id: DashboardShellRoute; label: string; icon: LucideIcon }[] = [
  { id: 'dashboard-general', label: 'Dashboard general', icon: LayoutDashboard },
  { id: 'pending-citas', label: 'Consultas pendientes', icon: ClipboardList },
  { id: 'boards', label: 'Gestor de tableros', icon: Columns3 },
  { id: 'reportes', label: 'Listado completo', icon: Table2 },
  { id: 'laura', label: 'Asistente de IA Laura', icon: Sparkles },
  { id: 'configuration', label: 'Ajustes', icon: Settings },
]

type Props = {
  workshopName: string
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
  children: ReactNode
}

export default function AppShell({
  workshopName,
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
  children,
}: Props) {
  return (
    <div className={`dashboard-shell ${isDarkMode ? '' : 'is-light'}`.trim()}>
      <a href="#main-content" className="skip-link">
        Ir al contenido
      </a>

      <aside className="dashboard-sidebar glass glass-lite" aria-label="Navegación principal">
        <div className="dashboard-sidebar-brand">
          <div className="logo-slot logo-slot-sm">
            {licenseLogoUrl ? (
              <img
                src={licenseLogoUrl}
                alt=""
                width={140}
                height={40}
                className="logo-slot-img"
                referrerPolicy="no-referrer"
              />
            ) : null}
          </div>
          <p className="section-eyebrow">{productName}</p>
          <p className="dashboard-sidebar-workshop">{workshopName}</p>
          {asesorName ? (
            <p className="dashboard-sidebar-asesor">
              <strong>{asesorName}</strong>
              {asesorRole ? <span>{asesorRole}</span> : null}
            </p>
          ) : null}
        </div>

        <div className="px-2">
          <button type="button" className="dashboard-inbound-btn" onClick={onNewInbound}>
            <Plus size={16} strokeWidth={2.5} aria-hidden />
            Nueva tarea / Inbound
            <PhoneCall size={14} aria-hidden />
          </button>
        </div>

        <nav className="dashboard-nav">
          {NAV.map((item) => {
            const Icon = item.icon
            const active = activeRoute === item.id
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                className={`dashboard-nav-item ${active ? 'is-active' : ''}`}
                aria-current={active ? 'page' : undefined}
              >
                <Icon size={18} aria-hidden />
                {item.label}
              </button>
            )
          })}
        </nav>

        <div className="dashboard-sidebar-footer">
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
        </div>
      </aside>

      <main id="main-content" className="dashboard-main">
        {children}
      </main>
    </div>
  )
}
