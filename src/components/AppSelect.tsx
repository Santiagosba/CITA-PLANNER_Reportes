import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from 'lucide-react'

export type AppSelectOption<T extends string = string> = {
  id: T
  label: string
}

let closeOpenSelect: (() => void) | null = null

type Props<T extends string> = {
  value: T
  options: AppSelectOption<T>[]
  onChange: (value: T) => void
  label?: string
  placeholder?: string
  emptyHint?: string
  className?: string
  disabled?: boolean
  id?: string
  required?: boolean
  variant?: 'inline' | 'field' | 'compact'
}

export default function AppSelect<T extends string>({
  value,
  options,
  onChange,
  label,
  placeholder = 'Elige una opción',
  emptyHint,
  className = '',
  disabled = false,
  id,
  required = false,
  variant = 'field',
}: Props<T>) {
  const reactId = useId()
  const triggerId = id || `app-select-${reactId}`
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ top: 0, left: 0, width: 280, maxH: 280 })

  const selected = options.find((option) => option.id === value)
  const display = selected?.label || placeholder
  const closeSelf = () => setOpen(false)

  useEffect(() => {
    if (!open) return
    const place = () => {
      const trigger = triggerRef.current
      if (!trigger) return
      const rect = trigger.getBoundingClientRect()
      const width = Math.min(window.innerWidth - 24, Math.max(rect.width, variant === 'compact' ? 220 : 260))
      const below = window.innerHeight - rect.bottom - 12
      const above = rect.top - 12
      const openUp = below < 180 && above > below
      const maxH = Math.min(320, Math.max(140, openUp ? above : below))
      const top = openUp ? Math.max(12, rect.top - maxH - 6) : rect.bottom + 6
      const left = Math.min(Math.max(12, rect.left), window.innerWidth - width - 12)
      setPos({ top, left, width, maxH })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, variant, options.length])

  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      const node = event.target as Node
      if (triggerRef.current?.contains(node) || menuRef.current?.contains(node)) return
      setOpen(false)
      if (closeOpenSelect === closeSelf) closeOpenSelect = null
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpen(false)
      if (closeOpenSelect === closeSelf) closeOpenSelect = null
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (options.length === 0) {
    return emptyHint ? <p className={`section-subtitle m-0 ${className}`}>{emptyHint}</p> : null
  }

  const pick = (next: T) => {
    setOpen(false)
    if (closeOpenSelect === closeSelf) closeOpenSelect = null
    if (next !== value) onChange(next)
  }

  const triggerClass =
    variant === 'inline'
      ? `relative inline-flex min-h-tap max-w-full shrink-0 items-center gap-2 rounded-md border border-avi-line bg-avi-surface-solid pl-3 pr-9 text-left shadow-glass ${className}`
      : variant === 'compact'
        ? `relative flex h-9 min-h-9 w-full min-w-0 items-center rounded-md border border-avi-line bg-avi-surface-solid px-3 pr-9 text-left text-sm font-semibold text-avi-fog-strong shadow-glass ${className}`
        : `relative flex min-h-tap w-full min-w-0 items-center rounded-md border border-avi-line bg-avi-surface-solid px-4 pr-11 text-left text-base font-semibold text-avi-fog-strong shadow-glass ${className}`

  const menu =
    open && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={menuRef}
            className="glass glass-lite squircle fixed z-[2500] box-border flex flex-col overflow-x-hidden overflow-y-auto border border-avi-line bg-avi-surface-solid p-1.5 shadow-card"
            role="listbox"
            aria-labelledby={triggerId}
            style={{ top: pos.top, left: pos.left, width: pos.width, maxHeight: pos.maxH }}
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
          >
            {options.map((option) => {
              const active = option.id === value
              return (
                <button
                  key={option.id || 'empty'}
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={`flex min-h-10 w-full min-w-0 items-center gap-2 rounded-xs px-2.5 text-left text-sm outline-none transition-colors ${
                    active
                      ? 'bg-avi-brand-soft font-semibold text-avi-brand-strong'
                      : 'font-medium text-avi-fog-strong hover:bg-avi-brand-soft hover:text-avi-brand-strong'
                  }`}
                  onClick={() => pick(option.id)}
                >
                  <span className="inline-flex w-4 shrink-0 justify-center text-avi-brand">
                    {active ? <Check size={15} strokeWidth={2.6} aria-hidden /> : null}
                  </span>
                  <span className="min-w-0 flex-1 truncate" title={option.label}>
                    {option.label}
                  </span>
                </button>
              )
            })}
          </div>,
          document.body,
        )
      : null

  const trigger = (
    <button
      ref={triggerRef}
      id={triggerId}
      type="button"
      className={`${triggerClass} ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'} ${
        open ? 'shadow-focus-soft' : ''
      }`}
      disabled={disabled}
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-label={label || display}
      aria-required={required || undefined}
      title={display}
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        if (disabled) return
        setOpen((current) => {
          const next = !current
          if (next) {
            if (closeOpenSelect && closeOpenSelect !== closeSelf) closeOpenSelect()
            closeOpenSelect = closeSelf
          } else if (closeOpenSelect === closeSelf) {
            closeOpenSelect = null
          }
          return next
        })
      }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {variant === 'inline' && label ? <span className="shrink-0 text-sm text-avi-muted">{label}</span> : null}
      <span
        className={`min-w-0 flex-1 truncate ${
          variant === 'inline'
            ? 'min-w-[7rem] py-2 text-sm font-semibold text-avi-fog-strong'
            : selected
              ? ''
              : 'font-medium text-avi-muted'
        }`}
      >
        {display}
      </span>
      <ChevronDown
        size={variant === 'compact' ? 15 : 16}
        className={`pointer-events-none absolute right-3 shrink-0 text-avi-muted transition-transform duration-base ease-avi ${
          open ? 'rotate-180' : ''
        }`}
        aria-hidden
      />
    </button>
  )

  if (variant === 'field' && label) {
    return (
      <div className="flex min-w-0 flex-col gap-2">
        <span className="text-sm font-semibold text-avi-fog-strong">{label}</span>
        {trigger}
        {menu}
      </div>
    )
  }

  return (
    <>
      {trigger}
      {menu}
    </>
  )
}
