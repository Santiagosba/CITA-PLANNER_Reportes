/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_BASE_PATH?: string
  readonly VITE_HUB_WEB_ICON_URL?: string
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  readonly VITE_SUPABASE_DB_URL?: string
  readonly SUPABASE_DB_URL?: string
  readonly VITE_HUB_WEB_ID?: string
  /** Slug en `hub_webs` (favicon / fila Hub); por defecto en código se usa `crm`. */
  readonly VITE_HUB_WEB_SLUG?: string
  readonly VITE_DEPLOY_LICENSE_SLUG?: string
  readonly VITE_DEPLOY_CONTAINER_IDTALLER?: string
  /** Nombre del producto / próxima web (login, selector, pie). */
  readonly VITE_APP_PRODUCT_NAME?: string
  /** Línea corta en color acento junto al nombre (opcional). */
  readonly VITE_APP_PRODUCT_ACCENT_LINE?: string
  /** Subtítulo del login si no hay nombre de taller. */
  readonly VITE_APP_LOGIN_SUBTITLE?: string
  /** Texto orientativo bajo el título del selector. */
  readonly VITE_APP_SELECTOR_TAGLINE?: string
  /** Sello del pie del selector (ej. v0.1 · interno). */
  readonly VITE_APP_FOOTER_STAMP?: string
  /** Origen datos citas pendientes: `supabase` | `sqlserver` */
  readonly VITE_PETICIONES_SOURCE?: string
  /** URL base API SQL Server (vacío = /api vía proxy Vite) */
  readonly VITE_SQL_API_URL?: string
  /** Si sqlserver falla, usar Supabase (default: true). Pon `false` para forzar solo SQL. */
  readonly VITE_PETICIONES_SQL_FALLBACK?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
