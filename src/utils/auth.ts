import { clearLegacyDemoSession } from '../lib/demoAsesores'
import { supabase } from '../lib/supabase'

export const signOut = async () => {
  clearLegacyDemoSession()
  const { error } = await supabase.auth.signOut()
  // Con el token ya revocado el logout global responde 403; el local siempre limpia.
  if (error) await supabase.auth.signOut({ scope: 'local' })
}
