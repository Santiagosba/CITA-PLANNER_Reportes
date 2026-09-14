import { useEffect, useState } from 'react'
import { fetchCallNotesByPhone } from '../lib/callCancelNotes'
import type { CallNotesByPhone } from '../lib/cancelMotiveFromSpeech'
import type { Workshop } from '../types'

type Range = { from?: string; to?: string }

const empty: CallNotesByPhone = new Map()

export function useCallCancelNotes(workshop: Workshop, range: Range) {
  const key = `${String(workshop.originalId)}|${range.from || ''}|${range.to || ''}`
  const [notesByPhone, setNotesByPhone] = useState<CallNotesByPhone>(empty)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setLoading(true)
    void fetchCallNotesByPhone(workshop, range)
      .then((next) => {
        if (alive) setNotesByPhone(next)
      })
      .catch(() => {
        if (alive) setNotesByPhone(empty)
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [key, workshop, range])

  return { notesByPhone, loading }
}
