type Option<T extends string> = {
  id: T
  label: string
}

type Props<T extends string> = {
  value: T
  options: readonly Option<T>[]
  onChange: (value: T) => void
  ariaLabel: string
  className?: string
}

export default function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  className = '',
}: Props<T>) {
  return (
    <div
      className={`inline-flex max-w-full flex-wrap rounded-pill border border-avi-line bg-avi-surface-solid p-1 shadow-glass ${className}`}
      role="group"
      aria-label={ariaLabel}
    >
      {options.map((option) => {
        const active = value === option.id
        return (
          <button
            key={option.id}
            type="button"
            className={`min-h-tap rounded-pill px-3.5 text-sm font-semibold transition-colors duration-fast ${
              active ? 'bg-avi-brand text-white shadow-brand' : 'text-avi-fog-strong hover:bg-avi-surface'
            }`}
            aria-pressed={active}
            onClick={() => onChange(option.id)}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
