/** Emails con acceso de operaciones globales (mismo criterio que el selector de taller). */
export const AVIADMIN_SUPER_EMAILS = ['santy@gmail.com', 'noel.ponce@avicrm.es'] as const

export function sessionEmailOf(user: unknown): string {
  if (!user || typeof user !== 'object') return ''
  const record = user as {
    email?: unknown
    user_metadata?: Record<string, unknown>
    identities?: Array<{ email?: unknown; identity_data?: { email?: unknown } }>
  }
  const candidates = [
    record.email,
    record.user_metadata?.email,
    ...(record.identities ?? []).flatMap((identity) => [identity.email, identity.identity_data?.email]),
  ]
  for (const raw of candidates) {
    const value = String(raw ?? '').trim().toLowerCase()
    if (value.includes('@')) return value
  }
  return ''
}

export function isSuperAdminEmail(email: string | null | undefined): boolean {
  const value = String(email ?? '').trim().toLowerCase()
  return AVIADMIN_SUPER_EMAILS.some((item) => item.toLowerCase() === value)
}

/** Solo estos emails pueden disparar desde la UI el smoke-test HTTP de los crons Vercel (sin exponer secretos). */
export function isCronSmokeTesterEmail(email: string | null | undefined): boolean {
  return isSuperAdminEmail(email)
}

export function isAviAdminProfile(email: string | null | undefined, role: string | null | undefined): boolean {
  if (isSuperAdminEmail(email)) return true
  const value = String(role ?? '').trim().toLowerCase()
  return value === 'aviadmin' || value.includes('administrador avi')
}
