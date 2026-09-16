import { ESTADO_DONE_OPTIONS, type EstadoFilter } from '../lib/doneFilter'

type Props = {
  value: EstadoFilter
  onChange: (estado: EstadoFilter) => void
  label?: string
}

export default function EstadoDoneFilter({ value, onChange, label = 'Estado' }: Props) {
  return (
    <div className="filter-field flex max-w-full flex-col justify-end gap-1.5">
      <span className="filter-field-label block min-h-[18px] text-[13px] font-semibold leading-tight text-avi-fog-strong">
        {label}
      </span>
      <div className="estado-filter inline-flex flex-wrap items-center gap-1.5" role="group" aria-label={label}>
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
