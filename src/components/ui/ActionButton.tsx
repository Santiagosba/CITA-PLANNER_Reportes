import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Check } from 'lucide-react'
import HexLoader from './HexLoader'

export type ActionStatus = 'idle' | 'loading' | 'success' | 'error'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  status?: ActionStatus
  children: ReactNode
  successLabel?: string
  variant?: 'primary' | 'success' | 'secondary'
  fullWidth?: boolean
}

const variantClass: Record<NonNullable<Props['variant']>, string> = {
  primary: 'client-submit action-btn',
  success: 'client-submit action-btn todo-done-btn',
  secondary: 'ghost-button action-btn',
}

export default function ActionButton({
  status = 'idle',
  children,
  successLabel = 'Hecho',
  variant = 'primary',
  fullWidth,
  className = '',
  disabled,
  type = 'button',
  ...rest
}: Props) {
  const isBusy = status === 'loading' || status === 'success'
  const showSuccess = status === 'success'

  return (
    <button
      type={type}
      disabled={disabled || isBusy}
      aria-busy={status === 'loading'}
      aria-live="polite"
      className={`${variantClass[variant]} inline-flex items-center justify-center gap-2 ${fullWidth ? 'w-full-btn w-full' : ''} ${showSuccess ? 'is-success' : ''} ${status === 'loading' ? 'is-loading' : ''} ${className}`.trim()}
      {...rest}
    >
      <span className="action-btn-icon" aria-hidden>
        {status === 'loading' ? (
          <HexLoader size="sm" label="Guardando" />
        ) : showSuccess ? (
          <Check size={20} className="action-btn-check" />
        ) : null}
      </span>
      <span className="action-btn-label">{showSuccess ? successLabel : children}</span>
    </button>
  )
}
