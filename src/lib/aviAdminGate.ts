/** Emails con acceso de operaciones globales (mismo criterio que el selector de taller). */
export const AVIADMIN_SUPER_EMAILS = ['noel.ponce@avicrm.es'] as const

/** Solo estos emails pueden disparar desde la UI el smoke-test HTTP de los crons Vercel (sin exponer secretos). */
export function isCronSmokeTesterEmail(email: string | null | undefined): boolean {
  const e = String(email ?? '').trim().toLowerCase()
  return AVIADMIN_SUPER_EMAILS.some((x) => x.toLowerCase() === e)
}

export function isAviAdminProfile(email: string | null | undefined, role: string | null | undefined): boolean {
  const e = String(email ?? '').trim().toLowerCase()
  if (AVIADMIN_SUPER_EMAILS.some((x) => x.toLowerCase() === e)) return true
  return String(role ?? '').trim() === 'AviAdmin'
}
