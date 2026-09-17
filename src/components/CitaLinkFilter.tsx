import { CITA_LINK_OPTIONS, type CitaLinkFilter } from '../lib/citaLinkFilter'
import FilterSelect from './FilterSelect'

type Props = {
  value: CitaLinkFilter
  onChange: (filter: CitaLinkFilter) => void
  label?: string
}

export default function CitaLinkFilter({ value, onChange, label = 'Cita' }: Props) {
  return <FilterSelect label={label} value={value} options={CITA_LINK_OPTIONS} onChange={onChange} />
}
