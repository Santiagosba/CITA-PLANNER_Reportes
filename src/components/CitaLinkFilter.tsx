import { CITA_LINK_OPTIONS, type CitaLinkFilter } from '../lib/citaLinkFilter'

type Props = {
  value: CitaLinkFilter
  onChange: (filter: CitaLinkFilter) => void
  label?: string
}

export default function CitaLinkFilter({ value, onChange, label = 'Cita' }: Props) {
  return (
    <div className="filter-field cita-link-filter">
      <span className="filter-field-label">{label}</span>
      <div className="estado-filter" role="group" aria-label={label}>
        {CITA_LINK_OPTIONS.map((option) => (
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
