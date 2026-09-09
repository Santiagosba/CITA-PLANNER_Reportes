import { OWNER_SCOPE_OPTIONS, type OwnerScope } from '../lib/ownerScope'

type Props = {
  value: OwnerScope
  onChange: (scope: OwnerScope) => void
  label?: string
}

export default function OwnerScopeFilter({ value, onChange, label = 'Dueño' }: Props) {
  return (
    <div className="filter-field owner-scope-filter">
      <span className="filter-field-label">{label}</span>
      <div className="estado-filter" role="group" aria-label={label}>
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
