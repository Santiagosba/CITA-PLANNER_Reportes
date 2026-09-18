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
import { isExpectedDemoIdError } from '../lib/crmUuid'
import { DEMO_TICKETS_NOTICE, isDemoTicketId, mergeLiveAndDemoTickets } from '../lib/demoTickets'
import { isLocalPreviewWorkshop } from '../lib/localPreview'
import { PETICIONES_PATCHED_EVENT } from '../lib/ticketOps'
import { matchesTicketCenter } from '../lib/activeCenter'
import { withLoadDeadline } from '../lib/loadDeadline'
import { boundedDateRange } from '../lib/dateRangePresets'
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

const CACHE_TTL = 120_000
const cache = new Map<string, CacheEntry>()
const inflight = new Map<string, Promise<CacheEntry>>()

function seedItems(workshop: Workshop, range: DateRange, cached?: CacheEntry): PeticionPendiente[] {
  if (cached?.items.length) return cached.items
  const bounded = boundedDateRange(range)
  const copy = (loadPeticionesCopy(workshopCopyId(workshop)) ?? []).filter((row) => rowInRange(row, bounded))
  return mergeLiveAndDemoTickets(copy, workshop, bounded)
}

export function findCachedPeticion(idpeticion: string): PeticionPendiente | null {
  for (const entry of cache.values()) {
    const hit = entry.items.find((row) => row.idpeticion === idpeticion)
    if (hit) return hit
  }
  return null
}

export function findCachedPeticiones(): PeticionPendiente[] {
  const found = new Map<string, PeticionPendiente>()
  for (const entry of cache.values()) {
    for (const row of entry.items) found.set(row.idpeticion, row)
  }
  return [...found.values()]
}

function workshopKey(workshop: Workshop): string {
  return `${String(workshop.originalId || '')}|${String(workshop.containerIdTaller || '')}`
}

function requestKey(workshop: Workshop, range: DateRange): string {
  const bounded = boundedDateRange(range)
  return `${workshopKey(workshop)}|${bounded.from}|${bounded.to}`
}

function rowInRange(item: PeticionPendiente, range: { from: string; to: string }): boolean {
  const key = String(item.fechainicio || item.fechacreacion || '').slice(0, 10)
  if (!key) return false
  return key >= range.from && key <= range.to
}

async function fetchData(workshop: Workshop, range: DateRange): Promise<CacheEntry> {
  range = boundedDateRange(range)
  if (isLocalPreviewWorkshop(workshop)) {
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
  const [items, setItems] = useState<PeticionPendiente[]>(() => seedItems(workshop, range, cached))
  const [tipos, setTipos] = useState<TipoPeticionRow[]>(cached?.tipos ?? [])
  const [loading, setLoading] = useState(() => !cached && seedItems(workshop, range).length === 0)
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

      const haveVisible =
        Boolean(cache.get(key)?.items.length) || seedItems(workshop, range, cache.get(key)).length > 0
      if (!silent && !haveVisible) setLoading(true)
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
        setSourceNotice(
          isLocalPreviewWorkshop(workshop)
            ? null
            : [apiNotice, hasDemo ? DEMO_TICKETS_NOTICE : null].filter(Boolean).join(' ') || null,
        )
        savePeticionesCopy(workshopCopyId(workshop), liveOnly)
        applyNames(data)
      } catch (e) {
        if (version !== requestVersion.current) return
        const reason = e instanceof Error ? e.message : 'No se pudieron cargar los datos actualizados.'
        const bounded = boundedDateRange(range)
        const copy = (loadPeticionesCopy(workshopCopyId(workshop)) ?? []).filter((row) =>
          rowInRange(row, bounded),
        )
        const merged = mergeLiveAndDemoTickets(copy, workshop, bounded)
        if (merged.length) {
          setItems(merged)
          setError(null)
          if (isLocalPreviewWorkshop(workshop) || isExpectedDemoIdError(reason)) {
            setSourceNotice(isLocalPreviewWorkshop(workshop) ? null : DEMO_TICKETS_NOTICE)
          } else {
            setSourceNotice(`${copy.length ? COPY_FALLBACK_NOTICE : DEMO_TICKETS_NOTICE} Motivo: ${reason}`)
          }
        } else if (isLocalPreviewWorkshop(workshop) || isExpectedDemoIdError(reason)) {
          setItems([])
          setSourceNotice(null)
          setError(null)
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
  const refreshLive = useCallback(() => load(true, true), [load])

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

  const visibleItems = useMemo(
    () => items.filter((item) => matchesTicketCenter(item, workshop)),
    [items, workshop],
  )

  return useMemo(
    () => ({
      items: visibleItems,
      tipos,
      loading,
      error,
      sourceNotice,
      refresh,
      refreshSilent,
      refreshLive,
    }),
    [visibleItems, tipos, loading, error, sourceNotice, refresh, refreshSilent, refreshLive],
  )
}
