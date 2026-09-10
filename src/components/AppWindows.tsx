import { memo, useEffect } from 'react'
import { BookOpen, Contact, Phone, StickyNote } from 'lucide-react'
import ToolWindow from './ToolWindow'
import SoftphonePad from './SoftphonePad'
import QuickNotes from './QuickNotes'
import ContactsApp from './ContactsApp'
import GuideApp from './GuideApp'
import { APP_META, apps, useApps, type AppId, type AppWindow } from '../lib/apps'
import { useSoftphone } from '../lib/softphone'

/** Icono de cada app (ventana, tiles de la barra, dock). */
export function AppIcon({ id, size = 14 }: { id: AppId; size?: number }) {
  if (id === 'phone') return <Phone size={size} />
  if (id === 'notes') return <StickyNote size={size} />
  if (id === 'contacts') return <Contact size={size} />
  return <BookOpen size={size} />
}

function AppContent({ id, roomy }: { id: AppId; roomy?: boolean }) {
  if (id === 'phone') return <SoftphonePad roomy={roomy} />
  if (id === 'notes') return <QuickNotes />
  if (id === 'contacts') return <ContactsApp />
  return <GuideApp />
}

function PhoneMeta() {
  const { status, callerId, call } = useSoftphone()
  if (call) {
    return (
      <span className="badge tone-positive">
        <span className="softphone-chip-dot" aria-hidden />
        En llamada
      </span>
    )
  }
  if (status === 'ready') return <span className="font-mono">{callerId ?? 'Listo'}</span>
  if (status === 'connecting') return <span>Conectando…</span>
  if (status === 'error') return <span className="badge tone-negative">Sin conexión</span>
  return null
}

const AppWindowItem = memo(function AppWindowItem({
  win,
  minimizeRequest,
  staggerMs,
}: {
  win: AppWindow
  minimizeRequest: number
  staggerMs: number
}) {
  const meta = APP_META[win.id]
  return (
    <ToolWindow
      windowId={`app:${win.id}`}
      className={`app-${win.id}`}
      title={meta.label}
      icon={<AppIcon id={win.id} />}
      meta={win.id === 'phone' ? <PhoneMeta /> : null}
      rect={win.rect}
      zIndex={win.z}
      placement={win.placement}
      maximized={win.maximized}
      enterFrom={win.enterFrom}
      minimizeRequest={minimizeRequest + win.minimizeRequest}
      minimizeStyle="side"
      staggerMs={staggerMs}
      minW={meta.minW}
      minH={meta.minH}
      onFocus={() => apps.focus(win.id)}
      onRectChange={(rect) => apps.setRect(win.id, rect)}
      onClose={() => apps.close(win.id)}
      onMinimize={() => apps.minimize(win.id)}
      onPlace={(placement) => apps.place(win.id, placement)}
    >
      <AppContent id={win.id} roomy={win.maximized || win.placement === 'fill'} />
    </ToolWindow>
  )
})

type Props = {
  /** Misma «ola» de minimizado que las fichas (clic en el fondo). */
  minimizeRequest: number
  /** Nº de fichas abiertas, para escalonar la animación tras ellas. */
  staggerOffset: number
}

/** Ventanas de apps abiertas (teléfono, notas). Las minimizadas viven en la barra de tareas. */
export default function AppWindows({ minimizeRequest, staggerOffset }: Props) {
  const windows = useApps()
  useEffect(() => {
    const onResize = () => apps.fitToViewport()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return (
    <>
      {windows
        .filter((w) => !w.minimized)
        .map((w, i) => (
          <AppWindowItem key={w.id} win={w} minimizeRequest={minimizeRequest} staggerMs={(staggerOffset + i) * 45} />
        ))}
    </>
  )
}
