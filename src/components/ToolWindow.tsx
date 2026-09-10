import type { ReactNode } from 'react'
import { useOsWindow } from '../hooks/useOsWindow'
import type { OsPlacement } from '../lib/osGeometry'
import type { Edge, WinRect } from '../lib/osWindowDrag'
import WindowControls from './os/WindowControls'

type MinimizeStyle = 'dock' | 'side'

type Props = {
  windowId: string
  title: string
  icon?: ReactNode
  meta?: ReactNode
  className?: string
  rect: WinRect
  zIndex: number
  placement?: OsPlacement
  maximized?: boolean
  enterFrom?: 'spawn' | 'restore'
  minimizeRequest?: number
  minimizeStyle?: MinimizeStyle
  staggerMs?: number
  minW?: number
  minH?: number
  onFocus: () => void
  onRectChange: (rect: WinRect) => void
  onClose: () => void
  onMinimize: () => void
  onPlace: (placement: OsPlacement) => void
  children: ReactNode
}

const RESIZE_EDGES: Edge[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']

export default function ToolWindow({
  windowId,
  title,
  icon,
  meta,
  className = '',
  rect,
  zIndex,
  placement,
  maximized = false,
  enterFrom = 'spawn',
  minimizeRequest = 0,
  minimizeStyle = 'dock',
  staggerMs = 0,
  minW = 320,
  minH = 320,
  onFocus,
  onRectChange,
  onClose,
  onMinimize,
  onPlace,
  children,
}: Props) {
  const os = useOsWindow({
    windowId,
    title,
    rect,
    zIndex,
    placement,
    maximized,
    enterFrom,
    minimizeRequest,
    minimizeStyle,
    staggerMs,
    minW,
    minH,
    onFocus,
    onRectChange,
    onClose,
    onMinimize,
    onPlace,
  })

  return (
    <div
      ref={os.rootRef}
      className={`lead-os-window tool-window ${className}${os.tiled ? ' is-maximized' : ''}${os.phaseClass}`}
      style={os.style}
      role="dialog"
      aria-label={title}
      onMouseDown={os.onFocus}
    >
      <div ref={os.frameRef} className="lead-modal lead-os-frame tool-window-frame" onAnimationEnd={os.onFrameAnimEnd}>
        {os.glassDefs}
        <header
          className="lead-os-titlebar tool-window-titlebar"
          onPointerDown={os.startMove}
          onDoubleClick={() => os.requestPlace(os.placement === 'fill' ? 'free' : 'fill')}
        >
          <WindowControls
            placement={os.placement}
            onClose={os.requestClose}
            onMinimize={() => os.requestMinimize('dock')}
            onPlace={os.requestPlace}
          />
          <div className="tool-window-title">
            {icon ? <span className="tool-window-icon" aria-hidden>{icon}</span> : null}
            <strong>{title}</strong>
          </div>
          {meta ? <div className="tool-window-meta">{meta}</div> : null}
        </header>
        <div className="tool-window-body custom-scrollbar-light">{children}</div>
      </div>

      {RESIZE_EDGES.map((edge) => (
        <span
          key={edge}
          className={`os-resize-handle edge-${edge}`}
          onPointerDown={os.startResize(edge)}
          onDoubleClick={(e) => {
            e.stopPropagation()
            os.expandEdge(edge)
          }}
        />
      ))}
    </div>
  )
}
