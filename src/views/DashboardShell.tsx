import { useState } from 'react'
import AppShell from '../components/AppShell'
import { type DashboardShellRoute } from '../components/Sidebar'
import SettingsShellView from './SettingsShellView'
import PendingCitasView from './PendingCitasView'
import DashboardGeneralView from './DashboardGeneralView'
import BoardsManagerView from './BoardsManagerView'
import type { Workshop } from '../types'
import { isGlobalAviAdmin } from '../lib/operationsConnect'
import { getAppProductName } from '../lib/appIdentity'

type Props = {
  workshop: Workshop
  sessionUser: unknown
  licenseLogoUrl?: string | null
  onLogout: () => void
  onClearWorkshop: () => void
  isDarkMode: boolean
  onToggleTheme: () => void
}

export default function DashboardShell({
  workshop,
  sessionUser,
  licenseLogoUrl,
  onLogout,
  onClearWorkshop,
  isDarkMode,
  onToggleTheme,
}: Props) {
  const [shellRoute, setShellRoute] = useState<DashboardShellRoute>('dashboard-general')
  const [triageTab, setTriageTab] = useState<'kanban' | 'tabla' | 'calendario'>('kanban')
  const canEditHubBranding = isGlobalAviAdmin({ user: sessionUser })

  return (
    <AppShell
      workshopName={workshop.name}
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
      isDarkMode={isDarkMode}
      onToggleTheme={onToggleTheme}
    >
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
        />
      ) : shellRoute === 'boards' ? (
        <BoardsManagerView workshop={workshop} />
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
          key={`${shellRoute}-${triageTab}`}
        />
      )}
    </AppShell>
  )
}
