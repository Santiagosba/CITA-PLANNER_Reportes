import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, MapPin } from 'lucide-react'
import { ALL_CENTERS, canSwitchCenters, workshopCenters } from '../lib/activeCenter'
import type { Workshop } from '../types'

type Props = {
  workshop: Workshop
  onSelectCenter: (centerId: string | null) => void
  className?: string
}

export default function CenterSwitcher({ workshop, onSelectCenter, className = '' }: Props) {
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [keep, setKeep] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)
  const canSwitch = canSwitchCenters(workshop)
  const centers = workshopCenters(workshop)
  const value = workshop.centerId || ALL_CENTERS
  const options = [
    { id: ALL_CENTERS, label: 'Todos los centros' },
    ...centers.map((center) => ({ id: center.id, label: center.name })),
  ]
  const current = options.find((option) => option.id === value)?.label || 'Todos los centros'
  const showList = open || keep

  useEffect(() => {
    if (open) {
      setKeep(true)
      const frame = window.requestAnimationFrame(() => setExpanded(true))
      return () => window.cancelAnimationFrame(frame)
    }
    setExpanded(false)
    const timer = window.setTimeout(() => setKeep(false), 280)
    return () => window.clearTimeout(timer)
  }, [open])

  useEffect(() => {
    if (!open || !canSwitch) return
    const onPointer = (event: PointerEvent) => {
      if (boxRef.current?.contains(event.target as Node)) return
      setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, canSwitch])

  if (!canSwitch) return null

  const pick = (next: string) => {
    setOpen(false)
    onSelectCenter(next || null)
  }

  return (
    <div className={`mt-3 flex w-full min-w-0 flex-col gap-1.5 ${className}`}>
      <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-avi-muted">Centro</span>
      <div ref={boxRef} className="relative z-20 w-full min-w-0">
        <button
          type="button"
          className={`relative flex min-h-tap w-full items-center border border-avi-line bg-avi-surface-solid pl-8 pr-8 text-left text-sm font-semibold text-avi-fog-strong shadow-glass outline-none transition-[border-radius] duration-300 ease-avi focus-visible:shadow-focus-soft ${
            showList ? 'rounded-t-md rounded-b-none border-b-transparent' : 'rounded-md'
          }`}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={`Centro: ${current}`}
          title={current}
          onClick={() => setOpen((currentOpen) => !currentOpen)}
        >
          <MapPin
            size={16}
            className={`center-switch-pin pointer-events-none absolute left-2.5 text-avi-brand ${expanded ? 'is-open' : ''}`}
            aria-hidden
          />
          <span className="min-w-0 flex-1 truncate">{current}</span>
          <ChevronDown
            size={16}
            className={`pointer-events-none absolute right-2.5 text-avi-muted transition-transform duration-300 ease-avi ${
              expanded ? 'rotate-180' : ''
            }`}
            aria-hidden
          />
        </button>
        {showList ? (
          <div className={`center-switch-fold ${expanded ? 'is-open' : ''}`}>
            <div className="center-switch-fold-inner">
              <div
                className="flex w-full flex-col gap-0.5 rounded-b-md border border-t-0 border-avi-line bg-avi-surface-solid p-1.5 shadow-card"
                role="listbox"
                aria-label="Centro"
              >
                {options.map((option, index) => {
                  const active = option.id === value
                  return (
                    <button
                      key={option.id || 'all'}
                      type="button"
                      role="option"
                      aria-selected={active}
                      style={expanded ? { animationDelay: `${40 + index * 48}ms` } : undefined}
                      className={`${expanded ? 'center-switch-item' : ''} flex min-h-10 w-full items-center gap-2 rounded-xs px-2.5 text-left text-sm outline-none ${
                        active
                          ? 'bg-avi-brand-soft font-semibold text-avi-brand-strong'
                          : 'font-medium text-avi-fog-strong hover:bg-avi-brand-soft hover:text-avi-brand-strong'
                      }`}
                      onClick={() => pick(option.id)}
                    >
                      <span className="inline-flex w-4 shrink-0 justify-center text-avi-brand">
                        {active ? <Check size={15} strokeWidth={2.6} aria-hidden /> : null}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{option.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
