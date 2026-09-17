import { ChevronDown } from 'lucide-react'

type Option<T extends string> = {
  id: T
  label: string
}

type Props<T extends string> = {
  label: string
  value: T
  options: Option<T>[]
  onChange: (value: T) => void
  emptyHint?: string
  className?: string
}

export default function FilterSelect<T extends string>({
  label,
  value,
  options,
  onChange,
  emptyHint,
  className = '',
}: Props<T>) {
  if (options.length === 0) {
    return emptyHint ? <p className={`section-subtitle m-0 ${className}`}>{emptyHint}</p> : null
  }

  return (
    <label
      className={`relative inline-flex min-h-tap max-w-full shrink-0 items-center gap-2 rounded-md border border-avi-line bg-avi-surface-solid pl-3 pr-9 shadow-glass ${className}`}
    >
      <span className="shrink-0 text-sm text-avi-muted">{label}</span>
      <select
        className="min-h-tap min-w-[7rem] cursor-pointer appearance-none border-0 bg-transparent py-2 text-sm font-semibold text-avi-fog-strong outline-none focus-visible:shadow-focus-soft"
        value={value}
        aria-label={label}
        onChange={(event) => onChange(event.target.value as T)}
      >
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown size={16} className="pointer-events-none absolute right-3 text-avi-muted" aria-hidden />
    </label>
  )
}
