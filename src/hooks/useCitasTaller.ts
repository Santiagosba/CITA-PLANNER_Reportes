import { useCallback, useEffect, useState } from 'react'
import { fetchCitasTaller, type CitaTaller } from '../lib/citasTaller'
import { isExpectedDemoIdError } from '../lib/crmUuid'
import { isDemoCitaId, mergeLiveAndDemoCitas } from '../lib/demoTickets'
import { isLocalPreviewWorkshop } from '../lib/localPreview'
import { loadCitasCopy, saveCitasCopy, workshopCopyId } from '../lib/workingCopy'
import type { Workshop } from '../types'

type Range = { from?: string; to?: string }
type CacheEntry = { timestamp: number; citas: CitaTaller[] }

const CACHE_TTL = 120_000
const cache = new Map<string, CacheEntry>()
const inflight = new Map<string, Promise<CitaTaller[]>>()

function seedCitas(workshop: Workshop, range: Range, cached?: CacheEntry): CitaTaller[] {
  if (cached?.citas.length) return cached.citas
  return mergeLiveAndDemoCitas(loadCitasCopy(workshopCopyId(workshop)) ?? [], workshop, range)
}

export function useCitasTaller(workshop: Workshop, range: Range) {
  const key = `${String(workshop.originalId)}|${range.from || ''}|${range.to || ''}`
  const cached = cache.get(key)
  const [citas, setCitas] = useState<CitaTaller[]>(() => seedCitas(workshop, range, cached))
  const [loading, setLoading] = useState(() => !cached && seedCitas(workshop, range).length === 0)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(
    async (force = false) => {
      const fresh = cache.get(key)
      if (!force && fresh && Date.now() - fresh.timestamp < CACHE_TTL) {
        setCitas(fresh.citas)
        setLoading(false)
        return
      }

      const haveVisible = Boolean(fresh?.citas.length) || seedCitas(workshop, range, fresh).length > 0
      if (!haveVisible) setLoading(true)
      setError(null)
      try {
        let request = inflight.get(key)
        if (!request || force) {
          request = fetchCitasTaller(workshop, range)
          inflight.set(key, request)
        }
        const rows = mergeLiveAndDemoCitas(await request, workshop, range)
        cache.set(key, { timestamp: Date.now(), citas: rows })
        setCitas(rows)
        saveCitasCopy(workshopCopyId(workshop), rows.filter((row) => !isDemoCitaId(row.idcita)))
      } catch (e) {
        const reason = e instanceof Error ? e.message : 'No se pudieron cargar las citas'
        const fallback = mergeLiveAndDemoCitas(
          isLocalPreviewWorkshop(workshop) || isExpectedDemoIdError(reason)
            ? []
            : loadCitasCopy(workshopCopyId(workshop)) ?? [],
          workshop,
          range,
        )
        if (fallback.length) {
          setCitas(fallback)
          setError(null)
          return
        }
        if (isLocalPreviewWorkshop(workshop) || isExpectedDemoIdError(reason)) {
          setCitas([])
          setError(null)
          return
        }
        setError(reason)
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

  return { citas, loading, error, refresh: () => load(true) }
}
