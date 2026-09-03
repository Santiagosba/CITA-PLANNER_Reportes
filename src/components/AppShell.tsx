import { ClipboardList, LogOut, RefreshCw, Settings, Table2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import type { DashboardShellRoute } from './Sidebar'

const NAV: { id: DashboardShellRoute; label: string; icon: LucideIcon }[] = [
  { id: 'pending-citas', label: 'Cola de citas', icon: ClipboardList },
  { id: 'reportes', label: 'Listado', icon: Table2 },
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
  children,
}: Props) {
  return (
    <div className="dashboard-shell">
      <a href="#main-content" className="skip-link">
        Ir al contenido
      </a>

      <aside className="dashboard-sidebar glass" aria-label="Navegación principal">
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
                <Icon size={20} aria-hidden />
                {item.label}
              </button>
            )
          })}
        </nav>

        <div className="dashboard-sidebar-footer">
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