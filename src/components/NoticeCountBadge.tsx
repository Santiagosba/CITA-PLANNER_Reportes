import { useEffect, useRef, useState } from 'react'

type Props = {
  count: number
  ready?: boolean
}

const MAX_LABEL = 99

export default function NoticeCountBadge({ count, ready = true }: Props) {
  const [shown, setShown] = useState(count)
  const [fresh, setFresh] = useState(false)
  const settled = useRef(false)
  const shownRef = useRef(count)

  useEffect(() => {
    shownRef.current = shown
  }, [shown])

  useEffect(() => {
    if (!ready) return

    if (!settled.current) {
      settled.current = true
      shownRef.current = count
      setShown(count)
      return
    }

    if (count <= shownRef.current) {
      shownRef.current = count
      setShown(count)
      setFresh(false)
      return
    }

    setFresh(true)
    const from = shownRef.current
    const gap = count - from
    const stepMs = gap > 12 ? 28 : gap > 4 ? 52 : 78
    let current = from
    let stepTimer = 0
    const tick = () => {
      current += 1
      shownRef.current = current
      setShown(current)
      if (current < count) stepTimer = window.setTimeout(tick, stepMs)
    }
    stepTimer = window.setTimeout(tick, 40)
    const calm = window.setTimeout(() => setFresh(false), 1400)
    return () => {
      window.clearTimeout(stepTimer)
      window.clearTimeout(calm)
    }
  }, [count, ready])

  if (shown <= 0) return null
  const label = shown > MAX_LABEL ? `${MAX_LABEL}+` : String(shown)

  return (
    <span className="pointer-events-none absolute -right-1.5 -top-1.5 z-[1] flex h-6 min-w-6 items-center justify-center" aria-hidden>
      <span
        className={`absolute inset-0 rounded-full bg-avi-danger/50 ${
          fresh ? 'animate-notice-ring' : 'animate-notice-glow'
        }`}
      />
      <span
        className={`relative inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-avi-danger px-1.5 text-2xs font-bold leading-none text-white shadow-[0_0_0_2px_var(--color-surface-solid)] ${
          fresh ? 'animate-notice-pop' : ''
        }`}
      >
        {label}
      </span>
    </span>
  )
}
