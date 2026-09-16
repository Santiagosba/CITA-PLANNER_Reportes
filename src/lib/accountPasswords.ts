import { supabase } from './supabase'
import { normalizeEmail } from './advisorWorkspace'
import { crmDeleteTallerAccount, crmRevokeTallerAccount, crmUpdateAccountPassword, type TallerAccountRole } from './crmApi'

export type { TallerAccountRole }

export const MIN_ACCOUNT_PASSWORD = 8

export function passwordError(password: string, confirm: string): string | null {
  if (password.length < MIN_ACCOUNT_PASSWORD) {
    return `La contraseña debe tener al menos ${MIN_ACCOUNT_PASSWORD} caracteres.`
  }
  if (password !== confirm) return 'Las dos contraseñas no coinciden.'
  return null
}

async function requireRealSession(): Promise<void> {
  const { data } = await supabase.auth.getSession()
  if (!data.session?.access_token) {
    throw new Error('Entra con tu correo y contraseña. «Entrar como admin» no gestiona cuentas de verdad.')
  }
}

async function invokeTallerCuenta<T>(body: Record<string, unknown>): Promise<T> {
  await requireRealSession()
  const { data, error } = await supabase.functions.invoke('crm-taller-cuentas', { body })
  const payload = data as { error?: string } | null
  if (error) {
    const fromBody = payload?.error?.trim()
    if (fromBody) throw new Error(fromBody)
    throw new Error(error.message || 'No se ha podido crear la cuenta.')
  }
  if (payload?.error) throw new Error(payload.error)
  return data as T
}

export async function updateOwnPassword(currentPassword: string, nextPassword: string): Promise<void> {
  const { data } = await supabase.auth.getSession()
  const email = normalizeEmail(data.session?.user?.email || '')
  if (!email) throw new Error('No hay sesión. Vuelve a entrar.')

  const { error: checkError } = await supabase.auth.signInWithPassword({
    email,
    password: currentPassword,
  })
  if (checkError) {
    throw new Error(
      checkError.message === 'Invalid login credentials'
        ? 'La contraseña actual no es correcta.'
        : 'No se pudo comprobar la contraseña actual.',
    )
  }

  const { error } = await supabase.auth.updateUser({ password: nextPassword })
  if (error) throw new Error(error.message || 'No se pudo guardar tu contraseña.')
}

export async function updateAccountPassword(
  email: string,
  nextPassword: string,
  opts?: {
    name?: string
    idtaller?: string
    role?: TallerAccountRole
    hubWebId?: string | null
    crmIdtaller?: string
    crmIdtalleres?: string[]
  },
): Promise<{ created?: boolean; role?: TallerAccountRole }> {
  try {
    return await invokeTallerCuenta<{ created?: boolean; role?: TallerAccountRole }>({
      action: 'password',
      email: normalizeEmail(email),
      password: nextPassword,
      ...(opts?.name ? { name: opts.name } : {}),
      ...(opts?.idtaller ? { idtaller: opts.idtaller } : {}),
      ...(opts?.role ? { role: opts.role } : {}),
      ...(opts?.hubWebId ? { hubWebId: opts.hubWebId } : {}),
      ...(opts?.crmIdtaller ? { crmIdtaller: opts.crmIdtaller } : {}),
      ...(opts?.crmIdtalleres?.length ? { crmIdtalleres: opts.crmIdtalleres } : {}),
    })
  } catch (error) {
    try {
      return await crmUpdateAccountPassword(normalizeEmail(email), nextPassword, {
        ...opts,
        crmIdtalleres: opts?.crmIdtalleres,
      })
    } catch {
      throw error
    }
  }
}

export async function updateAccountRole(
  email: string,
  role: TallerAccountRole,
  opts?: { idtaller?: string; crmIdtaller?: string; name?: string; hubWebId?: string | null },
): Promise<{ role?: TallerAccountRole }> {
  return invokeTallerCuenta<{ role?: TallerAccountRole }>({
    action: 'role',
    email: normalizeEmail(email),
    role,
    ...(opts?.idtaller ? { idtaller: opts.idtaller } : {}),
    ...(opts?.crmIdtaller ? { crmIdtaller: opts.crmIdtaller } : {}),
    ...(opts?.hubWebId ? { hubWebId: opts.hubWebId } : {}),
    ...(opts?.name ? { name: opts.name } : {}),
  })
}

export async function revokeTallerAccount(email: string, idtaller: string, crmIdtaller?: string): Promise<void> {
  try {
    await invokeTallerCuenta({
      action: 'revoke',
      email: normalizeEmail(email),
      idtaller,
      ...(crmIdtaller ? { crmIdtaller } : {}),
    })
  } catch (error) {
    try {
      await crmRevokeTallerAccount({ email: normalizeEmail(email), idtaller, crmIdtaller })
    } catch {
      throw error
    }
  }
}

export async function scheduleTallerAccountDelete(
  email: string,
  opts?: { idtaller?: string; crmIdtaller?: string },
): Promise<{ purgeAt?: string }> {
  return invokeTallerCuenta<{ purgeAt?: string }>({
    action: 'schedule-delete',
    email: normalizeEmail(email),
    ...(opts?.idtaller ? { idtaller: opts.idtaller } : {}),
    ...(opts?.crmIdtaller ? { crmIdtaller: opts.crmIdtaller } : {}),
  })
}

export async function restoreTallerAccount(
  email: string,
  opts?: { idtaller?: string; crmIdtaller?: string },
): Promise<void> {
  await invokeTallerCuenta({
    action: 'restore',
    email: normalizeEmail(email),
    ...(opts?.idtaller ? { idtaller: opts.idtaller } : {}),
    ...(opts?.crmIdtaller ? { crmIdtaller: opts.crmIdtaller } : {}),
  })
}

export async function deleteTallerAccount(email: string, idtaller?: string): Promise<void> {
  try {
    await invokeTallerCuenta({
      action: 'delete',
      email: normalizeEmail(email),
      ...(idtaller ? { idtaller } : {}),
    })
  } catch (error) {
    try {
      await crmDeleteTallerAccount({ email: normalizeEmail(email), idtaller })
    } catch {
      throw error
    }
  }
}
