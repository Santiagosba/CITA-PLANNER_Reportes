/**
 * Textos e identidad de producto: todo override por `.env` (Vite `VITE_*`).
 * Base pensada para montar la “próxima web” sin arrastrar nombres de otro despliegue.
 */

function trimOr<T>(raw: string | undefined, fallback: T): string | T {
  const s = (raw ?? '').trim()
  return s || fallback
}

/** Nombre visible en login, cabecera del selector y pie (ej. «Mi producto 2026»). */
export function getAppProductName(): string {
  return trimOr(import.meta.env.VITE_APP_PRODUCT_NAME, 'Próxima web')
}

/**
 * Segunda línea del bloque de marca (login/selector), en color acento.
 * Vacío → no se renderiza (solo el nombre principal).
 */
export function getAppProductAccentLine(): string {
  return (import.meta.env.VITE_APP_PRODUCT_ACCENT_LINE || '').trim()
}

/** Subtítulo por defecto cuando no hay nombre de taller en login. */
export function getAppLoginDefaultSubtitle(): string {
  return trimOr(
    import.meta.env.VITE_APP_LOGIN_SUBTITLE,
    'Plantilla Hub — conecta backend, módulos y marca cuando definas el producto.',
  )
}

/** Línea bajo el título principal del selector (modo normal / AviAdmin). */
export function getWorkshopSelectorTaglineDefault(): string {
  return trimOr(
    import.meta.env.VITE_APP_SELECTOR_TAGLINE,
    'Base lista: aquí engancharás datos, permisos y pantallas del siguiente proyecto.',
  )
}

/** Pie del selector (versión o sello interno). */
export function getAppFooterStamp(): string {
  return trimOr(import.meta.env.VITE_APP_FOOTER_STAMP, 'BASE PLANTILLA')
}
