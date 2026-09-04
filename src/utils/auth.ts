import { clearDemoSession } from '../lib/demoAsesores'
import { supabase } from '../lib/supabase'

export const signOut = async () => {
  clearDemoSession()
  await supabase.auth.signOut()
}
