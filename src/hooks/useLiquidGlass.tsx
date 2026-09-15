import type { RefObject } from 'react'

/**
 * El canto óptico (lente 9 piezas + filtros SVG) está apagado: costaba GPU
 * y ya no se pinta. Se deja el hook para no romper ToolWindow / fichas / barra.
 */
export function useLiquidGlass(
  _frameRef: RefObject<HTMLElement | null>,
  _activationKey: unknown = true,
) {
  return null
}
