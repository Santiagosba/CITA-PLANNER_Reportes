import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Workshop } from '../types'
import {
  fetchPendingPeticiones,
  fetchTiposPeticion,
  getPeticionesSourceNotice,
  resolveAvioldTallerIdsDetailed,
  type PeticionPendiente,
  type TipoPeticionRow,
} from '../lib/peticionesPendientes'
import {
  COPY_FALLBACK_NOTICE,
  loadPeticionesCopy,
  savePeticionesCopy,
  workshopCopyId,
} from '../lib/workingCopy'

type DateRange = {
  from?: string
  to?: string
}

type CacheEntry = {
  timestamp: number
  items: PeticionPendiente[]
  tipos: TipoPeticionRow[]
}

const CACHE_TTL = 30_000
const cache = new Map<string, CacheEntry>()
const inflight = new Map<string, Promise<CacheEntry>>()

function workshopKey(workshop: Workshop): string {
  return `${String(workshop.originalId || '')}|${String(workshop.containerIdTaller || '')}`
}

function requestKey(workshop: Workshop, range: DateRange): string {
  return `${workshopKey(workshop)}|${range.from || ''}|${range.to || ''}`
}

async function fetchData(workshop: Workshop, range: DateRange): Promise<CacheEntry> {
  const resolved = await resolveAvioldTallerIdsDetailed(workshop)
  if (!resolved.ids.length) {
    throw new Error('No encontramos este taller en el sistema.')
  }

  const [items, tipos] = await Promise.all([
    fetchPendingPeticiones(resolved.ids, range),
    fetchTiposPeticion(),
  ])

  return { timestamp: Date.now(), items, tipos }
}

export function invalidateOperationalData(workshop: Workshop): void {
  const prefix = `${workshopKey(workshop)}|`
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key)
  }
}

export function useOperationalData(workshop: Workshop, range: DateRange) {
  const key = requestKey(workshop, range)
  const cached = cache.get(key)
  const [items, setItems] = useState<PeticionPendiente[]>(cached?.items ?? [])
  const [tipos, setTipos] = useState<TipoPeticionRow[]>(cached?.tipos ?? [])
  const [loading, setLoading] = useState(!cached)
  const [error, setError] = useState<string | null>(null)
  const [sourceNotice, setSourceNotice] = useState<string | null>(null)

  const load = useCallback(
    async (force = false) => {
      const fresh = cache.get(key)
      if (!force && fresh && Date.now() - fresh.timestamp < CACHE_TTL) {
        setItems(fresh.items)
        setTipos(fresh.tipos)
        setLoading(false)
        return
      }

      setLoading(true)
      setError(null)
      try {
        let pending = inflight.get(key)
        if (!pending || force) {
          pending = fetchData(workshop, range)
          inflight.set(key, pending)
        }
        const data = await pending
        cache.set(key, data)
        setItems(data.items)
        setTipos(data.tipos)
        setSourceNotice(getPeticionesSourceNotice())
        savePeticionesCopy(workshopCopyId(workshop), data.items)
      } catch (e) {
        const copy = loadPeticionesCopy(workshopCopyId(workshop))
        if (copy?.length) {
          setItems(copy)
          setError(null)
          setSourceNotice(COPY_FALLBACK_NOTICE)
        } else {
          setError(e instanceof Error ? e.message : 'No se pudieron cargar los datos')
        }
      } finally {
        inflight.delete(key)
        setLoading(false)
      }
    },
    [key, workshop, range.from, range.to],
  )

  useEffect(() => {
    void load()
  }, [load])

  return useMemo(
    () => ({
      items,
      tipos,
      loading,
      error,
      sourceNotice,
      refresh: () => load(true),
    }),
    [items, tipos, loading, error, sourceNotice, load],
  )
}
