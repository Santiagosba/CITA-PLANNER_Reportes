import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { OsPlacement } from '../../lib/osGeometry'

type Props = {
  placement: OsPlacement
  closeLabel?: string
  minimizeLabel?: string
  disabled?: boolean
  onClose: () => void
  onMinimize: () => void
  onPlace: (placement: OsPlacement) => void
}

const TILES: Array<{ id: Exclude<OsPlacement, 'free'>; label: string; group: 'fill' | 'move' }> = [
  { id: 'fill', label: 'Rellenar', group: 'fill' },
  { id: 'left', label: 'Mitad izquierda', group: 'move' },
  { id: 'right', label: 'Mitad derecha', group: 'move' },
  { id: 'top', label: 'Mitad superior', group: 'move' },
  { id: 'bottom', label: 'Mitad inferior', group: 'move' },
]

/**
 * Semáforo macOS: rojo cierra, amarillo minimiza, verde rellena.
 * Al pasar por el verde salen Rellenar y las mitades; Alt+clic restaura.
 */
export default function WindowControls({
  placement,
  closeLabel = 'Cerrar',
  minimizeLabel = 'Minimizar',
  disabled = false,
  onClose,
  onMinimize,
  onPlace,
}: Props) {
  const zoomRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [menu, setMenu] = useState<{ left: number; top: number } | null>(null)
  const hideTimer = useRef(0)
  const showTimer = useRef(0)

  const clearTimers = () => {
    window.clearTimeout(hideTimer.current)
    window.clearTimeout(showTimer.current)
  }

  const placeMenu = () => {
    const btn = zoomRef.current
    if (!btn) return
    const box = btn.getBoundingClientRect()
    setMenu({ left: Math.max(8, box.left - 8), top: box.bottom + 8 })
  }

  const scheduleShow = () => {
    if (disabled) return
    clearTimers()
    showTimer.current = window.setTimeout(placeMenu, 180)
  }

  const scheduleHide = () => {
    clearTimers()
    hideTimer.current = window.setTimeout(() => setMenu(null), 160)
  }

  useEffect(() => () => clearTimers(), [])

  useEffect(() => {
    if (!menu) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenu(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menu])

  const zoomLabel = placement === 'fill' ? 'Restaurar' : 'Rellenar'

  return (
    <div className="lead-window-controls" role="toolbar" aria-label="Controles de ventana">
      <button
        type="button"
        className="lead-traffic close"
        title={closeLabel}
        aria-label={closeLabel}
        disabled={disabled}
        onClick={onClose}
      />
      <button
        type="button"
        className="lead-traffic minimize"
        title={minimizeLabel}
        aria-label={minimizeLabel}
        disabled={disabled}
        onClick={onMinimize}
      />
      <button
        ref={zoomRef}
        type="button"
        className="lead-traffic zoom"
        title={`${zoomLabel}. Mantén el puntero para mitades`}
        aria-label={zoomLabel}
        aria-expanded={menu != null}
        aria-haspopup="menu"
        disabled={disabled}
        onPointerEnter={scheduleShow}
        onPointerLeave={scheduleHide}
        onClick={(e) => {
          if (e.altKey || e.metaKey) {
            onPlace('free')
            return
          }
          onPlace(placement === 'fill' ? 'free' : 'fill')
        }}
      />
      {menu && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={menuRef}
              className="os-zoom-menu"
              role="menu"
              style={{ left: menu.left, top: menu.top }}
              onPointerDown={(e) => e.stopPropagation()}
              onPointerEnter={() => {
                clearTimers()
              }}
              onPointerLeave={scheduleHide}
            >
              <p className="os-zoom-menu-label">Rellenar y organizar</p>
              {TILES.filter((tile) => tile.group === 'fill').map((tile) => (
                <button
                  key={tile.id}
                  type="button"
                  role="menuitem"
                  className={`os-zoom-item${placement === tile.id ? ' is-active' : ''}`}
                  onClick={() => {
                    onPlace(placement === tile.id ? 'free' : tile.id)
                    setMenu(null)
                  }}
                >
                  <i className={`os-zoom-ico is-${tile.id}`} aria-hidden />
                  {tile.label}
                </button>
              ))}
              <p className="os-zoom-menu-label">Trasladar y redimensionar</p>
              <div className="os-zoom-grid">
                {TILES.filter((tile) => tile.group === 'move').map((tile) => (
                  <button
                    key={tile.id}
                    type="button"
                    role="menuitem"
                    className={`os-zoom-tile${placement === tile.id ? ' is-active' : ''}`}
                    title={tile.label}
                    aria-label={tile.label}
                    onClick={() => {
                      onPlace(placement === tile.id ? 'free' : tile.id)
                      setMenu(null)
                    }}
                  >
                    <i className={`os-zoom-ico is-${tile.id}`} aria-hidden />
                    <span>{tile.label.replace('Mitad ', '')}</span>
                  </button>
                ))}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
