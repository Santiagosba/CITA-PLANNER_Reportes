import { ESTADO_DONE_OPTIONS, type EstadoFilter } from '../lib/doneFilter'

type Props = {
  value: EstadoFilter
  onChange: (estado: EstadoFilter) => void
  label?: string
}

export default function EstadoDoneFilter({ value, onChange, label = 'Estado' }: Props) {
  return (
    <div className="filter-field">
      <span className="filter-field-label">{label}</span>
      <div className="estado-filter" role="group" aria-label={label}>
        {ESTADO_DONE_OPTIONS.map((option) => (
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
