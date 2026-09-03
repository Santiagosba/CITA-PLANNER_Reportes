import { supabase } from '../lib/supabase'

export const signOut = async () => {
  await supabase.auth.signOut()
}
