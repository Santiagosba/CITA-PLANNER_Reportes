import { ESTADO_DONE_OPTIONS, type EstadoFilter } from '../lib/doneFilter'
import SegmentedControl from './SegmentedControl'

type Props = {
  value: EstadoFilter
  onChange: (estado: EstadoFilter) => void
  label?: string
}

export default function EstadoDoneFilter({ value, onChange, label = 'Qué ver' }: Props) {
  return (
    <SegmentedControl value={value} options={ESTADO_DONE_OPTIONS} onChange={onChange} ariaLabel={label} />
  )
}
