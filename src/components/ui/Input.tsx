import type { InputHTMLAttributes } from 'react'

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label?: string
  hint?: string
}

export default function Input({ label, hint, id, className = '', ...rest }: Props) {
  const inputId = id || rest.name
  return (
    <div>
      {label ? (
        <label htmlFor={inputId} className="field-label">
          {label}
        </label>
      ) : null}
      <input id={inputId} className={`field-input ${className}`.trim()} {...rest} />
      {hint ? <p className="mt-1.5 text-[var(--font-sm)] text-[var(--muted)]">{hint}</p> : null}
    </div>
  )
}
