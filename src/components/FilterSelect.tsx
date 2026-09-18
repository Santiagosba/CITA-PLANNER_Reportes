import AppSelect, { type AppSelectOption } from './AppSelect'

type Option<T extends string> = AppSelectOption<T>

type Props<T extends string> = {
  label: string
  value: T
  options: Option<T>[]
  onChange: (value: T) => void
  emptyHint?: string
  className?: string
}

export default function FilterSelect<T extends string>({
  label,
  value,
  options,
  onChange,
  emptyHint,
  className = '',
}: Props<T>) {
  return (
    <AppSelect
      variant="inline"
      label={label}
      value={value}
      options={options}
      onChange={onChange}
      emptyHint={emptyHint}
      className={className}
    />
  )
}
