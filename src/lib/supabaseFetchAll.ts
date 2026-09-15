import type { PostgrestError } from '@supabase/supabase-js'

/** PostgREST devuelve como máximo 1000 filas por petición; paginamos hasta el final. */
const PAGE_SIZE = 1000

type PageResult<T> = { data: T[] | null; error: PostgrestError | null }

type PageQuery<T> = {
  range: (from: number, to: number) => PromiseLike<PageResult<T>>
}

async function fetchPage<T>(buildQuery: () => PageQuery<T>, from: number): Promise<T[]> {
  const { data, error } = await buildQuery().range(from, from + PAGE_SIZE - 1)
  if (error) throw new Error(error.message)
  return data ?? []
}

/** Ejecuta la misma query paginada hasta traer todas las filas. */
export async function fetchAllSupabasePages<T>(buildQuery: () => PageQuery<T>): Promise<T[]> {
  const first = await fetchPage(buildQuery, 0)
  if (first.length < PAGE_SIZE) return first

  const all: T[] = [...first]
  let from = PAGE_SIZE
  while (true) {
    const starts = [from, from + PAGE_SIZE, from + PAGE_SIZE * 2]
    const pages = await Promise.all(starts.map((start) => fetchPage(buildQuery, start)))
    for (const page of pages) {
      all.push(...page)
      if (page.length < PAGE_SIZE) return all
    }
    from += PAGE_SIZE * 3
  }
}
