import { useEffect, useMemo, useState } from 'react'
import { fetchMotivosCancelada, motivosCanceladaMap, type MotivoCanceladaRow } from '../lib/motivosCancelada'

let cached: MotivoCanceladaRow[] | null = null
let inflight: Promise<MotivoCanceladaRow[]> | null = null

async function loadCatalog(): Promise<MotivoCanceladaRow[]> {
  if (cached) return cached
  if (!inflight) {
    inflight = fetchMotivosCancelada()
      .then((rows) => {
        cached = rows
        return rows
      })
      .finally(() => {
        inflight = null
      })
  }
  return inflight
}

export function useMotivosCancelada() {
  const [rows, setRows] = useState<MotivoCanceladaRow[]>(cached ?? [])
  const [loading, setLoading] = useState(!cached)

  useEffect(() => {
    let alive = true
    void loadCatalog()
      .then((next) => {
        if (alive) setRows(next)
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [])

  const byId = useMemo(() => motivosCanceladaMap(rows), [rows])
  return { motivos: rows, byId, loading }
}
