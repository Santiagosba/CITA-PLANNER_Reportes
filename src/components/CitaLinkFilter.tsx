import { CITA_LINK_OPTIONS, type CitaLinkFilter } from '../lib/citaLinkFilter'

type Props = {
  value: CitaLinkFilter
  onChange: (filter: CitaLinkFilter) => void
  label?: string
}

export default function CitaLinkFilter({ value, onChange, label = 'Cita' }: Props) {
  return (
    <div className="filter-field cita-link-filter flex max-w-full flex-col justify-end gap-1.5">
      <span className="filter-field-label block min-h-[18px] text-[13px] font-semibold leading-tight text-avi-fog-strong">
        {label}
      </span>
      <div className="estado-filter inline-flex flex-wrap items-center gap-1.5" role="group" aria-label={label}>
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
