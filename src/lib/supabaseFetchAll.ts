import type { PostgrestError } from '@supabase/supabase-js'

/** PostgREST devuelve como máximo 1000 filas por petición; paginamos hasta el final. */
const PAGE_SIZE = 1000

type PageResult<T> = { data: T[] | null; error: PostgrestError | null }

type PageQuery<T> = {
  range: (from: number, to: number) => PromiseLike<PageResult<T>>
}

/** Ejecuta la misma query paginada hasta traer todas las filas. */
export async function fetchAllSupabasePages<T>(buildQuery: () => PageQuery<T>): Promise<T[]> {
  const all: T[] = []
  let from = 0

  while (true) {
    const { data, error } = await buildQuery().range(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(error.message)

    const page = data ?? []
    all.push(...page)
    if (page.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  return all
}
