import { createClient } from '@supabase/supabase-js'

// Legacy fallback (solo si hace falta; en despliegues nuevos usa VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY).
export const legacySupabaseUrl = 'https://iwugxgzaakjsheshqqhr.supabase.co'
export const legacySupabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3dWd4Z3phYWtqc2hlc2hxcWhyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA3MTY1MDYsImV4cCI6MjA3NjI5MjUwNn0.j-5FiBDAjwhyEg0Nq9w6e-xfxrRI3SKTyRGd1egdxEk'

type ViteEnvShape = {
  VITE_SUPABASE_DB_URL?: string
  SUPABASE_DB_URL?: string
  VITE_SUPABASE_URL?: string
  VITE_SUPABASE_ANON_KEY?: string
}

const runtimeEnv = ((import.meta as any)?.env || {}) as ViteEnvShape
const dbUrlRaw = runtimeEnv.VITE_SUPABASE_DB_URL || runtimeEnv.SUPABASE_DB_URL || ''

function deriveSupabaseProjectUrlFromDbUrl(dbUrl: string): string | null {
  if (!dbUrl || typeof dbUrl !== 'string') return null
  const m = dbUrl.match(/postgres\.([a-z0-9]+):/i)
  if (!m?.[1]) return null
  return `https://${m[1]}.supabase.co`
}

const derivedUrl = deriveSupabaseProjectUrlFromDbUrl(dbUrlRaw)
export const supabaseUrl = runtimeEnv.VITE_SUPABASE_URL || derivedUrl || legacySupabaseUrl
export const supabaseKey = runtimeEnv.VITE_SUPABASE_ANON_KEY || legacySupabaseKey

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    storageKey: 'agenda-v2-main-auth',
    persistSession: true,
    detectSessionInUrl: true,
  },
})

export const supabaseAviOld = supabase.schema('aviold')
export const supabaseOperations = supabase.schema('operations')

export const supabaseStarMadridUrl = 'https://hzbagkprzbiayyrctfej.supabase.co'
export const supabaseStarMadridKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh6YmFna3ByemJpYXl5cmN0ZmVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjExNDYwMDgsImV4cCI6MjA3NjcyMjAwOH0.Y5lY0DREr65yC7pS7Bv7pMvYm9oB121R7iX9O_R8mB8'

export const supabaseStarMadrid = createClient(supabaseStarMadridUrl, supabaseStarMadridKey, {
  auth: {
    storageKey: 'agenda-v2-starmadrid-auth',
    persistSession: true,
    detectSessionInUrl: false,
  },
})
