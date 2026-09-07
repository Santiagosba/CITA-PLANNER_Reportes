import { useCallback, useEffect, useRef, useState } from 'react'
import { CrmApiError, fetchCustomerCalls, isCrmApiConfigured, type CustomerCallItem } from '../lib/crmApi'
import { phoneTail, useSoftphone } from '../lib/softphone'

type State = {
  items: CustomerCallItem[]
  loading: boolean
  error: string | null
}

/**
 * Llamadas registradas en api-crm con un teléfono. Se refresca sola cuando el
 * softphone termina una llamada a ese número (la grabación llega unos segundos
 * después del colgado, por eso reintenta una vez).
 */
export function useCustomerCalls(phone: string | null | undefined) {
  const tail = phoneTail(phone)
  const enabled = Boolean(tail) && isCrmApiConfigured()
  const { lastCall } = useSoftphone()
  const [state, setState] = useState<State>({ items: [], loading: enabled, error: null })

  const load = useCallback(async () => {
    if (!enabled || !phone) return
    setState((prev) => ({ ...prev, loading: true, error: null }))
    try {
      const items = await fetchCustomerCalls(phone)
      setState({ items, loading: false, error: null })
    } catch (e) {
      setState({
        items: [],
        loading: false,
        error: e instanceof CrmApiError ? e.message : 'No se pudo cargar el historial de llamadas.',
      })
    }
  }, [enabled, phone])

  useEffect(() => {
    void load()
  }, [load])

  const lastEnded = lastCall && phoneTail(lastCall.number) === tail ? lastCall.endedAt : 0
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
