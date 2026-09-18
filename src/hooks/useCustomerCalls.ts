import { useCallback, useEffect, useRef, useState } from 'react'
import { CrmApiError, fetchCustomerCalls, isCrmApiConfigured, type CustomerCallItem } from '../lib/crmApi'
import { phoneTail, useSoftphone } from '../lib/softphone'

type State = {
  items: CustomerCallItem[]
  loading: boolean
  error: string | null
}

function uniquePhones(input: string | string[] | null | undefined): string[] {
  const raw = Array.isArray(input) ? input : [input]
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of raw) {
    const phone = String(value || '').trim()
    const tail = phoneTail(phone)
    if (!phone || tail.length < 6 || seen.has(tail)) continue
    seen.add(tail)
    out.push(phone)
  }
  return out
}

function mergeCallItems(batches: CustomerCallItem[][]): CustomerCallItem[] {
  const seen = new Set<string>()
  const items: CustomerCallItem[] = []
  for (const batch of batches) {
    for (const item of batch) {
      if (!item?.id || seen.has(item.id)) continue
      seen.add(item.id)
      items.push(item)
    }
  }
  items.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
  return items
}

/**
 * Llamadas registradas en api-crm con uno o varios teléfonos del mismo cliente.
 * Se refresca sola cuando el softphone termina una llamada a alguno de esos
 * números (la grabación llega unos segundos después del colgado, por eso
 * reintenta una vez).
 */
export function useCustomerCalls(phone: string | string[] | null | undefined) {
  const phones = uniquePhones(phone)
  const phoneKey = phones.map((value) => phoneTail(value)).join('|')
  const enabled = Boolean(phoneKey) && isCrmApiConfigured()
  const { lastCall } = useSoftphone()
  const [state, setState] = useState<State>({ items: [], loading: enabled, error: null })
  const phonesRef = useRef(phones)
  phonesRef.current = phones

  const load = useCallback(async () => {
    const nextPhones = phonesRef.current
    if (!nextPhones.length || !isCrmApiConfigured()) return
    setState((prev) => ({ ...prev, loading: true, error: null }))
    try {
      const batches = await Promise.all(nextPhones.map((value) => fetchCustomerCalls(value)))
      setState({ items: mergeCallItems(batches), loading: false, error: null })
    } catch (e) {
      setState({
        items: [],
        loading: false,
        error: e instanceof CrmApiError ? e.message : 'No se pudo cargar el historial del cliente.',
      })
    }
  }, [phoneKey])

  useEffect(() => {
    void load()
  }, [load])

  const lastEnded =
    lastCall && phones.some((value) => phoneTail(lastCall.number) === phoneTail(value)) ? lastCall.endedAt : 0
  const seenRef = useRef(0)
  const retryRef = useRef(0)
  useEffect(() => {
    if (!lastEnded || lastEnded === seenRef.current) return
    seenRef.current = lastEnded
    void load()
    window.clearTimeout(retryRef.current)
    retryRef.current = window.setTimeout(() => void load(), 12000)
  }, [lastEnded, load])
  useEffect(() => () => window.clearTimeout(retryRef.current), [])

  return { ...state, enabled, refresh: load }
}
