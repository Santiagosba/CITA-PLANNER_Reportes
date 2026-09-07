import { useEffect, useId, useRef, type RefObject } from 'react'

/**
 * Liquid glass real para una ventana, sobre el fondo VIVO (sin rasterizar el DOM).
 *
 * Modelo óptico: lente biconvexa de canto redondeado (como el `bevelMode: 0` de
 * las librerías WebGL). El centro es plano (no desvía), y en los últimos `RIM` px
 * la superficie se curva: el fondo se «tira» hacia dentro siguiendo la normal de
 * la forma (rectángulo redondeado real, esquinas incluidas), con aberración
 * cromática (R/G/B se desvían distinto) y un brillo Fresnel en el filo.
 *
 * Se genera un mapa de desplazamiento (canvas → PNG, 1/4 de resolución) a la
 * medida del marco y se conecta a un filtro SVG propio de la ventana. El CSS
 * (`.lead-os-frame::after`) lo aplica con `backdrop-filter: var(--lg-filter)`.
 * También publica `--lg-mx / --lg-my` (puntero en %) para el reflejo del cuerpo.
 */

/** Ancho del anillo refractivo (px). Debe coincidir con `--lg-rim` en CSS. */
const RIM = 16
/** Desvío máximo en el filo (px). */
const MAX_SHIFT = 15
/** Aberración cromática: R y B se desvían ±este porcentaje respecto a G. */
const CHROMA = 0.09
/** El mapa es suave: se genera a 1/4 de resolución y se estira. */
const MAP_SCALE = 0.25

/** Perfil del canto: pendiente de una lente circular, suavizada y acotada. */
function bevelProfile(t: number): number {
  const u = 1 - Math.min(1, Math.max(0, t))
  // Mezcla cuadrática/cúbica: fuerte en el filo, se apaga suave hacia el centro.
  return u * u * (0.6 + 0.4 * u)
}

/**
 * Mapa RG: 128 = sin desvío; >128 muestra hacia +x/+y, <128 hacia −x/−y.
 * Usa la SDF de un rectángulo redondeado para que la normal sea correcta en
 * las esquinas (no una simple suma de gradientes horizontal + vertical).
 */
export function buildDisplacementMap(width: number, height: number, cornerRadius: number): string | null {
  const w = Math.max(4, Math.round(width * MAP_SCALE))
  const h = Math.max(4, Math.round(height * MAP_SCALE))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  const rim = RIM * MAP_SCALE
  const r = Math.max(0, Math.min(cornerRadius * MAP_SCALE, Math.min(w, h) / 2 - 0.01))
  const hx = w / 2
  const hy = h / 2
  const bx = hx - r
  const by = hy - r

  const img = ctx.createImageData(w, h)
  const px = img.data
  let i = 0
  for (let y = 0; y < h; y++) {
    const py = y + 0.5 - hy
    const qy = Math.abs(py) - by
    for (let x = 0; x < w; x++) {
      const pxx = x + 0.5 - hx
      const qx = Math.abs(pxx) - bx

      // Normal exterior de la forma en este punto y distancia al borde (hacia dentro).
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

      const s = bevelProfile(inside / rim)
      // Desvío hacia dentro = −normal.
      px[i] = Math.round(128 - 127 * nx * s)
      px[i + 1] = Math.round(128 - 127 * ny * s)
      px[i + 2] = 0
      px[i + 3] = 255
      i += 4
    }
  }
  ctx.putImageData(img, 0, 0)
  return canvas.toDataURL('image/png')
}

/** Solo Chromium/Firefox aceptan `backdrop-filter: url(#svg)`; Safari lo ignora. */
function supportsSvgBackdrop(): boolean {
  if (typeof CSS === 'undefined' || !CSS.supports) return false
  return CSS.supports('backdrop-filter', 'url(#x)') || CSS.supports('-webkit-backdrop-filter', 'url(#x)')
}

const KEEP_R = '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0'
const KEEP_G = '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0'
const KEEP_B = '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0'

export function useLiquidGlass(frameRef: RefObject<HTMLElement | null>) {
  const rawId = useId()
  const filterId = 'lg' + rawId.replace(/[^a-zA-Z0-9]/g, '')
  const imgRef = useRef<SVGFEImageElement>(null)

  useEffect(() => {
    const el = frameRef.current
    if (!el) return

    const refract = supportsSvgBackdrop()
    if (refract) el.style.setProperty('--lg-filter', `url(#${filterId})`)

    let raf = 0
    let lastKey = ''
    const paint = () => {
      raf = 0
      const w = el.clientWidth
      const h = el.clientHeight
      if (!w || !h) return
      const radius = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0
      const key = `${w}x${h}@${radius}`
      if (key === lastKey) return
      lastKey = key
      const url = buildDisplacementMap(w, h, radius)
      if (url) imgRef.current?.setAttribute('href', url)
    }
    let ro: ResizeObserver | null = null
    if (refract) {
      paint()
      ro = new ResizeObserver(() => {
        if (!raf) raf = requestAnimationFrame(paint)
      })
      ro.observe(el)
    }

    // Luz que sigue al puntero (reflejo del cuerpo).
    let lightRaf = 0
    let px = 0
    let py = 0
    const onMove = (e: PointerEvent) => {
      px = e.clientX
      py = e.clientY
      if (lightRaf) return
      lightRaf = requestAnimationFrame(() => {
        lightRaf = 0
        const r = el.getBoundingClientRect()
        if (!r.width || !r.height) return
        el.style.setProperty('--lg-mx', `${(((px - r.left) / r.width) * 100).toFixed(1)}%`)
        el.style.setProperty('--lg-my', `${(((py - r.top) / r.height) * 100).toFixed(1)}%`)
      })
    }
    const onLeave = () => {
      el.style.removeProperty('--lg-mx')
      el.style.removeProperty('--lg-my')
    }
    el.addEventListener('pointermove', onMove, { passive: true })
    el.addEventListener('pointerleave', onLeave)

    return () => {
      ro?.disconnect()
      if (raf) cancelAnimationFrame(raf)
      if (lightRaf) cancelAnimationFrame(lightRaf)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerleave', onLeave)
      el.style.removeProperty('--lg-filter')
      onLeave()
    }
  }, [frameRef, filterId])

  const scale = MAX_SHIFT * 2
  return (
    <svg className="lg-defs" aria-hidden focusable="false" width="0" height="0">
      <filter id={filterId} x="0" y="0" width="1" height="1" colorInterpolationFilters="sRGB">
        <feImage ref={imgRef} preserveAspectRatio="none" result="lgmap" />
        {/* Aberración cromática: cada canal se refracta con un índice distinto */}
        <feDisplacementMap in="SourceGraphic" in2="lgmap" scale={scale * (1 - CHROMA)} xChannelSelector="R" yChannelSelector="G" result="dr" />
        <feColorMatrix in="dr" type="matrix" values={KEEP_R} result="cr" />
        <feDisplacementMap in="SourceGraphic" in2="lgmap" scale={scale} xChannelSelector="R" yChannelSelector="G" result="dg" />
        <feColorMatrix in="dg" type="matrix" values={KEEP_G} result="cg" />
        <feDisplacementMap in="SourceGraphic" in2="lgmap" scale={scale * (1 + CHROMA)} xChannelSelector="R" yChannelSelector="G" result="db" />
        <feColorMatrix in="db" type="matrix" values={KEEP_B} result="cb" />
        <feComposite in="cr" in2="cg" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" result="crg" />
        <feComposite in="crg" in2="cb" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" />
      </filter>
    </svg>
  )
}
