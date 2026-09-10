import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Workshop } from '../types'
import {
  fetchPendingPeticiones,
  enrichPeticionClientNames,
  mergePeticionClientNames,
  fetchTiposPeticion,
  getPeticionesSourceNotice,
  resolveAvioldTallerIdsDetailed,
  type PeticionPendiente,
  type TipoPeticionRow,
} from '../lib/peticionesPendientes'
import { DEMO_TICKETS_NOTICE, isDemoTicketId, mergeLiveAndDemoTickets } from '../lib/demoTickets'
import { PETICIONES_PATCHED_EVENT } from '../lib/ticketOps'
import { withLoadDeadline } from '../lib/loadDeadline'
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
  loadNames?: () => Promise<PeticionPendiente[]>
  names?: Promise<PeticionPendiente[]>
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
  if (import.meta.env.DEV && workshop.id === 'local-preview' && workshop.source === 'demo') {
    return { timestamp: Date.now(), items: mergeLiveAndDemoTickets([], workshop, range), tipos: [] }
  }
  const resolved = await resolveAvioldTallerIdsDetailed(workshop)
  if (!resolved.ids.length) {
    const items = mergeLiveAndDemoTickets([], workshop, range)
    if (!items.length) throw new Error('No encontramos este taller en el sistema.')
    return { timestamp: Date.now(), items, tipos: [] }
  }

  const [live, tipos] = await Promise.all([
    fetchPendingPeticiones(resolved.ids, range, { includeClientNames: false }),
    fetchTiposPeticion(),
  ])
  const items = mergeLiveAndDemoTickets(live, workshop, range)

  return {
    timestamp: Date.now(), items, tipos,
    loadNames: () => withLoadDeadline(enrichPeticionClientNames(live, resolved.ids, range)).catch(() => []),
  }
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
  const requestVersion = useRef(0)

  const load = useCallback(
    async (force = false, silent = false) => {
      const version = ++requestVersion.current
      const applyNames = (entry: CacheEntry) => {
        if (!entry.loadNames) return
        entry.names ??= entry.loadNames()
        void entry.names.then((enriched) => {
          if (version !== requestVersion.current || !enriched.length) return
          setItems((current) => mergePeticionClientNames(current, enriched))
          const current = cache.get(key)
          if (current === entry) {
            entry.items = mergePeticionClientNames(entry.items, enriched)
          }
        })
      }
      const fresh = cache.get(key)
      if (!force && fresh && Date.now() - fresh.timestamp < CACHE_TTL) {
        setItems(fresh.items)
        setTipos(fresh.tipos)
        setLoading(false)
        applyNames(fresh)
        return
      }

      if (!silent) setLoading(true)
      setError(null)
      let pending = inflight.get(key)
      try {
        if (!pending) {
          pending = withLoadDeadline(fetchData(workshop, range))
          inflight.set(key, pending)
        }
        const data = await pending
        if (version !== requestVersion.current) return
        cache.set(key, data)
        setItems(data.items)
        setTipos(data.tipos)
        const liveOnly = data.items.filter((row) => !isDemoTicketId(row.idpeticion))
        const apiNotice = getPeticionesSourceNotice()
        const hasDemo = liveOnly.length < data.items.length
        setSourceNotice([apiNotice, hasDemo ? DEMO_TICKETS_NOTICE : null].filter(Boolean).join(' ') || null)
        savePeticionesCopy(workshopCopyId(workshop), liveOnly)
        applyNames(data)
      } catch (e) {
        if (version !== requestVersion.current) return
        const reason = e instanceof Error ? e.message : 'No se pudieron cargar los datos actualizados.'
        const copy = loadPeticionesCopy(workshopCopyId(workshop)) ?? []
        const merged = mergeLiveAndDemoTickets(copy, workshop, range)
        if (merged.length) {
          setItems(merged)
          setError(null)
          setSourceNotice(`${copy.length ? COPY_FALLBACK_NOTICE : DEMO_TICKETS_NOTICE} Motivo: ${reason}`)
        } else {
          setSourceNotice(null)
          setError(reason)
        }
      } finally {
        if (inflight.get(key) === pending) inflight.delete(key)
        if (version === requestVersion.current) setLoading(false)
      }
    },
    [key, workshop, range.from, range.to],
  )

  useEffect(() => {
    void load()
    return () => { requestVersion.current++ }
  }, [load])

  // El dashboard depende de estas funciones en sus efectos de actualización.
  // Su identidad no debe cambiar al recibir datos o cambiar loading/error.
  const refresh = useCallback(() => load(true), [load])
  const refreshSilent = useCallback(() => load(false, true), [load])

  useEffect(() => {
    const onPatch = (event: Event) => {
      const detail = (event as CustomEvent<{ idpeticion?: string; patch?: Partial<PeticionPendiente> }>).detail
      if (!detail?.idpeticion || !detail.patch) return
      const apply = (rows: PeticionPendiente[]) =>
        rows.map((row) => (row.idpeticion === detail.idpeticion ? { ...row, ...detail.patch } : row))
      setItems((prev) => apply(prev))
      const entry = cache.get(key)
      if (entry) cache.set(key, { ...entry, items: apply(entry.items) })
    }
    window.addEventListener(PETICIONES_PATCHED_EVENT, onPatch)
    return () => window.removeEventListener(PETICIONES_PATCHED_EVENT, onPatch)
  }, [key])

  return useMemo(
    () => ({
      items,
      tipos,
      loading,
      error,
      sourceNotice,
      refresh,
      refreshSilent,
    }),
    [items, tipos, loading, error, sourceNotice, refresh, refreshSilent],
  )
}
