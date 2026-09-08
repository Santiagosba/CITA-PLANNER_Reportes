/**
 * Asesores de prueba: cuentas REALES de Supabase Auth (email `@taller.demo`) con
 * `app_metadata.demo_asesor = true` y membresía en `operations.taller_users`.
 *
 * El botón del login hace `signInWithPassword` con `VITE_DEMO_ASESOR_PASSWORD`;
 * si esa variable no está definida, los botones no se muestran (producción).
 * Ya no existen sesiones falsas en `sessionStorage`: todo pasa por JWT + RLS.
 */

import { supabase } from './supabase'

export type DemoAsesor = {
  id: string
  firstName: string
  lastName: string
  email: string
  role: string
  roleLabel: string
  initials: string
  focus: string
}

export const DEMO_ASESORES: DemoAsesor[] = [
  {
    id: 'demo-asesor-ana',
    firstName: 'Ana',
    lastName: 'Ruiz',
    email: 'ana.ruiz@taller.demo',
    role: 'asesor',
    roleLabel: 'Asesora de triage',
    initials: 'AR',
    focus: 'Consultas sin cita y sesiones abiertas',
  },
  {
    id: 'demo-asesor-luis',
    firstName: 'Luis',
    lastName: 'Mora',
    email: 'luis.mora@taller.demo',
    role: 'asesor',
    roleLabel: 'Asesor comercial',
    initials: 'LM',
    focus: 'Citas y seguimiento de clientes',
  },
  {
    id: 'demo-asesor-carmen',
    firstName: 'Carmen',
    lastName: 'Vidal',
    email: 'carmen.vidal@taller.demo',
    role: 'asesor',
    roleLabel: 'Asesora de peritaje',
    initials: 'CV',
    focus: 'Siniestros y validación técnica',
  },
]

/** Clave de la antigua sesión falsa; se limpia en el arranque por si quedó en navegadores. */
const LEGACY_STORAGE_KEY = 'avi_demo_asesor'

function demoPassword(): string {
  return String(import.meta.env.VITE_DEMO_ASESOR_PASSWORD || '').trim()
}

/** Los botones de asesor de prueba solo existen si el entorno define la contraseña. */
export function demoAsesoresEnabled(): boolean {
  return demoPassword() !== ''
}

/** Solo `app_metadata` (lo escribe el servidor); `user_metadata` lo edita el propio usuario. */
export function isDemoAsesor(user: unknown): boolean {
  const record = user as { app_metadata?: { demo_asesor?: unknown } } | null
  return record?.app_metadata?.demo_asesor === true
}

export async function signInAsDemoAsesor(asesor: DemoAsesor): Promise<{ error: string | null }> {
  const password = demoPassword()
  if (!password) return { error: 'Los asesores de prueba no están habilitados en este entorno.' }
  const { error } = await supabase.auth.signInWithPassword({ email: asesor.email, password })
  if (!error) return { error: null }
  return {
    error:
      error.message === 'Invalid login credentials'
        ? 'La cuenta de prueba no está disponible. Revisa VITE_DEMO_ASESOR_PASSWORD.'
        : 'No se pudo entrar con el asesor de prueba.',
  }
}

export function clearLegacyDemoSession() {
  try {
    sessionStorage.removeItem(LEGACY_STORAGE_KEY)
  } catch {
    /* ignore */
  }
}
