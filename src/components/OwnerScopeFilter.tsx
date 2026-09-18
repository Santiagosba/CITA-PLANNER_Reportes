import { OWNER_SCOPE_OPTIONS, type OwnerScope } from '../lib/ownerScope'
import FilterSelect from './FilterSelect'

type Props = {
  value: OwnerScope
  onChange: (scope: OwnerScope) => void
  label?: string
  className?: string
}

export default function OwnerScopeFilter({ value, onChange, label = 'Dueño', className = '' }: Props) {
  return (
    <FilterSelect
      label={label}
      value={value}
      options={OWNER_SCOPE_OPTIONS}
      onChange={onChange}
      className={className}
    />
  )
}
