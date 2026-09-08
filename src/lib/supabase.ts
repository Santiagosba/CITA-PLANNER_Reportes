import { createClient } from '@supabase/supabase-js'

export const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || '').trim()
export const supabaseKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim()

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Faltan VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.')
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    storageKey: 'agenda-v2-main-auth',
    persistSession: true,
    detectSessionInUrl: true,
  },
})

export const supabaseAviOld = supabase.schema('aviold')
export const supabaseOperations = supabase.schema('operations')
