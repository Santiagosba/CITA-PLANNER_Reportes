import { supabase } from './supabase'
import { normalizeEmail } from './advisorWorkspace'
import { crmUpdateAccountPassword } from './crmApi'

export const MIN_ACCOUNT_PASSWORD = 8

export function passwordError(password: string, confirm: string): string | null {
  if (password.length < MIN_ACCOUNT_PASSWORD) {
    return `La contraseña debe tener al menos ${MIN_ACCOUNT_PASSWORD} caracteres.`
  }
  if (password !== confirm) return 'Las dos contraseñas no coinciden.'
  return null
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

export async function updateAccountPassword(email: string, nextPassword: string): Promise<void> {
  await crmUpdateAccountPassword(normalizeEmail(email), nextPassword)
}
