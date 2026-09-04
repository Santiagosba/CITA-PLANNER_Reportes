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

const STORAGE_KEY = 'avi_demo_asesor'

export function isDemoAsesor(user: unknown): boolean {
  const record = user as { id?: string; user_metadata?: { demo_asesor?: boolean } } | null
  if (!record) return false
  return Boolean(record.user_metadata?.demo_asesor) || String(record.id ?? '').startsWith('demo-asesor-')
}

export function buildDemoSession(asesor: DemoAsesor) {
  return {
    access_token: `demo-${asesor.id}`,
    user: {
      id: asesor.id,
      email: asesor.email,
      user_metadata: {
        full_name: `${asesor.firstName} ${asesor.lastName}`,
        first_name: asesor.firstName,
        last_name: asesor.lastName,
        role: asesor.role,
        role_label: asesor.roleLabel,
        demo_asesor: true,
      },
      app_metadata: {},
    },
  }
}

export function saveDemoSession(session: unknown) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session))
  } catch {
    /* ignore */
  }
}

export function loadDemoSession(): unknown | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { user?: { id?: string } }
    if (!isDemoAsesor(parsed?.user)) return null
    return parsed
  } catch {
    return null
  }
}

export function clearDemoSession() {
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}
