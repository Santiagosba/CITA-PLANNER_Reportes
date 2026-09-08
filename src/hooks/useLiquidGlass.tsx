import type { RefObject } from 'react'

/**
 * Liquid glass: lente de 9 piezas (4 lados + 4 esquinas + centro plano).
 *
 * El canto óptico vive en tiras de `BEVEL` px. Los lados se estiran solo en
 * la dirección tangente, donde el mapa es constante, así que al agrandar o
 * encoger la ventana el filo no se deforma ni se regenera.
 */

const BEVEL = 56
const MAX_SHIFT = 16
const CORNER_RADIUS = 24
const DEFS_ID = 'lg-shared-defs-v2'

type EdgeTile = 'n' | 's' | 'e' | 'w'
type CornerTile = 'nw' | 'ne' | 'sw' | 'se'
type LensTile = EdgeTile | CornerTile

function bevelProfile(t: number): number {
  const u = 1 - Math.min(1, Math.max(0, t))
  return u * u * (0.6 + 0.4 * u)
}

function putShift(px: Uint8ClampedArray, i: number, nx: number, ny: number, s: number) {
  px[i] = Math.round(128 - 127 * nx * s)
  px[i + 1] = Math.round(128 - 127 * ny * s)
  px[i + 2] = 0
  px[i + 3] = 255
}

function canvasToUrl(w: number, h: number, paint: (px: Uint8ClampedArray) => void): string {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  const img = ctx.createImageData(w, h)
  paint(img.data)
  ctx.putImageData(img, 0, 0)
  return canvas.toDataURL('image/png')
}

function sdfRoundRect(
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
): { nx: number; ny: number; inside: number } {
  const r = Math.max(0, Math.min(radius, Math.min(w, h) / 2 - 0.01))
  const hx = w / 2
  const hy = h / 2
  const bx = hx - r
  const by = hy - r
  const pxx = x - hx
  const py = y - hy
  const qx = Math.abs(pxx) - bx
  const qy = Math.abs(py) - by
  let nx: number
  let ny: number
  let inside: number
  if (qx > 0 && qy > 0) {
    const len = Math.hypot(qx, qy) || 1
    nx = qx / len
    ny = qy / len
    inside = r - len
  } else if (qx > qy) {
    nx = 1
    ny = 0
    inside = r - qx
  } else {
    nx = 0
    ny = 1
    inside = r - qy
  }
  nx *= Math.sign(pxx) || 1
  ny *= Math.sign(py) || 1
  return { nx, ny, inside }
}

function buildEdgeTile(kind: EdgeTile): string {
  const along = 8
  const across = BEVEL
  const vertical = kind === 'e' || kind === 'w'
  const w = vertical ? across : along
  const h = vertical ? along : across
  return canvasToUrl(w, h, (px) => {
    let i = 0
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let t: number
        let nx: number
        let ny: number
        if (kind === 'n') {
          t = (y + 0.5) / h
          nx = 0
          ny = -1
        } else if (kind === 's') {
          t = 1 - (y + 0.5) / h
          nx = 0
          ny = 1
        } else if (kind === 'w') {
          t = (x + 0.5) / w
          nx = -1
          ny = 0
        } else {
          t = 1 - (x + 0.5) / w
          nx = 1
          ny = 0
        }
        putShift(px, i, nx, ny, bevelProfile(t))
        i += 4
      }
    }
  })
}

function buildCornerTile(kind: CornerTile): string {
  const box = BEVEL * 4
  const originX = kind.includes('e') ? box - BEVEL : 0
  const originY = kind.includes('s') ? box - BEVEL : 0
  return canvasToUrl(BEVEL, BEVEL, (px) => {
    let i = 0
    for (let y = 0; y < BEVEL; y++) {
      for (let x = 0; x < BEVEL; x++) {
        const { nx, ny, inside } = sdfRoundRect(
          originX + x + 0.5,
          originY + y + 0.5,
          box,
          box,
          CORNER_RADIUS,
        )
        putShift(px, i, nx, ny, bevelProfile(inside / BEVEL))
        i += 4
      }
    }
  })
}

function displacementFilterMarkup(id: string, href: string): string {
  const scale = MAX_SHIFT * 2
  return `<filter id="${id}" x="0" y="0" width="1" height="1" color-interpolation-filters="sRGB">
    <feImage href="${href}" preserveAspectRatio="none" result="lgmap"/>
    <feDisplacementMap in="SourceGraphic" in2="lgmap" scale="${scale}" xChannelSelector="R" yChannelSelector="G"/>
  </filter>`
}

function ensureSharedLensFilters() {
  if (typeof document === 'undefined') return
  if (document.getElementById(DEFS_ID)) return
  const tiles: LensTile[] = ['n', 's', 'e', 'w', 'nw', 'ne', 'sw', 'se']
  const markup = tiles
    .map((tile) => {
      const href = tile.length === 1 ? buildEdgeTile(tile as EdgeTile) : buildCornerTile(tile as CornerTile)
      return displacementFilterMarkup(`lg2-shared-${tile}`, href)
    })
    .join('')
  const parsed = new DOMParser().parseFromString(
    `<svg xmlns="http://www.w3.org/2000/svg" id="${DEFS_ID}" class="lg-defs" aria-hidden="true" focusable="false" width="0" height="0">${markup}</svg>`,
    'image/svg+xml',
  )
  document.body.appendChild(document.importNode(parsed.documentElement, true))
}

function supportsSvgBackdrop(): boolean {
  if (typeof CSS === 'undefined' || !CSS.supports) return false
  return CSS.supports('backdrop-filter', 'url(#x)') || CSS.supports('-webkit-backdrop-filter', 'url(#x)')
}

const LENS_PARTS: LensTile[] = ['n', 's', 'e', 'w', 'nw', 'ne', 'sw', 'se']

export function useLiquidGlass(
  _frameRef: RefObject<HTMLElement | null>,
  _activationKey: unknown = true,
) {
  return (
    <div className="lg-lens" aria-hidden>
      {LENS_PARTS.map((part) => (
        <span key={part} className={`lg-lens-part lg-lens-${part}`} />
      ))}
    </div>
  )
}

/* Los ocho mapas son pequeños y compartidos. Prepararlos al cargar el módulo
   evita que la primera ficha o app aparezca antes que su capa refractiva. */
if (typeof document !== 'undefined' && supportsSvgBackdrop()) {
  if (document.body) queueMicrotask(ensureSharedLensFilters)
  else document.addEventListener('DOMContentLoaded', ensureSharedLensFilters, { once: true })
}
