/**
 * Comprueba los 401 de las APIs contra Supabase antes de renovar la sesión.
 * Solo una renovación definitivamente rechazada provoca el cierre local.
 */

import { supabase } from './supabase'

let inFlight: Promise<boolean> | null = null

async function refreshOrSignOut(rejectedToken?: string): Promise<boolean> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token || token.startsWith('demo-')) return false
  // Otra petición o el SDK ya renovó el token que recibió el 401.
  if (rejectedToken && token !== rejectedToken) return true

  // Un 401 del backend no demuestra que la sesión de Supabase haya caducado.
  const { data: identity, error: identityError } = await supabase.auth.getUser(token)
  if (!identityError && identity.user) return true
  if (!identityError || ![401, 403].includes(identityError.status ?? 0)) {
    throw identityError ?? new Error('No se pudo comprobar la sesión.')
  }

  const { data: refreshed, error } = await supabase.auth.refreshSession()
  if (!error && refreshed.session?.access_token) return true
  // Un corte de red o un 5xx no invalida las credenciales guardadas.
  const terminalCodes = ['refresh_token_not_found', 'refresh_token_already_used', 'session_not_found', 'session_expired', 'user_not_found']
  if (error && error.name !== 'AuthSessionMissingError' && !terminalCodes.includes(error.code ?? '')) {
    throw error
  }

  const { data: latest } = await supabase.auth.getSession()
  if (latest.session?.access_token && latest.session.access_token !== token) return true

  try {
    // Scope local: el logout global falla con 403 cuando el token ya está revocado.
    await supabase.auth.signOut({ scope: 'local' })
  } catch {
    /* onAuthStateChange no llegará a dispararse, pero el token muerto ya no se reutiliza */
  }
  return false
}

/**
 * Devuelve `true` si la sesión sigue siendo utilizable; lanza los fallos temporales.
 * Las llamadas concurrentes comparten un único intento.
 */
export function handleExpiredSession(rejectedToken?: string): Promise<boolean> {
  inFlight ??= refreshOrSignOut(rejectedToken).then(
    (ok) => {
      inFlight = null
      return ok
    },
    (error) => {
      inFlight = null
      throw error
    },
  )
  return inFlight
}
