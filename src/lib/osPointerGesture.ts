export type OsPointerGestureHandlers = {
  move: (event: PointerEvent) => void
  end: () => void
}

let active: OsPointerGestureHandlers | null = null
let listening = false

function onMove(event: PointerEvent) {
  active?.move(event)
}

function onEnd() {
  active?.end()
}

function ensureListeners() {
  if (listening || typeof window === 'undefined') return
  listening = true
  window.addEventListener('pointermove', onMove, { passive: true })
  window.addEventListener('pointerup', onEnd)
  window.addEventListener('pointercancel', onEnd)
}

function removeListeners() {
  if (!listening || typeof window === 'undefined') return
  listening = false
  window.removeEventListener('pointermove', onMove)
  window.removeEventListener('pointerup', onEnd)
  window.removeEventListener('pointercancel', onEnd)
}

/**
 * Un solo canal global para el gesto activo. Antes cada ventana instalada
 * tres listeners permanentes que se ejecutaban con cualquier movimiento.
 */
export function beginOsPointerGesture(handlers: OsPointerGestureHandlers) {
  ensureListeners()
  active = handlers
}

export function endOsPointerGesture(handlers: OsPointerGestureHandlers) {
  if (active !== handlers) return
  active = null
  removeListeners()
}
