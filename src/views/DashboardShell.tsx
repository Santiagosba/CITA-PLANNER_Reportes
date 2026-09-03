import { useState } from 'react'
import { Building2 } from 'lucide-react'
import Header from '../components/Header'
import Sidebar, { type DashboardShellRoute } from '../components/Sidebar'
import SettingsShellView from './SettingsShellView'
import PendingCitasView from './PendingCitasView'
import type { CrmUser, Workshop } from '../types'
import { mapSessionUserToCrmUser } from '../types'
import { isGlobalAviAdmin } from '../lib/operationsConnect'

type Props = {
  workshop: Workshop
  sessionUser: unknown
  licenseLogoUrl?: string | null
  sidebarOpen: boolean
  setSidebarOpen: (v: boolean) => void
  searchQuery: string
  setSearchQuery: (q: string) => void
  isDarkMode: boolean
  toggleTheme: () => void
  onLogout: () => void
  onClearWorkshop: () => void
}

/** Post-login: header + sidebar CRM; pestaña Panel vacía + Configuración = cromado `SettingsShellView`. */
export default function DashboardShell({
  workshop,
  sessionUser,
  licenseLogoUrl,
  sidebarOpen,
  setSidebarOpen,
  searchQuery,
  setSearchQuery,
  isDarkMode,
  toggleTheme,
  onLogout,
  onClearWorkshop,
}: Props) {
  const crmUser: CrmUser = mapSessionUserToCrmUser(sessionUser)
  const [shellRoute, setShellRoute] = useState<DashboardShellRoute>('pending-citas')

  const canEditHubBranding = isGlobalAviAdmin({ user: sessionUser })

  return (
    <div
      className={`flex h-screen flex-col overflow-hidden font-sans transition-colors duration-300 ${
        isDarkMode ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'
      }`}
    >
      <Header
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        isDarkMode={isDarkMode}
        toggleTheme={toggleTheme}
        onAboutClick={() => {}}
        onSearchEnter={() => {}}
        workshop={workshop}
      />
      <div className="relative flex flex-1 overflow-hidden">
        {sidebarOpen && (
          <div className="fixed inset-0 z-20 bg-black/40 md:hidden" onClick={() => setSidebarOpen(false)} aria-hidden />
        )}
        <Sidebar
          workshop={workshop}
          user={crmUser}
          onLogout={onLogout}
          sidebarOpen={sidebarOpen}
          setSidebarOpen={setSidebarOpen}
          licenseLogoUrl={licenseLogoUrl}
          activeRoute={shellRoute}
          onNavigate={setShellRoute}
        />
        <main
          className={`relative z-10 flex flex-1 flex-col overflow-hidden transition-colors duration-300 ${
            isDarkMode ? 'bg-slate-950' : 'bg-slate-50'
          }`}
        >
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-3 sm:p-4 md:p-6">
            <div className="mb-3 flex shrink-0 items-center gap-2 text-xs text-slate-500 md:mb-4 dark:text-slate-400">
              <button
                type="button"
                onClick={onClearWorkshop}
                className="group flex cursor-pointer items-center gap-2 rounded-lg p-1.5 transition-all hover:bg-slate-100 dark:hover:bg-slate-800"
                title="Cambiar taller"
              >
                <div className="rounded bg-teal-50 p-1 dark:bg-teal-900/20">
                  <Building2 size={16} className="text-teal-500" />
                </div>
                <span className="text-[11px] sm:text-xs">
                  Estás gestionando:{' '}
                  <strong className="text-slate-700 transition-colors group-hover:text-teal-600 dark:text-slate-200 dark:group-hover:text-teal-400">
                    {workshop.name}
                  </strong>
                </span>
              </button>
            </div>

            {shellRoute === 'configuration' ? (
              <div className="min-h-0 flex-1">
                <SettingsShellView workshop={workshop} isDarkMode={isDarkMode} showBrandingTab={canEditHubBranding} />
              </div>
            ) : (
              <PendingCitasView
                workshop={workshop}
                isDarkMode={isDarkMode}
                searchQuery={searchQuery}
                initialTab={shellRoute === 'reportes' ? 'reporte' : 'bandeja'}
                key={shellRoute}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
