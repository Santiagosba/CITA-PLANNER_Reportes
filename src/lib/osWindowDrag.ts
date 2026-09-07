export type Edge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'
export type Side = 'n' | 's' | 'e' | 'w'

export type WinRect = { x: number; y: number; w: number; h: number }

export function sidesFromEdge(edge: Edge): Set<Side> {
  const sides = new Set<Side>()
  if (edge.includes('n')) sides.add('n')
  if (edge.includes('s')) sides.add('s')
  if (edge.includes('e')) sides.add('e')
  if (edge.includes('w')) sides.add('w')
  return sides
}

/**
 * Redimensiona anclando los bordes que no se arrastran.
 * Al llegar al mínimo, el borde contrario no se mueve.
 */
export function resizeRectFromPointer(args: {
  origin: WinRect
  sides: Set<Side>
  clientX: number
  clientY: number
  minW: number
  minH: number
}): WinRect {
  const { origin, sides, clientX, clientY, minW, minH } = args
  const maxRight = Math.max(minW, window.innerWidth - 4)
  const maxBottom = Math.max(minH, window.innerHeight - 4)

  let left = origin.x
  let top = origin.y
  let right = origin.x + origin.w
  let bottom = origin.y + origin.h

  if (sides.has('e')) {
    right = Math.min(maxRight, Math.max(left + minW, clientX))
  }
  if (sides.has('w')) {
    left = Math.max(0, Math.min(right - minW, clientX))
  }
  if (sides.has('s')) {
    bottom = Math.min(maxBottom, Math.max(top + minH, clientY))
  }
  if (sides.has('n')) {
    top = Math.max(0, Math.min(bottom - minH, clientY))
  }

  return {
    x: left,
    y: top,
    w: right - left,
    h: bottom - top,
  }
}

export function cursorForSides(sides: Set<Side>): string {
  const n = sides.has('n')
  const s = sides.has('s')
  const e = sides.has('e')
  const w = sides.has('w')
  if ((n && e) || (s && w)) return 'nesw-resize'
  if ((n && w) || (s && e)) return 'nwse-resize'
  if (n || s) return 'ns-resize'
  if (e || w) return 'ew-resize'
  return 'default'
}

/** Aplica el rect al DOM sin pasar por React (gesto fluido). */
export function applyWinRectToElement(el: HTMLElement, rect: WinRect): void {
  el.style.left = `${rect.x}px`
  el.style.top = `${rect.y}px`
  el.style.width = `${rect.w}px`
  el.style.height = `${rect.h}px`
}

/** Vector hacia la barra de tareas para el minimizado «dock» (la ventana vuela hacia ella). */
export function applyDockVars(el: HTMLElement): void {
  const dock = document.querySelector('.call-agenda-root:not(.is-tucking)') as HTMLElement | null
  const win = el.getBoundingClientRect()
  const winCx = win.left + win.width / 2
  const winCy = win.top + win.height / 2
  let dockCx = window.innerWidth - 96
  let dockCy = window.innerHeight - 96
  if (dock) {
    const d = dock.getBoundingClientRect()
    dockCx = d.left + d.width / 2
    dockCy = d.top + Math.min(36, d.height / 2)
  }
  el.style.setProperty('--dock-dx', `${dockCx - winCx}px`)
  el.style.setProperty('--dock-dy', `${dockCy - winCy}px`)
}

/** Pequeño «rebote» de la barra de tareas al recoger una ventana minimizada. */
export function pulseAgendaCatch(): void {
  const dock = document.querySelector('.call-agenda-root:not(.is-tucked)')
  if (!dock) return
  dock.classList.remove('is-catching')
  void (dock as HTMLElement).offsetWidth
  dock.classList.add('is-catching')
  window.setTimeout(() => dock.classList.remove('is-catching'), 700)
}

/** Dirección aleatoria fuera de pantalla para el minimizado “scatter”. */
export function applyScatterVars(el: HTMLElement, staggerMs = 0): void {
  const angle = Math.random() * Math.PI * 2
  const distX = window.innerWidth * (0.95 + Math.random() * 0.55)
  const distY = window.innerHeight * (0.95 + Math.random() * 0.55)
  const dx = Math.cos(angle) * distX
  const dy = Math.sin(angle) * distY
  const rot = Math.random() * 42 - 21
  const scale = 0.68 + Math.random() * 0.22
  const delay = staggerMs + Math.round(Math.random() * 90)

  el.style.setProperty('--scatter-dx', `${Math.round(dx)}px`)
  el.style.setProperty('--scatter-dy', `${Math.round(dy)}px`)
  el.style.setProperty('--scatter-rot', `${rot.toFixed(1)}deg`)
  el.style.setProperty('--scatter-scale', scale.toFixed(2))
  el.style.setProperty('--min-delay', `${delay}ms`)
}
