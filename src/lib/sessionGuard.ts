/**
 * Sesión caducada: cuando la API SQL o api-crm responden 401, el token que
 * guarda el navegador ya no lo acepta Supabase. Se intenta refrescar una vez y,
 * si tampoco vale, se cierra sesión en local para que la app vuelva al login en
 * lugar de seguir mostrando la copia de Supabase como si todo fuese bien.
 */

import { supabase } from './supabase'

let inFlight: Promise<boolean> | null = null

async function refreshOrSignOut(): Promise<boolean> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  // Sin sesión real (o con asesor de prueba) el 401 no es una sesión caducada.
  if (!token || token.startsWith('demo-')) return true

  try {
    const { data: refreshed, error } = await supabase.auth.refreshSession()
    if (!error && refreshed.session?.access_token) return true
  } catch {
    /* el refresh tampoco vale: se trata como sesión muerta */
  }

  try {
    // Scope local: el logout global falla con 403 cuando el token ya está revocado.
    await supabase.auth.signOut({ scope: 'local' })
  } catch {
    /* onAuthStateChange no llegará a dispararse, pero el token muerto ya no se reutiliza */
  }
  return false
}

/**
 * Devuelve `true` si la sesión sigue siendo utilizable tras refrescarla.
 * Las llamadas concurrentes comparten un único intento.
 */
export function handleExpiredSession(): Promise<boolean> {
  inFlight ??= refreshOrSignOut().then(
    (ok) => {
      inFlight = null
      return ok
    },
    () => {
      inFlight = null
      return false
    },
  )
  return inFlight
}
