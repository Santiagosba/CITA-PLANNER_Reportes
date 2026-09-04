export interface Workshop {
  id: string
  name: string
  address?: string
  city?: string
  logo?: string
  source: 'main' | 'aviold' | 'starmadrid' | 'demo'
  originalId: number | string
  /** Contenedor Hub / Connect para `crm_config.ui_branding`. */
  containerIdTaller?: string
  /** `hub_webs.id` del contenedor (JWT connect_site_ids). */
  hubWebId?: string
}

/** Campos derivados de `session.user` para la barra lateral (estilo CRM). */
export type CrmUser = {
  firstName: string
  lastName: string
  displayName: string
  email: string
  role: string
}

export function mapSessionUserToCrmUser(user: unknown): CrmUser {
  const u = user as Record<string, unknown> | null | undefined
  const md = (u?.user_metadata as Record<string, unknown>) ?? {}
  const email = String(u?.email ?? '')
  const full = md.full_name
  let firstName = ''
  let lastName = ''
  if (typeof full === 'string' && full.trim()) {
    const parts = full.trim().split(/\s+/).filter(Boolean)
    firstName = parts[0] ?? ''
    lastName = parts.slice(1).join(' ')
  } else {
    firstName = String(
      (md.first_name ?? md.firstName ?? (email.includes('@') ? email.split('@')[0] : '')) || 'Usuario',
    )
    lastName = String(md.last_name ?? md.lastName ?? '')
  }
  const displayName =
    typeof full === 'string' && full.trim()
      ? full.trim()
      : [firstName, lastName].filter(Boolean).join(' ') || email || 'Usuario'

  return {
    firstName,
    lastName,
    displayName,
    email,
    role: String(md.role_label ?? md.role ?? 'Asesor'),
  }
}
