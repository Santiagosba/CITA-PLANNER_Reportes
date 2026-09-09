/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_BASE_PATH?: string
  readonly VITE_HUB_WEB_ICON_URL?: string
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
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
  /** URL base de api-crm (softphone Telnyx). Vacío = ver `VITE_CRM_API_SAME_ORIGIN`. */
  readonly VITE_CRM_API_URL?: string
  /** `1` cuando api-crm se sirve tras el mismo origen que la SPA (proxy /api/call*, /socket.io). */
  readonly VITE_CRM_API_SAME_ORIGIN?: string
  /** DID Telnyx de reserva si api-crm no devuelve caller ID (sin esto la llamada no suena). */
  readonly VITE_TELNYX_DEFAULT_CALLER_ID?: string
  /** Contraseña de las cuentas reales `*@taller.demo`. Sin definir → no se muestran asesores de prueba. */
  readonly VITE_DEMO_ASESOR_PASSWORD?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
