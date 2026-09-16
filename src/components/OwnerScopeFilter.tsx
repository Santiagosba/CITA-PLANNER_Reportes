import { OWNER_SCOPE_OPTIONS, type OwnerScope } from '../lib/ownerScope'

type Props = {
  value: OwnerScope
  onChange: (scope: OwnerScope) => void
  label?: string
}

export default function OwnerScopeFilter({ value, onChange, label = 'Dueño' }: Props) {
  return (
    <div className="filter-field owner-scope-filter flex max-w-full flex-col justify-end gap-1.5">
      <span className="filter-field-label block min-h-[18px] text-[13px] font-semibold leading-tight text-avi-fog-strong">
        {label}
      </span>
      <div className="estado-filter inline-flex flex-wrap items-center gap-1.5" role="group" aria-label={label}>
        {OWNER_SCOPE_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            className={`preset-chip ${value === option.id ? 'is-active' : ''}`}
            onClick={() => onChange(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}
