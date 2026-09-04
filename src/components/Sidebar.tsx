import React from 'react'
import { CalendarClock, FileBarChart, Settings, LogOut } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { CrmUser, Workshop } from '../types'
import { getAppProductName } from '../lib/appIdentity'

export type DashboardShellRoute =
  | 'dashboard-general'
  | 'pending-citas'
  | 'boards'
  | 'reportes'
  | 'configuration'

type Props = {
  workshop: Workshop
  user: CrmUser
  onLogout: () => void
  sidebarOpen: boolean
  setSidebarOpen?: (open: boolean) => void
  licenseLogoUrl?: string | null
  activeRoute: DashboardShellRoute
  onNavigate: (route: DashboardShellRoute) => void
}

function SidebarItem({
  icon: Icon,
  label,
  active,
  onClick,
  collapsed,
}: {
  icon: LucideIcon
  label: string
  active: boolean
  onClick: () => void
  collapsed: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={collapsed ? label : undefined}
      className={`group relative mb-1 flex h-11 w-full items-center rounded-lg transition-all duration-200 ${
        collapsed ? 'justify-center px-0' : 'justify-start px-2'
      } ${
        active
          ? 'bg-teal-500 text-white shadow-lg shadow-teal-900/20'
          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white'
      }`}
    >
      <div className={`flex items-center justify-center ${collapsed ? 'w-full' : 'w-8'}`}>
        <Icon size={20} className={active ? 'text-white' : 'currentColor'} strokeWidth={active ? 2.5 : 2} />
      </div>
      {!collapsed && (
        <span
          className={`ml-3 overflow-hidden text-[15px] font-medium whitespace-nowrap transition-opacity duration-200 ${active ? 'text-white' : ''}`}
        >
          {label}
        </span>
      )}
      {collapsed && (
        <div className="pointer-events-none absolute left-full z-50 ml-3 rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium whitespace-nowrap text-white opacity-0 shadow-xl transition-opacity group-hover:opacity-100">
          {label}
        </div>
      )}
    </button>
  )
}

export default function Sidebar({
  workshop,
  user,
  onLogout,
  sidebarOpen,
  setSidebarOpen,
  licenseLogoUrl = null,
  activeRoute,
  onNavigate,
}: Props) {
  const productName = getAppProductName()
  const email = user.email || ''
  const displayName = user.displayName || email
  const role = user.role || 'usuario'
  const initials = email ? email.substring(0, 2).toUpperCase() : 'US'
  const collapsed = !sidebarOpen

  const afterNavClick = () => {
    if (typeof window.matchMedia !== 'undefined' && !window.matchMedia('(min-width:768px)').matches && setSidebarOpen) {
      setSidebarOpen(false)
    }
  }

  return (
    <aside
      className={`${sidebarOpen ? 'w-64' : 'w-20'} z-30 flex flex-col border-r border-slate-200 bg-white transition-all duration-300 dark:border-slate-800 dark:bg-slate-900 ${
        sidebarOpen ? 'fixed inset-y-0 left-0 top-14 md:relative md:inset-auto md:top-0 md:h-full' : 'hidden md:flex md:relative md:h-full'
      }`}
    >
      {/* Logo — misma posición CRM: zona superior del sidebar sobre el ítem Panel (solo con barra expandida). */}
      <div
        className={`flex shrink-0 items-center justify-center overflow-hidden transition-all duration-300 ${
          sidebarOpen ? 'min-h-0 px-4 py-5' : 'h-0 p-0 opacity-0'
        }`}
      >
        {sidebarOpen && licenseLogoUrl ? (
          <img
            src={licenseLogoUrl}
            alt=""
            className="max-h-32 w-full object-contain drop-shadow-sm transition-all duration-300"
            referrerPolicy="no-referrer"
          />
        ) : null}
      </div>

      <div
        className={`custom-scrollbar-light flex flex-1 flex-col gap-4 overflow-y-auto overflow-x-hidden px-3 pt-2 pb-6 transition-all duration-300 ${
          sidebarOpen ? '-mt-2' : 'mt-12'
        }`}
      >
        <SidebarItem
          icon={CalendarClock}
          label="Citas pendientes"
          active={activeRoute === 'pending-citas'}
          collapsed={collapsed}
          onClick={() => {
            onNavigate('pending-citas')
            afterNavClick()
          }}
        />

        <SidebarItem
          icon={FileBarChart}
          label="Reportes"
          active={activeRoute === 'reportes'}
          collapsed={collapsed}
          onClick={() => {
            onNavigate('reportes')
            afterNavClick()
          }}
        />

        <div className="mx-2 h-px bg-slate-200 dark:bg-slate-800" />

        <SidebarItem
          icon={Settings}
          label="Configuración"
          active={activeRoute === 'configuration'}
          collapsed={collapsed}
          onClick={() => {
            onNavigate('configuration')
            afterNavClick()
          }}
        />
      </div>

      <div className="mt-auto border-t border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className={`flex items-center overflow-hidden transition-all duration-300 ${!sidebarOpen ? 'justify-center' : 'justify-between'}`}>
          <div className="flex min-w-0 items-center gap-3">
            <div className="relative shrink-0">
              <div className="flex h-9 w-9 items-center justify-center rounded-full border border-teal-400 bg-teal-600 text-sm font-bold text-white uppercase">
                {initials}
              </div>
              <div className="absolute right-0 bottom-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500 dark:border-slate-900" />
            </div>
            {sidebarOpen && (
              <div className="min-w-0 flex flex-col">
                <span className="truncate text-sm font-semibold text-slate-800 dark:text-white" title={displayName}>
                  {displayName}
                </span>
                <span className="truncate text-xs text-slate-500 capitalize dark:text-slate-400">{role}</span>
                <span className="mt-0.5 truncate text-[10px] font-semibold uppercase tracking-wide text-teal-600 dark:text-teal-400">
                  {productName}
                </span>
                <span className="truncate text-[10px] text-slate-400 dark:text-slate-500">{workshop.name}</span>
              </div>
            )}
          </div>
          {sidebarOpen && (
            <button
              type="button"
              onClick={onLogout}
              className="rounded p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-rose-600 dark:hover:bg-slate-800 dark:hover:text-rose-400"
              title="Cerrar sesión"
            >
              <LogOut size={16} />
            </button>
          )}
        </div>

        {!sidebarOpen && (
          <div className="flex justify-center pt-2">
            <button
              type="button"
              onClick={onLogout}
              className="rounded p-2 text-slate-400 transition-colors hover:text-rose-600 dark:hover:text-rose-400"
              title="Cerrar sesión"
            >
              <LogOut size={18} />
            </button>
          </div>
        )}

        {sidebarOpen && (
          <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-[10px] text-slate-400 dark:border-slate-800">
            <span className="font-medium tracking-wide uppercase">Plantilla</span>
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
          </div>
        )}
      </div>
    </aside>
  )
}
