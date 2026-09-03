import { useState } from 'react'
import AppShell from '../components/AppShell'
import { type DashboardShellRoute } from '../components/Sidebar'
import SettingsShellView from './SettingsShellView'
import PendingCitasView from './PendingCitasView'
import type { Workshop } from '../types'
import { isGlobalAviAdmin } from '../lib/operationsConnect'
import { getAppProductName } from '../lib/appIdentity'

type Props = {
  workshop: Workshop
  sessionUser: unknown
  licenseLogoUrl?: string | null
  onLogout: () => void
  onClearWorkshop: () => void
}

export default function DashboardShell({
  workshop,
  sessionUser,
  licenseLogoUrl,
  onLogout,
  onClearWorkshop,
}: Props) {
  const [shellRoute, setShellRoute] = useState<DashboardShellRoute>('pending-citas')
  const canEditHubBranding = isGlobalAviAdmin({ user: sessionUser })

  return (
    <AppShell
      workshopName={workshop.name}
      licenseLogoUrl={licenseLogoUrl}
      productName={getAppProductName()}
      activeRoute={shellRoute}
      onNavigate={setShellRoute}
      onLogout={onLogout}
      onChangeWorkshop={onClearWorkshop}
    >
      {shellRoute === 'configuration' ? (
        <div className="dashboard-page">
          <SettingsShellView workshop={workshop} isDarkMode={false} showBrandingTab={canEditHubBranding} />
        </div>
      ) : (
        <PendingCitasView
          workshop={workshop}
          isDarkMode={false}
          initialTab={shellRoute === 'reportes' ? 'reporte' : 'bandeja'}
          key={shellRoute}
        />
      )}
    </AppShell>
  )
}
